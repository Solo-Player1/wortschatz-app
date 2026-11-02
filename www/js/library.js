// المكتبة: امتحانات وشروحات (HTML جوه iframe) ومراجع PDF (عارض pdf.js محلي)
import { esc, toast } from './ui.js';

const JSON_URL = new URL('../data/library.json', import.meta.url);
const PDFJS_URL = new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url);
const WORKER_URL = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url);
const FONTS_URL = new URL('../vendor/pdfjs/standard_fonts/', import.meta.url);
const ZOOMS = [1, 1.5, 2, 2.5, 3];
const MAX_LIVE = 6;            // أقصى عدد صفحات مرسومة في نفس الوقت
const MAX_PIXELS = 4.5e6;      // أقصى حجم للكانفاس بالبكسل (ذاكرة الموبايل: ~18 ميجا للصفحة)
const PAGE_KEY = id => 'ws:lib:' + id;

let LIB = null;
let libPromise = null;
export function loadLibrary() {
  if (LIB) return Promise.resolve(LIB);
  if (!libPromise) libPromise = fetch(JSON_URL).then(r => { if (!r.ok) throw new Error('library.json ' + r.status); return r.json(); })
    .then(j => { LIB = j; return j; }).catch(e => { libPromise = null; throw e; });
  return libPromise;
}
export const libItem = id => (LIB && LIB.items.find(i => i.id === id)) || null;

const typeLabel = it => it.type === 'pdf' ? 'PDF' : (it.group === 'امتحانات' ? 'امتحان' : 'شرح');
const typeChipClass = it => it.type === 'pdf' ? 'warn' : (it.group === 'امتحانات' ? 'blue' : 'good');
const theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

function errorCard(msg, retry) {
  const d = document.createElement('div');
  d.className = 'empty';
  d.innerHTML = `<div class="big">📭</div><p>${esc(msg)}</p><p class="row" style="justify-content:center;margin-top:12px"><button class="btn lb-retry" type="button">جرّب تاني</button><a class="btn btn-ghost" href="#/library">المكتبة</a></p>`;
  d.querySelector('.lb-retry').addEventListener('click', retry);
  return d;
}

// كل render بياخد توكن: لو الراوت اتغير قبل ما الـ JSON يوصل ما نرسمش فوق شاشة تانية
let seq = 0;
const alive = (my, root) => my === seq && root.isConnected;

// ====================================================================
// قائمة المكتبة  #/library
// ====================================================================
export function renderLibrary(root) {
  const my = ++seq;
  const hash = location.hash;
  root.innerHTML = `<section class="card lb-intro"><span class="lb-big">📚</span><div class="grow"><h2>المكتبة</h2><p class="hint">امتحاناتك وشروحاتك كلها هنا — شغالة من غير نت.</p></div></section>
  <p class="muted center small">بحمّل المكتبة…</p>`;
  loadLibrary().then(lib => {
    if (!alive(my, root) || location.hash !== hash) return;
    const groups = lib.groups && lib.groups.length ? lib.groups : [...new Set(lib.items.map(i => i.group))];
    const sections = groups.map(g => {
      const items = lib.items.filter(i => i.group === g);
      if (!items.length) return '';
      return `<section class="lb-group"><h3 class="sec-title">${esc(g)}</h3><div class="list">${items.map(cardHtml).join('')}</div></section>`;
    }).join('');
    root.innerHTML = `<section class="card lb-intro"><span class="lb-big">📚</span><div class="grow"><h2>المكتبة</h2><p class="hint">${lib.items.length} ملفات: امتحانات وشروحات ومراجع — كلها شغالة من غير نت.</p></div></section>${sections}`;
  }).catch(e => {
    console.error('library: load failed', e);
    if (!alive(my, root)) return;
    root.innerHTML = '';
    root.appendChild(errorCard('مش قادر أحمّل قائمة المكتبة.', () => renderLibrary(root)));
  });
}

function cardHtml(it) {
  return `<a class="list-item link lb-item" href="#/lib/${encodeURIComponent(it.id)}" data-type="${esc(it.type)}">
    <span class="lb-ico" aria-hidden="true">${esc(it.icon || '📄')}</span>
    <div class="grow">
      <div class="lb-title">${esc(it.title)}</div>
      <div class="lb-sub">${esc(it.subtitle || '')}</div>
    </div>
    <span class="chip ${typeChipClass(it)}">${typeLabel(it)}</span>
  </a>`;
}

// ====================================================================
// شاشة العنصر  #/lib/:id  (immersive)
// ====================================================================
export function renderLibItem(root, { id } = {}) {
  const my = ++seq;
  id = decodeURIComponent(id || '');
  root.innerHTML = `<div class="lb-view"><div class="lb-top"><button class="btn btn-ghost lb-back" type="button">→ رجوع</button><h2></h2></div>
    <div class="lb-body"><div class="lb-loading"><span class="lb-spin"></span><span>بحمّل…</span></div></div></div>`;
  root.querySelector('.lb-back').addEventListener('click', goBack);
  loadLibrary().then(lib => {
    if (!alive(my, root)) return;
    const it = lib.items.find(i => i.id === id);
    const body = root.querySelector('.lb-body');
    if (!it) { body.innerHTML = ''; body.appendChild(errorCard('الملف ده مش موجود في المكتبة.', () => { location.hash = '#/library'; })); return; }
    root.querySelector('.lb-top h2').textContent = it.title;
    root.querySelector('.lb-top').insertAdjacentHTML('beforeend', `<span class="chip ${typeChipClass(it)}">${typeLabel(it)}</span>`);
    if (it.type === 'pdf') mountPdf(body, it, root);
    else mountFrame(body, it);
  }).catch(e => {
    console.error('library: load failed', e);
    if (!alive(my, root)) return;
    const body = root.querySelector('.lb-body'); body.innerHTML = '';
    body.appendChild(errorCard('مش قادر أحمّل المكتبة.', () => renderLibItem(root, { id })));
  });
}

function goBack() {
  // الرجوع الطبيعي لو جينا من جوه الأبلكيشن، وإلا للمكتبة
  if (history.length > 1) history.back();
  else location.hash = '#/library';
}

// ---------- HTML جوه iframe ----------
function mountFrame(body, it) {
  const f = document.createElement('iframe');
  f.className = 'lb-frame is-loading' + (it.group === 'شروحات' ? ' lb-paper' : '');
  f.title = it.title;
  f.src = it.file + (it.file.includes('?') ? '&' : '?') + 'theme=' + theme();
  const loader = body.querySelector('.lb-loading');
  let done = false;
  const ready = () => { if (done) return; done = true; f.classList.remove('is-loading'); if (loader) loader.remove(); };
  f.addEventListener('load', ready);
  f.addEventListener('error', () => { ready(); toast('مش قادر أفتح الملف'); });
  setTimeout(ready, 8000);   // لو الـ load ما وصلش لأي سبب ما نسيبش المؤشر للأبد
  body.appendChild(f);
}

// ---------- عارض PDF ----------
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import(PDFJS_URL.href).then(m => { m.GlobalWorkerOptions.workerSrc = WORKER_URL.href; return m; })
    .catch(e => { pdfjsPromise = null; throw e; });
  return pdfjsPromise;
}

function mountPdf(body, it, root) {
  const ctx = { dead: false, tasks: new Map(), doc: null, loadingTask: null, io: null, pages: [], zoomIdx: 0, cur: 1, saveT: 0 };
  body.insertAdjacentHTML('beforeend', `<div class="lb-pdf" hidden>
    <div class="lb-scroll"><div class="lb-pages"></div></div>
    <div class="lb-bar">
      <button class="btn btn-icon lb-zout" type="button" aria-label="تصغير">−</button>
      <span class="lb-zoom">100%</span>
      <button class="btn btn-icon lb-zin" type="button" aria-label="تكبير">+</button>
      <span class="lb-count" aria-live="polite">… / …</span>
    </div></div>`);
  const wrap = body.querySelector('.lb-pdf'), scroll = wrap.querySelector('.lb-scroll'), pagesEl = wrap.querySelector('.lb-pages');
  const countEl = wrap.querySelector('.lb-count'), zoomEl = wrap.querySelector('.lb-zoom');
  const zin = wrap.querySelector('.lb-zin'), zout = wrap.querySelector('.lb-zout');
  const loader = body.querySelector('.lb-loading');
  const fileUrl = new URL('../' + it.file, import.meta.url).href;

  // تنظيف لما نخرج من الشاشة (الراوتر بيفضّي الـ view)
  const teardown = () => {
    if (ctx.dead) return; ctx.dead = true;
    window.removeEventListener('hashchange', teardown);
    window.removeEventListener('resize', onResize);
    mo.disconnect();
    if (ctx.io) ctx.io.disconnect();
    for (const t of ctx.tasks.values()) { try { t.cancel(); } catch (e) {} }
    ctx.tasks.clear();
    // loadingTask.destroy() بيقفل المستند والـ worker مع بعض (مفيش doc.destroy في pdf.js 6)
    if (ctx.loadingTask) { try { const p = ctx.loadingTask.destroy(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    ctx.doc = null;
  };
  window.addEventListener('hashchange', teardown);
  const mo = new MutationObserver(() => { if (!wrap.isConnected) teardown(); });
  mo.observe(root, { childList: true });

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pad = 8;
  const fitWidth = () => Math.max(200, scroll.clientWidth - pad * 2);
  const cssScale = p => (fitWidth() / p.w) * ZOOMS[ctx.zoomIdx];

  function layout() {
    for (const p of ctx.pages) {
      const s = cssScale(p);
      p.cssW = Math.round(p.w * s); p.cssH = Math.round(p.h * s);
      p.el.style.width = p.cssW + 'px'; p.el.style.height = p.cssH + 'px';
      if (p.canvas) { p.canvas.style.width = p.cssW + 'px'; p.canvas.style.height = p.cssH + 'px'; }
    }
    zoomEl.textContent = Math.round(ZOOMS[ctx.zoomIdx] * 100) + '%';
    zout.disabled = ctx.zoomIdx === 0;
    zin.disabled = ctx.zoomIdx === ZOOMS.length - 1;
  }

  function release(p) {
    const t = ctx.tasks.get(p.n); if (t) { try { t.cancel(); } catch (e) {} ctx.tasks.delete(p.n); }
    if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; p.canvas.remove(); p.canvas = null; }
    p.el.classList.remove('is-rendered'); p.scale = 0;
  }

  function trimLive() {
    const live = ctx.pages.filter(p => p.canvas);
    if (live.length <= MAX_LIVE) return;
    live.sort((a, b) => Math.abs(b.n - ctx.cur) - Math.abs(a.n - ctx.cur));   // الأبعد أولاً
    for (const p of live.slice(0, live.length - MAX_LIVE)) if (Math.abs(p.n - ctx.cur) > 1) release(p);
  }

  async function render(p) {
    if (ctx.dead) return;
    const want = cssScale(p);
    if (p.scale === want && p.canvas) return;        // مرسومة بنفس المقياس
    if (ctx.tasks.has(p.n)) { if (p.pendingScale === want) return; try { ctx.tasks.get(p.n).cancel(); } catch (e) {} ctx.tasks.delete(p.n); }
    p.pendingScale = want;
    const out = Math.min(dpr, Math.sqrt(MAX_PIXELS / (p.cssW * p.cssH)) || 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(p.cssW * out); canvas.height = Math.round(p.cssH * out);
    canvas.style.width = p.cssW + 'px'; canvas.style.height = p.cssH + 'px';
    const vp = p.page.getViewport({ scale: want });
    const task = p.page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp, transform: out !== 1 ? [out, 0, 0, out, 0, 0] : null });
    ctx.tasks.set(p.n, task);
    try {
      await task.promise;
      if (ctx.dead || ctx.tasks.get(p.n) !== task) { canvas.width = 0; return; }
      if (p.canvas) { p.canvas.width = 0; p.canvas.remove(); }
      p.canvas = canvas; p.scale = want; p.el.appendChild(canvas); p.el.classList.add('is-rendered');
      trimLive();
    } catch (e) {
      if (!(e && e.name === 'RenderingCancelledException')) console.warn('pdf render failed', p.n, e);
      canvas.width = 0;
    } finally {
      if (ctx.tasks.get(p.n) === task) ctx.tasks.delete(p.n);
    }
  }

  function observe() {
    if (ctx.io) ctx.io.disconnect();
    ctx.io = new IntersectionObserver(entries => {
      for (const en of entries) {
        const p = ctx.pages[+en.target.dataset.n - 1];
        if (!p) continue;
        if (en.isIntersecting) render(p); else release(p);
      }
    }, { root: scroll, rootMargin: '120% 0px' });
    for (const p of ctx.pages) ctx.io.observe(p.el);
  }

  let scrollRaf = 0;
  function updateCounter() {
    const mid = scroll.scrollTop + scroll.clientHeight / 2;
    let cur = 1;
    for (const p of ctx.pages) { if (p.el.offsetTop <= mid) cur = p.n; else break; }
    if (cur !== ctx.cur) {
      ctx.cur = cur;
      countEl.textContent = `${cur} / ${ctx.pages.length}`;
      clearTimeout(ctx.saveT);
      ctx.saveT = setTimeout(() => { try { localStorage.setItem(PAGE_KEY(it.id), String(cur)); } catch (e) {} }, 300);
    }
  }
  scroll.addEventListener('scroll', () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updateCounter(); }); }, { passive: true });

  function gotoPage(n, frac = 0) {
    const p = ctx.pages[n - 1]; if (!p) return;
    scroll.scrollTop = p.el.offsetTop - pad + frac * p.cssH;
    scroll.scrollLeft = Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2);   // الصفحة في النص بعد الزوم
    updateCounter();
  }

  // إعادة التخطيط (زوم أو تغيير حجم) مع الحفاظ على مكان القراءة
  function relayout() {
    const p = ctx.pages[ctx.cur - 1];
    const frac = p ? Math.max(0, (scroll.scrollTop + pad - p.el.offsetTop) / p.cssH) : 0;
    for (const q of ctx.pages) release(q);
    layout();
    gotoPage(ctx.cur, frac);
    observe();
  }

  function setZoom(idx) {
    idx = Math.max(0, Math.min(ZOOMS.length - 1, idx));
    if (idx === ctx.zoomIdx) return;
    ctx.zoomIdx = idx;
    relayout();
  }
  zin.addEventListener('click', () => setZoom(ctx.zoomIdx + 1));
  zout.addEventListener('click', () => setZoom(ctx.zoomIdx - 1));

  let resizeT = 0;
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (!ctx.dead && ctx.pages.length) relayout(); }, 150);
  }
  window.addEventListener('resize', onResize);

  (async () => {
    try {
      const pdfjs = await loadPdfjs();
      if (ctx.dead) return;
      ctx.loadingTask = pdfjs.getDocument({ url: fileUrl, standardFontDataUrl: FONTS_URL.href });
      const doc = await ctx.loadingTask.promise;
      if (ctx.dead) { doc.destroy(); return; }
      ctx.doc = doc;
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (ctx.dead) return;
        const vp = page.getViewport({ scale: 1 });
        const el = document.createElement('div');
        el.className = 'lb-page'; el.dataset.n = n;
        el.innerHTML = `<span class="lb-pnum">${n}</span>`;
        pagesEl.appendChild(el);
        ctx.pages.push({ n, page, w: vp.width, h: vp.height, el, canvas: null, scale: 0, cssW: 0, cssH: 0 });
      }
      wrap.hidden = false;
      if (loader) loader.remove();
      layout();
      countEl.textContent = `1 / ${ctx.pages.length}`;
      let saved = 1;
      try { saved = Math.min(ctx.pages.length, Math.max(1, parseInt(localStorage.getItem(PAGE_KEY(it.id)) || '1', 10) || 1)); } catch (e) {}
      if (saved > 1) { gotoPage(saved); toast(`رجّعتك لصفحة ${saved}`); }
      observe();
    } catch (e) {
      if (ctx.dead) return;
      console.error('pdf: open failed', e);
      if (loader) loader.remove();
      wrap.remove();
      body.appendChild(errorCard('مش قادر أفتح ملف الـ PDF على الجهاز ده.', () => renderLibItem(root, { id: it.id })));
    }
  })();
}
