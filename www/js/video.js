// video.js — حلقات Nicos Weg لكل درس: شاشة الفيديو (#/video/:n) + الستريمنج + التنزيل على التليفون + قسم الإعدادات
// بيعتمد على native.js للوصول لـ Filesystem / FileTransfer؛ في المتصفح العادي بيشتغل ستريمنج بس
import { DATA, lessonOf, wordsOfLesson } from './data.js';
import { store } from './store.js';
import { el, esc, toast } from './ui.js';
import { isLearned } from './srs.js';
import { isNative, plugin, fileSrc } from './native.js';

const DIR = 'DATA';                 // Directory.Data
const FOLDER = 'videos';
const MB = 1048576;
const filePath = n => `${FOLDER}/L${n}.mp4`;

export const VIDEOS = { version: 0, source: '', list: [], byLesson: {} };
let loaded = false;
let loadPromise = null;

// ---------- الحالة المحفوظة (مع حماية لو store.js لسه ما فيهوش الحقول) ----------
const vids = () => (store.state.videos ||= {});
const settings = () => (store.state.settings ||= {});
const subOn = () => { const s = settings(); s.videoSub ??= true; return s.videoSub !== false; };

// ---------- إشعارات بسيطة للشاشات (progress / saved / deleted / bulk) ----------
const subs = new Set();
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(ev) { for (const fn of [...subs]) { try { fn(ev); } catch (e) { console.warn('[video] listener failed:', e); } } }

const active = new Map();           // n → { bytes, total } للتنزيلات الشغّالة
export const isDownloading = n => active.has(+n);
export const downloadProgress = n => active.get(+n) || null;

// ---------- تنسيق ----------
export function fmtMB(bytes) {
  const m = (+bytes || 0) / MB;
  if (m <= 0) return '0 ميجا';
  return `${m < 10 ? Math.round(m * 10) / 10 : Math.round(m)} ميجا`;
}
const approxMB = bytes => { const m = (+bytes || 0) / MB; return m >= 20 ? `~${Math.round(m / 10) * 10} ميجا` : fmtMB(bytes); };
export function fmtDur(sec) {
  sec = Math.max(0, Math.round(+sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function nEpisodes(n) {
  n = +n || 0;
  if (n === 0) return 'ولا حلقة';
  if (n === 1) return 'حلقة واحدة';
  if (n === 2) return 'حلقتين';
  if (n <= 10) return `${n} حلقات`;
  return `${n} حلقة`;
}
const errMsg = e => String((e && (e.message || e.code)) || e || '');

// ---------- تحميل videos.json (مرة واحدة) ----------
export function loadVideos() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const r = await fetch('data/videos.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('videos.json ' + r.status);
      const j = await r.json();
      VIDEOS.version = j.version || 0;
      VIDEOS.source = j.source || '';
      VIDEOS.list = (j.videos || []).filter(v => v && v.n > 0 && v.video && v.video.url).sort((a, b) => a.n - b.n);
      VIDEOS.byLesson = {};
      for (const v of VIDEOS.list) VIDEOS.byLesson[v.n] = v;
      loaded = true;
    } catch (e) {
      console.warn('[video] could not load videos.json:', errMsg(e));
      loadPromise = null;               // نسمح بمحاولة تانية
      return VIDEOS;
    }
    try { await syncDownloads(); } catch (e) { console.warn('[video] sync with filesystem failed:', errMsg(e)); }
    return VIDEOS;
  })();
  return loadPromise;
}
export const videosLoaded = () => loaded;
export const syncVideoFiles = () => syncDownloads().catch(e => console.warn('[video] sync failed:', errMsg(e)));
export const videoOf = n => VIDEOS.byLesson[+n];
export const isDownloaded = n => !!(vids()[+n] && vids()[+n].uri);
export function downloadedBytes() {
  let t = 0;
  for (const k of Object.keys(vids())) t += (+vids()[k].bytes || 0);
  return t;
}
export const downloadedCount = () => Object.keys(vids()).length;

// الدرس اللي المستخدم واقف عنده: أول درس فيه كلمات لسه ما اتعلمهاش (وإلا 1)
export function currentLessonN() {
  const lessons = DATA.lessons.slice().sort((a, b) => a.n - b.n);
  const cur = lessons.find(l => wordsOfLesson(l.n).some(w => !isLearned(w.id)));
  return cur ? cur.n : (lessons[0] ? lessons[0].n : 1);
}

// ---------- نظام الملفات ----------
const sizeOk = (size, expected) => (expected > 0 ? Math.abs(size - expected) <= expected * 0.01 : size > 1024);

async function safeDelete(FS, path) {
  try { await FS.deleteFile({ path, directory: DIR }); return true; }
  catch (e) { if (!/exist|not found|ENOENT/i.test(errMsg(e))) console.warn('[video] deleteFile failed:', errMsg(e)); return false; }
}

// مطابقة السجل المحفوظ مع الملفات الفعلية (لو السجل اتمسح أو ملف اتنزّل ناقص)
async function syncDownloads() {
  const FS = plugin('Filesystem');
  if (!isNative() || !FS || typeof FS.readdir !== 'function') return;
  let files;
  try {
    files = (await FS.readdir({ path: FOLDER, directory: DIR })).files || [];
  } catch (e) {
    if (!/exist|not found|ENOENT/i.test(errMsg(e))) return;   // خطأ مش مفهوم: ما نلمسش السجل
    files = [];
  }
  const seen = new Set();
  let changed = false;
  for (const f of files) {
    const m = /^L(\d+)\.mp4$/.exec(f.name || '');
    if (!m || (f.type && f.type !== 'file')) continue;
    const n = +m[1];
    const v = videoOf(n);
    const expected = v ? (+v.video.bytes || 0) : 0;
    const size = +f.size || 0;
    if (!v || !sizeOk(size, expected)) {                       // ملف ناقص/غريب → امسحه
      console.info('[video] removing stale file', f.name, size);
      await safeDelete(FS, filePath(n));
      continue;
    }
    seen.add(n);
    const rec = vids()[n];
    if (!rec || !rec.uri || rec.bytes !== size) {
      let uri = f.uri;
      if (!uri) { try { uri = (await FS.getUri({ path: filePath(n), directory: DIR })).uri; } catch (e) { continue; } }
      vids()[n] = { uri, bytes: size, date: rec && rec.date || (f.mtime ? +f.mtime : Date.now()) };
      changed = true;
    }
  }
  for (const k of Object.keys(vids())) if (!seen.has(+k)) { delete vids()[k]; changed = true; }
  if (changed) { store.save(); emit({ type: 'sync' }); }
}

// ---------- التنزيل (متسلسل: تنزيل واحد في نفس الوقت) ----------
let chain = Promise.resolve();
export function downloadVideo(n, onProgress) {
  const run = () => doDownload(+n, typeof onProgress === 'function' ? onProgress : () => {});
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

async function doDownload(n, onProgress) {
  const v = videoOf(n);
  if (!v) throw new Error('no video for lesson ' + n);
  if (isDownloaded(n)) return vids()[n];
  const FS = plugin('Filesystem'), FT = plugin('FileTransfer');
  if (!isNative() || !FS || !FT) throw new Error('download needs the Android app');

  const expected = +v.video.bytes || 0;
  const report = (bytes, total) => {
    active.set(n, { bytes, total });
    try { onProgress(bytes, total); } catch (e) { /* ignore */ }
    emit({ type: 'progress', n, bytes, total });
  };
  report(0, expected);
  const path = filePath(n);
  let handle = null;
  try {
    // 1) المجلد
    try { await FS.mkdir({ path: FOLDER, directory: DIR, recursive: true }); }
    catch (e) { if (!/exist/i.test(errMsg(e))) throw e; }
    // 2) الـ uri الكامل للملف
    const { uri } = await FS.getUri({ path, directory: DIR });
    // 3) التنزيل مع progress
    handle = await FT.addListener('progress', p => {
      if (!p || (p.type && p.type !== 'download')) return;
      if (p.url && p.url !== v.video.url) return;
      const total = (p.lengthComputable === false ? 0 : +p.contentLength) || expected;
      report(Math.max(0, +p.bytes || 0), total);
    });
    await FT.downloadFile({ url: v.video.url, path: uri, progress: true });
    // 4) التأكد من الحجم
    const st = await FS.stat({ path, directory: DIR });
    const size = +st.size || 0;
    if (!sizeOk(size, expected)) {
      await safeDelete(FS, path);
      throw new Error(`size mismatch for L${n}: got ${size}, expected ${expected}`);
    }
    // 5) السجل
    const rec = { uri: st.uri || uri, bytes: size, date: Date.now() };
    vids()[n] = rec;
    store.save();
    active.delete(n);
    try { onProgress(size, size); } catch (e) { /* ignore */ }
    emit({ type: 'saved', n });
    return rec;
  } catch (e) {
    active.delete(n);
    console.warn('[video] download failed L' + n + ':', errMsg(e));
    emit({ type: 'error', n, error: e });
    throw e;
  } finally {
    if (handle) { try { await handle.remove(); } catch (e) { /* ignore */ } }
  }
}

export async function deleteVideo(n) {
  n = +n;
  const FS = plugin('Filesystem');
  if (FS) await safeDelete(FS, filePath(n));
  const had = !!vids()[n];
  delete vids()[n];
  if (had) store.save();
  emit({ type: 'deleted', n });
  return had;
}

// ---------- التنزيل الجماعي (للإعدادات) ----------
const bulk = { active: false, cancel: false, n: 0, index: 0, total: 0, bytes: 0, totalBytes: 0 };
export const bulkState = () => ({ ...bulk });

export async function downloadAll(onProgress, shouldCancel) {
  onProgress = typeof onProgress === 'function' ? onProgress : () => {};
  shouldCancel = typeof shouldCancel === 'function' ? shouldCancel : () => false;
  await loadVideos();
  const res = { total: 0, done: 0, failed: [], cancelled: false, bytes: 0 };
  if (bulk.active) return res;                                // شغّال أصلاً
  const todo = VIDEOS.list.filter(v => !isDownloaded(v.n));
  res.total = todo.length;
  Object.assign(bulk, { active: true, cancel: false, n: 0, index: 0, total: todo.length, bytes: 0, totalBytes: todo.reduce((s, v) => s + (+v.video.bytes || 0), 0) });
  const tick = () => { onProgress({ ...bulk }); emit({ type: 'bulk', ...bulk }); };
  tick();
  let doneBytes = 0, consecutiveFails = 0;
  try {
    for (const v of todo) {
      if (bulk.cancel || shouldCancel()) { res.cancelled = true; break; }
      bulk.n = v.n;
      let cur = 0;
      try {
        await downloadVideo(v.n, b => { cur = Math.min(b, +v.video.bytes || b); bulk.bytes = doneBytes + cur; tick(); });
        res.done++;
        consecutiveFails = 0;
      } catch (e) {
        res.failed.push(v.n);
        if (++consecutiveFails >= 3) { console.warn('[video] 3 downloads failed in a row, stopping bulk download'); break; }
      }
      doneBytes += +v.video.bytes || cur;
      bulk.bytes = doneBytes;
      bulk.index++;
      tick();
    }
  } finally {
    res.bytes = doneBytes;
    bulk.active = false;
    bulk.cancel = false;
    tick();
  }
  return res;
}
export function cancelDownloadAll() { if (bulk.active) { bulk.cancel = true; emit({ type: 'bulk', ...bulk }); } }

export async function deleteAll() {
  let count = 0;
  for (const k of Object.keys(vids())) { if (await deleteVideo(+k)) count++; }
  return count;
}

// ====================================================================
// كروت التيزر (الدرس + الرئيسية) — بترجّع HTML، '' لو مفيش فيديو
// ====================================================================
export function videoTeaserHtml(n, { compact = false } = {}) {
  const v = videoOf(n);
  if (!v) return '';
  const saved = isDownloaded(n);
  const poster = esc(v.poster || '');
  if (compact) {
    return `<a class="card vd-teaser compact" href="#/video/${+n}" aria-label="حلقة الدرس ${+n}">
      <span class="vd-thumb">${poster ? `<img src="${poster}" alt="" loading="lazy">` : ''}<i class="vd-play sm">▶</i></span>
      <span class="grow"><b>حلقة الدرس ${+n}</b><span class="vd-teaser-sub"><bdi class="de">${esc(v.title || '')}</bdi> · <span class="n">${fmtDur(v.duration)}</span>${saved ? ' · محفوظة' : ''}</span></span>
      <span class="vd-chev" aria-hidden="true">‹</span></a>`;
  }
  return `<a class="card vd-teaser" href="#/video/${+n}" aria-label="اتفرج على حلقة الدرس ${+n}">
    <span class="vd-poster">${poster ? `<img src="${poster}" alt="" loading="lazy">` : ''}<i class="vd-play">▶</i><span class="vd-dur n">${fmtDur(v.duration)}</span></span>
    <span class="vd-teaser-row"><span class="grow"><b>اتفرج على الحلقة</b><span class="vd-teaser-sub"><bdi class="de">${esc(v.title || '')}</bdi>${saved ? ' · محفوظة على التليفون' : ' · أونلاين'}</span></span><span class="vd-chev" aria-hidden="true">‹</span></span></a>`;
}
export const homeVideoTeaserHtml = () => videoTeaserHtml(currentLessonN(), { compact: true });

// ====================================================================
// شاشة الفيديو  #/video/:n  (immersive)
// ====================================================================
let current = null;
window.addEventListener('hashchange', () => { if (current) { const c = current; current = null; c.destroy(); } });

function makeCtrl() {
  const cleanups = [];
  const ctrl = {
    alive: true,
    video: null,
    onCleanup(fn) { cleanups.push(fn); },
    destroy() {
      if (!ctrl.alive) return;
      ctrl.alive = false;
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (e) { /* ignore */ } }
      releaseVideo(ctrl.video);
      ctrl.video = null;
      if (current === ctrl) current = null;
    },
  };
  return ctrl;
}

// نوقف ونفرّغ عنصر الفيديو عشان ما يفضلش بيحمّل في الخلفية
function releaseVideo(video) {
  if (!video) return;
  try { video.pause(); } catch (e) { /* ignore */ }
  try { video.src = ''; video.load(); } catch (e) { /* ignore */ }
}

function emptyCard(icon, title, hint, n) {
  return `<section class="card vd-empty">
    <div class="empty"><div class="big">${icon}</div><h2>${esc(title)}</h2>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>
    <div class="vd-actions">
      <a class="btn btn-big btn-primary" href="${n ? `#/lesson/${n}` : '#/lessons'}">${n ? '⬅ الدرس' : 'اختار درس'}</a>
      <a class="btn btn-big" href="#/home">الرئيسية</a>
    </div></section>`;
}

export function renderVideo(root, { lesson } = {}) {
  const n = +lesson;
  if (current) current.destroy();
  const ctrl = makeCtrl();
  current = ctrl;
  root.innerHTML = '';
  if (!n) { root.innerHTML = emptyCard('🎬', 'مفيش فيديو للدرس ده', '', 0); return; }
  if (loaded) { buildVideoScreen(root, n, ctrl); return; }
  root.innerHTML = '<section class="card"><div class="empty"><div class="big">🎬</div><p>ثواني… بنحمّل بيانات الحلقة</p></div></section>';
  loadVideos().then(() => { if (ctrl.alive) { root.innerHTML = ''; buildVideoScreen(root, n, ctrl); } });
}

function buildVideoScreen(root, n, ctrl) {
  const v = videoOf(n);
  if (!v) { root.innerHTML = emptyCard('🎬', 'مفيش فيديو للدرس ده', 'الحلقات متاحة للدروس من 1 لـ 15.', lessonOf(n) ? n : 0); return; }
  const l = lessonOf(n);
  const native = isNative();
  const online = navigator.onLine !== false;
  const saved = isDownloaded(n);
  const expected = +v.video.bytes || 0;
  const prev = videoOf(n - 1), next = videoOf(n + 1);

  const wrap = el(`<div class="vd-wrap">
    <div class="vd-top">
      <a class="btn btn-icon vd-back" href="#/lesson/${n}" aria-label="رجوع للدرس">←</a>
      <h1 class="vd-title grow">فيديو الدرس <span class="n">${n}</span></h1>
      <span class="chip ${saved ? 'good' : 'blue'} vd-status" id="vdStatus">${saved ? 'محفوظ على التليفون' : 'بيتشغّل أونلاين'}</span>
    </div>
    <div class="vd-player" id="vdPlayer"></div>
    <section class="card vd-info">
      <h2><bdi class="de">${esc(v.title || '')}</bdi></h2>
      ${l ? `<p class="hint">الدرس ${n}${l.title && l.title !== v.title ? ` · <bdi class="de">${esc(l.title)}</bdi>` : ''}${l.goal ? ` — ${esc(l.goal)}` : ''}</p>` : ''}
      <div class="row wrap chips-row">
        <span class="chip">⏱ <span class="n">${fmtDur(v.duration)}</span></span>
        <span class="chip">${esc(fmtMB(expected))}</span>
        <span class="chip"><bdi class="de">DW · Nicos Weg</bdi></span>
      </div>
      ${v.vtt ? `<div class="setting-row vd-sub-row">
        <div><b>الترجمة الألمانية</b><p class="hint">تظهر الكلام المكتوب تحت الفيديو — تساعدك تربط الصوت بالكتابة</p></div>
        <label class="switch"><input type="checkbox" id="vdSub"${subOn() ? ' checked' : ''} aria-label="الترجمة الألمانية"><i></i></label>
      </div>` : ''}
    </section>
    <section class="card vd-store" id="vdStore"></section>
    <div class="vd-actions">
      <a class="btn btn-primary btn-big" href="#/session?lesson=${n}">ذاكر كلمات الدرس</a>
      <div class="grid2">
        <a class="btn" href="#/lesson/${n}">⬅ الدرس</a>
        <a class="btn" href="#/home">الرئيسية</a>
      </div>
      ${prev || next ? `<div class="grid2 vd-eps">
        ${prev ? `<a class="btn btn-ghost" href="#/video/${n - 1}">⏮ الحلقة ${n - 1}</a>` : '<span></span>'}
        ${next ? `<a class="btn btn-ghost" href="#/video/${n + 1}">الحلقة ${n + 1} ⏭</a>` : '<span></span>'}
      </div>` : ''}
    </div>
  </div>`);
  root.appendChild(wrap);

  const $ = sel => wrap.querySelector(sel);
  const player = $('#vdPlayer');
  const statusChip = $('#vdStatus');
  const storeCard = $('#vdStore');
  const setStatus = () => {
    const s = isDownloaded(n);
    statusChip.textContent = s ? 'محفوظ على التليفون' : 'بيتشغّل أونلاين';
    statusChip.classList.toggle('good', s);
    statusChip.classList.toggle('blue', !s);
  };

  // ---------- عنصر الفيديو ----------
  let video = null, trackEl = null, onError = null;
  const srcFor = () => (isDownloaded(n) ? fileSrc(vids()[n].uri) : v.video.url);
  const applySub = () => {
    if (!video) return;
    const t = video.textTracks && video.textTracks[0];
    if (t) t.mode = subOn() ? 'showing' : 'hidden';
  };
  const mountVideo = () => {
    player.innerHTML = '';
    video = el(`<video class="vd-video" controls playsinline preload="metadata"${v.poster ? ` poster="${esc(v.poster)}"` : ''} aria-label="حلقة الدرس ${n}"></video>`);
    video.setAttribute('webkit-playsinline', '');
    if (v.vtt) {
      trackEl = el(`<track kind="subtitles" srclang="de" label="Deutsch" src="${esc(v.vtt)}" default>`);
      video.appendChild(trackEl);
      trackEl.addEventListener('load', applySub);
    }
    video.src = srcFor();
    video.addEventListener('loadedmetadata', applySub);
    onError = () => {
      if (!ctrl.alive || !video || !video.getAttribute('src')) return;   // التفريغ عند الخروج مش خطأ
      console.warn('[video] playback error', video.error && video.error.code, video.currentSrc);
      toast('مش قادر أشغّل الفيديو');
      if (player.querySelector('.vd-err')) return;
      const err = el(`<div class="vd-err"><p>مش قادر أشغّل الفيديو${navigator.onLine === false ? ' — شكله مفيش نت' : ''}</p><button type="button" class="btn btn-primary">جرّب تاني</button></div>`);
      err.querySelector('button').addEventListener('click', () => { err.remove(); video.src = srcFor(); video.load(); applySub(); });
      player.appendChild(err);
    };
    video.addEventListener('error', onError);
    player.appendChild(video);
    ctrl.video = video;
    applySub();
  };
  const unmountVideo = () => {
    if (!video) return;
    if (onError) video.removeEventListener('error', onError);
    releaseVideo(video);
    ctrl.video = null;
    video = null; trackEl = null;
    player.innerHTML = '';
  };
  const mountOffline = () => {
    player.innerHTML = '';
    player.classList.add('is-empty');
    player.appendChild(el(`<div class="vd-offline"><div class="big">📡</div><p>مفيش نت، نزّل الحلقة الأول لما يبقى عندك واي‑فاي</p>${native ? '' : '<p class="hint">في المتصفح الحلقة بتتشغّل أونلاين بس.</p>'}</div>`));
  };
  // نقلّل مستوى الفيديو لما الصفحة تختفي (الأبلكيشن راح للخلفية)
  const onVis = () => { if (document.visibilityState === 'hidden' && video) { try { video.pause(); } catch (e) { /* ignore */ } } };
  document.addEventListener('visibilitychange', onVis);
  ctrl.onCleanup(() => document.removeEventListener('visibilitychange', onVis));

  if (saved || online) { player.classList.remove('is-empty'); mountVideo(); } else mountOffline();

  const onOnline = () => { if (!ctrl.alive) return; if (!video && (navigator.onLine !== false || isDownloaded(n))) { player.classList.remove('is-empty'); mountVideo(); } };
  window.addEventListener('online', onOnline);
  ctrl.onCleanup(() => window.removeEventListener('online', onOnline));

  // ---------- سويتش الترجمة ----------
  const subInput = $('#vdSub');
  if (subInput) subInput.addEventListener('change', () => {
    settings().videoSub = subInput.checked;
    store.save();
    applySub();
    toast(subInput.checked ? 'الترجمة الألمانية ظهرت' : 'الترجمة اتخفت');
  });

  // ---------- كارت الحفظ / التنزيل ----------
  let storeKey = '';
  const drawStore = (force = false) => {
    const s = isDownloaded(n);
    const dl = downloadProgress(n);
    const bulkRunning = bulk.active && !s;
    const key = `${native}|${s}|${!!dl}|${bulkRunning}|${navigator.onLine !== false}`;
    if (!force && key === storeKey) return;
    storeKey = key;
    if (!native) {
      storeCard.innerHTML = `<div class="row vd-store-row"><span class="vd-store-ico">🌐</span><div class="grow"><b>بيتشغّل أونلاين من DW</b><p class="hint">التنزيل متاح في أبلكيشن الأندرويد</p></div></div>`;
      return;
    }
    if (s) {
      const rec = vids()[n];
      storeCard.innerHTML = `<div class="row vd-store-row"><span class="vd-store-ico">📱</span><div class="grow"><b>محفوظ على التليفون</b><p class="hint">تتفرج عليه من غير نت · ${esc(fmtMB(rec.bytes))}</p></div></div>
        <button type="button" class="btn btn-danger btn-big" data-act="delete"><span class="vd-label">امسح الحلقة من التليفون <span class="vd-nowrap">(${esc(fmtMB(rec.bytes))})</span></span></button>`;
      return;
    }
    if (dl || bulkRunning) {
      const total = dl && dl.total ? dl.total : expected;
      const bytes = dl ? dl.bytes : 0;
      const pct = total > 0 ? Math.min(100, Math.round((100 * bytes) / total)) : 0;
      storeCard.innerHTML = `<div class="row vd-store-row"><span class="vd-store-ico">⬇</span><div class="grow"><b>${dl ? 'بينزّل الحلقة…' : 'في طابور التنزيل الجماعي…'}</b><p class="hint vd-progress-text">${dl ? `${pct}% · ${esc(fmtMB(bytes))} من ${esc(fmtMB(total))}` : 'هتبدأ بعد الحلقة اللي بتتنزّل دلوقتي'}</p></div></div>
        <div class="bar vd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
      return;
    }
    storeCard.innerHTML = `<div class="row vd-store-row"><span class="vd-store-ico">🌐</span><div class="grow"><b>بيتشغّل أونلاين من DW</b><p class="hint">احفظه على التليفون وتتفرج عليه في أي وقت من غير نت</p></div></div>
      <button type="button" class="btn btn-navy btn-big" data-act="download"${navigator.onLine === false ? ' disabled' : ''}><span class="vd-label">احفظه للمشاهدة من غير نت <span class="vd-nowrap">(${esc(fmtMB(expected))})</span></span></button>
      ${navigator.onLine === false ? '<p class="hint center">مفيش نت دلوقتي — جرّب لما يبقى عندك واي‑فاي</p>' : '<p class="hint center small">الأحسن على الواي‑فاي</p>'}`;
  };
  const updateBar = (bytes, total) => {
    const bar = storeCard.querySelector('.vd-bar'), txt = storeCard.querySelector('.vd-progress-text');
    if (!bar) { drawStore(); return; }
    const pct = total > 0 ? Math.min(100, Math.round((100 * bytes) / total)) : 0;
    bar.firstElementChild.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', pct);
    if (txt) txt.textContent = `${pct}% · ${fmtMB(bytes)} من ${fmtMB(total)}`;
  };
  storeCard.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'download') {
      b.disabled = true;
      try {
        await downloadVideo(n);
        if (!ctrl.alive) return;
        toast('الحلقة اتحفظت على التليفون');
        // لو الفيديو واقف من الأول نحوّله للنسخة المحفوظة
        if (video && video.paused && (video.currentTime || 0) < 1) { video.src = srcFor(); video.load(); applySub(); }
      } catch (err) {
        if (!ctrl.alive) return;
        toast(navigator.onLine === false ? 'مفيش نت — التنزيل ما كملش' : 'التنزيل ما كملش، جرّب تاني');
        drawStore(true);
      }
    } else if (b.dataset.act === 'delete') {
      if (!confirm('تمسح الحلقة من التليفون؟ تقدر تنزّلها تاني في أي وقت.')) return;
      b.disabled = true;
      const wasLocal = video && isDownloaded(n);
      try { await deleteVideo(n); } catch (err) { console.warn('[video] delete failed:', errMsg(err)); }
      if (!ctrl.alive) return;
      toast('اتمسحت من التليفون');
      if (wasLocal) {
        if (navigator.onLine !== false) { try { video.pause(); } catch (err) { /* ignore */ } video.src = srcFor(); video.load(); applySub(); }
        else { unmountVideo(); mountOffline(); }
      }
    }
  });
  drawStore();

  const off = onChange(ev => {
    if (!ctrl.alive) return;
    if (ev.type === 'progress' && ev.n === n) { updateBar(ev.bytes, ev.total); return; }
    if (ev.type === 'bulk' && !isDownloaded(n) && !isDownloading(n)) { drawStore(); return; }
    if (ev.n !== undefined && ev.n !== n) return;
    setStatus();
    drawStore();
  });
  ctrl.onCleanup(off);
}

// ====================================================================
// قسم «الفيديوهات» في الإعدادات — screens.js بينادي renderVideoSettings(containerEl)
// ====================================================================
export function renderVideoSettings(container) {
  if (!container) return;
  if (!loaded) {
    container.innerHTML = '<p class="hint">ثواني… بنحمّل بيانات الحلقات</p>';
    loadVideos().then(() => {
      if (!container.isConnected) return;
      if (loaded) renderVideoSettings(container);
      else container.innerHTML = '<p class="hint">مش قادر أحمّل بيانات الحلقات دلوقتي.</p>';
    });
    return;
  }
  const draw = () => {
    const total = VIDEOS.list.length;
    if (!isNative()) {
      container.innerHTML = `<p class="hint">حلقات Nicos Weg (${esc(nEpisodes(total))}) بتتشغّل أونلاين من كارت كل درس. التنزيل للمشاهدة من غير نت متاح في أبلكيشن الأندرويد.</p>`;
      return;
    }
    const savedN = downloadedCount();
    const savedBytes = downloadedBytes();
    const remaining = VIDEOS.list.filter(v => !isDownloaded(v.n));
    const remainingBytes = remaining.reduce((s, v) => s + (+v.video.bytes || 0), 0);
    let body = '';
    if (bulk.active) {
      const pct = bulk.totalBytes > 0 ? Math.min(100, Math.round((100 * bulk.bytes) / bulk.totalBytes)) : 0;
      body = `<div class="vd-progress">
        <div class="bar vd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
        <p class="hint vd-progress-text">${bulk.cancel ? 'هيتوقف بعد الحلقة الحالية…' : `بينزّل الحلقة ${bulk.n} · ${bulk.index + 1} من ${bulk.total} · ${pct}% (${esc(fmtMB(bulk.bytes))} من ${esc(fmtMB(bulk.totalBytes))})`}</p>
        <button type="button" class="btn" data-act="cancel"${bulk.cancel ? ' disabled' : ''}>إلغاء</button>
      </div>`;
    } else {
      body = remaining.length
        ? `<button type="button" class="btn btn-navy btn-big" data-act="all"${navigator.onLine === false ? ' disabled' : ''}><span class="vd-label">نزّل كل الحلقات <span class="vd-nowrap">(${esc(nEpisodes(remaining.length))} · ${esc(approxMB(remainingBytes))})</span> — على الواي‑فاي</span></button>`
        : '<p class="hint center">كل الحلقات محفوظة على التليفون</p>';
    }
    container.innerHTML = `<div class="vd-set">
      <p class="hint">الحلقات بتتشغّل أونلاين من DW. لو حفظتها على التليفون تتفرج عليها من غير نت.</p>
      <div class="row between vd-sum"><span>محفوظ على التليفون</span><b><span class="n">${savedN} / ${total}</span> · <span class="vd-sum-size">${esc(fmtMB(savedBytes))}</span></b></div>
      ${body}
      <button type="button" class="btn btn-danger btn-big" data-act="delall"${savedN && !bulk.active ? '' : ' disabled'}><span class="vd-label">امسح كل الفيديوهات المحفوظة <span class="vd-nowrap">(${esc(fmtMB(savedBytes))})</span></span></button>
    </div>`;
  };
  const updateBulk = () => {
    const bar = container.querySelector('.vd-bar'), txt = container.querySelector('.vd-progress-text'), cancel = container.querySelector('[data-act=cancel]');
    if (!bar || !bulk.active) { draw(); return; }
    const pct = bulk.totalBytes > 0 ? Math.min(100, Math.round((100 * bulk.bytes) / bulk.totalBytes)) : 0;
    bar.firstElementChild.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', pct);
    if (txt) txt.textContent = bulk.cancel ? 'هيتوقف بعد الحلقة الحالية…' : `بينزّل الحلقة ${bulk.n} · ${bulk.index + 1} من ${bulk.total} · ${pct}% (${fmtMB(bulk.bytes)} من ${fmtMB(bulk.totalBytes)})`;
    if (cancel) cancel.disabled = !!bulk.cancel;
    const frac = container.querySelector('.vd-sum .n'), size = container.querySelector('.vd-sum-size');
    if (frac) frac.textContent = `${downloadedCount()} / ${VIDEOS.list.length}`;
    if (size) size.textContent = fmtMB(downloadedBytes());
    const delSize = container.querySelector('[data-act=delall] .vd-nowrap');
    if (delSize) delSize.textContent = `(${fmtMB(downloadedBytes())})`;
  };
  draw();
  if (!container.dataset.vdBound) {
    container.dataset.vdBound = '1';
    container.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'all') {
        b.disabled = true;
        const res = await downloadAll();
        if (!container.isConnected) return;
        if (res.cancelled) toast(`وقفنا التنزيل — ${nEpisodes(res.done)} اتحفظت`);
        else if (res.failed.length) toast(res.done ? `اتحفظت ${nEpisodes(res.done)} و${nEpisodes(res.failed.length)} ما نزلتش` : 'التنزيل ما كملش — اتأكد من النت وجرّب تاني');
        else if (res.done) toast('كل الحلقات اتحفظت على التليفون');
        draw();
      } else if (b.dataset.act === 'cancel') {
        cancelDownloadAll();
        updateBulk();
      } else if (b.dataset.act === 'delall') {
        if (!confirm(`تمسح كل الحلقات المحفوظة (${fmtMB(downloadedBytes())}) من التليفون؟`)) return;
        b.disabled = true;
        const c = await deleteAll();
        if (!container.isConnected) return;
        toast(c ? `اتمسحت ${nEpisodes(c)}` : 'مفيش حاجة تتمسح');
        draw();
      }
    });
    const off = onChange(ev => {
      if (!container.isConnected) { off(); return; }
      if (ev.type === 'progress') return;                 // التفاصيل بتيجي مع حدث bulk
      if (bulk.active && container.querySelector('.vd-bar')) updateBulk(); else draw();   // أثناء التنزيل الجماعي: تحديث في مكانه من غير إعادة بناء
    });
  }
}

// نبدأ تحميل videos.json مع فتح الأبلكيشن (idempotent — app.js ممكن يستنّاه برضه)
loadVideos();
