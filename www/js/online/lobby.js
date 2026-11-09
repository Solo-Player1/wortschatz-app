// online/lobby.js — شاشة «العب مع صاحبك»: اختار لعبة والمصدر، اعمل غرفة (كود يتبعت لصاحبك) أو ادخل بكود،
// وبعد ما تتوصلوا تبدأ اللعبة على طول. net بتفضل مفتوحة طول الماتش.
import { el, esc, toast } from '../ui.js';
import { store } from '../store.js';
import { currentLesson, sortedLessonNs } from '../mastery.js';
import { shareText } from '../native.js';
import { connect, hasServer } from './net.js';
import { makeVs } from './engine2.js';
import { VS_GAMES, vsGame } from './index.js';
import { startPresence, stopPresence, onPresence } from './presence.js';

let net = null, vs = null, sel = null;   // sel = { game, pool, isHost }

function myName() { return (store.state.settings && store.state.settings.name || '').trim() || 'لاعب'; }
function cleanup() { stopPresence(); try { vs && vs.destroy(); } catch (e) { /* ignore */ } vs = null; try { net && net.close(); } catch (e) { /* ignore */ } net = null; }

// مؤشر حالة السيرفر + البنج (زي الألعاب الكبيرة): يتحدّث لوحده من presence
function connBadgeHtml() { return `<div class="vs-conn" id="vsConn" data-s="connecting"><span class="vs-conn-dot"></span><span class="vs-conn-txt">بنتأكد من السيرفر…</span></div>`; }
function wireConnBadge(root) {
  const b = root.querySelector('#vsConn'); if (!b) return;
  const dot = b.querySelector('.vs-conn-dot'), txt = b.querySelector('.vs-conn-txt');
  const off = onPresence(st => {
    if (!document.body.contains(b)) { off(); return; }
    let s = st.status, label;
    if (s === 'online') { label = `السيرفر جاهز · ${st.ms}ms`; b.dataset.s = st.ms < 300 ? 'online' : 'weak'; if (st.ms >= 300) label = `اتصال ضعيف · ${st.ms}ms`; }
    else if (s === 'weak') { label = `اتصال ضعيف · ${st.ms}ms`; b.dataset.s = 'weak'; }
    else if (s === 'noserver' || s === 'dropped') { label = 'مفيش اتصال بالسيرفر'; b.dataset.s = 'off'; }
    else { label = 'بنتأكد من السيرفر…'; b.dataset.s = 'connecting'; }
    txt.textContent = label;
  });
}

// أول ما نسيب #/vs نقفل الاتصال
if (typeof window !== 'undefined' && !window.__vsHook) {
  window.__vsHook = true;
  window.addEventListener('hashchange', () => { if (!(location.hash || '').startsWith('#/vs')) cleanup(); });
}

export function renderVs(root, params = {}) {
  cleanup();
  if (!hasServer() && !(store.state.settings && store.state.settings.wsUrl)) {
    // نجرب نجيب العنوان مرة؛ لو مفيش نوري رسالة
    root.innerHTML = `<section class="card"><div class="empty"><div class="big">🌐</div><h2>اللعب مع صاحبك</h2>
      <p class="hint">بنجهّز سيرفر اللعب… لو ما اشتغلش، تقدر تحط عنوانه من الإعدادات.</p></div>
      <a class="btn btn-primary btn-big" href="#/vs">جرّب تاني</a><a class="btn btn-ghost" href="#/settings">الإعدادات</a></section>`;
    // محاولة جلب العنوان في الخلفية
    import('./net.js').then(m => m.serverUrl()).then(u => { if (u && (location.hash || '').startsWith('#/vs')) renderVs(root, params); });
    return;
  }
  // لو جايين بكود جاهز (من لينك مشاركة)
  if (params.code) { sel = { game: params.game || 'duel', isHost: false, code: params.code }; return joinWithCode(root, params.code.toUpperCase(), params.game); }
  chooseGame(root);
}

function chooseGame(root) {
  const lesson = currentLesson();
  root.innerHTML = `
    <section class="card vs-hero"><div class="row"><span class="vs-hero-ico">⚔️</span>
      <div class="grow"><h1>العب مع صاحبك</h1><p class="hint">كل واحد من تليفونه. اعمل غرفة وابعت الكود لصاحبك، أو ادخل بكوده.</p></div></div>
      ${connBadgeHtml()}</section>
    <section class="card"><h2 class="sec-title">اختار اللعبة</h2>
      <div class="vs-grid">${VS_GAMES.map(g => `<button type="button" class="vs-card" data-g="${esc(g.meta.id)}">
        <span class="vs-card-ico">${g.meta.icon}</span><b>${esc(g.meta.title)}</b><span class="vs-card-desc">${esc(g.meta.short)}</span>
        ${g.meta.coop ? '<span class="chip blue vs-coop">تعاون</span>' : ''}</button>`).join('')}</div>
    </section>
    <section class="card"><h2 class="sec-title">تلعبوا على إيه؟</h2>
      <div class="seg vs-pool-seg" role="group">
        <button type="button" data-k="lesson" aria-pressed="true">درس</button>
        <button type="button" data-k="learned" aria-pressed="false">اللي ذاكرته</button>
        <button type="button" data-k="all" aria-pressed="false">كل الدروس</button></div>
      <select class="input vs-lesson" aria-label="الدرس">${sortedLessonNs().map(n => `<option value="${n}"${n === lesson ? ' selected' : ''}>الدرس ${n}</option>`).join('')}</select>
    </section>
    <div class="vs-start-wrap">
      <button type="button" class="btn btn-primary btn-big" id="vsHost" disabled>اعمل غرفة ⚔️</button>
      <button type="button" class="btn btn-big" id="vsJoinBtn" disabled>ادخل بكود صاحبك</button>
    </div>
    <p class="hint center vs-pick-hint">اختار لعبة الأول</p>`;

  startPresence(); wireConnBadge(root);   // اتصال دافئ + مؤشر البنج

  let game = null, poolKind = 'lesson';
  const poolSeg = root.querySelector('.vs-pool-seg'), lessonSel = root.querySelector('.vs-lesson');
  const hostBtn = root.querySelector('#vsHost'), joinBtn = root.querySelector('#vsJoinBtn');
  const refresh = () => { hostBtn.disabled = joinBtn.disabled = !game; root.querySelector('.vs-pick-hint').hidden = !!game; };

  root.querySelector('.vs-grid').addEventListener('click', e => {
    const b = e.target.closest('.vs-card'); if (!b) return;
    game = b.dataset.g;
    root.querySelectorAll('.vs-card').forEach(x => x.classList.toggle('on', x === b));
    refresh();
  });
  poolSeg.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; poolKind = b.dataset.k; poolSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); lessonSel.hidden = poolKind !== 'lesson'; });
  const pool = () => poolKind === 'lesson' ? { kind: 'lesson', lesson: +lessonSel.value || lesson } : { kind: poolKind };

  hostBtn.addEventListener('click', () => host(root, game, pool()));
  joinBtn.addEventListener('click', () => joinScreen(root, game, pool()));
}

// ---------- مضيف ----------
function host(root, game, pool) {
  net = connect();
  root.innerHTML = `<section class="card vs-room"><h2 class="sec-title">${esc(vsGame(game).meta.title)}</h2>
    <p class="hint">ابعت الكود ده لصاحبك، وأول ما يدخل تبدأ اللعبة:</p>
    <div class="vs-code" id="vsCode">····</div>
    <div class="grid2"><button type="button" class="btn" id="vsShare">ابعت الكود</button><button type="button" class="btn" id="vsCopy">انسخ</button></div>
    <p class="vs-room-status" id="vsStatus">بنوصّلك بالسيرفر…</p>
    <a class="btn btn-ghost" href="#/vs">إلغاء</a></section>`;
  const codeEl = root.querySelector('#vsCode'), statusEl = root.querySelector('#vsStatus');
  let code = '';
  net.on('status', s => { if (s === 'noserver') statusEl.textContent = 'مفيش سيرفر — حط عنوانه من الإعدادات'; else if (s === 'online' && !code) statusEl.textContent = 'بنعمل غرفة…'; else if (s === 'dropped' || s === 'error') statusEl.textContent = 'الاتصال وقع — جرّب تاني'; });
  net.on('room', m => { code = m.code; codeEl.textContent = code; statusEl.textContent = 'في انتظار صاحبك…'; });
  net.on('peer', m => { statusEl.textContent = `دخل ${m.name || 'صاحبك'} — يلا نبدأ!`; launch(root, game, pool, true, m.name); });
  root.querySelector('#vsShare').addEventListener('click', () => { if (code) shareText('العب معايا في Wortschatz', `العب معايا ألماني! افتح Wortschatz ← العب مع صاحبك ← ادخل بكود: ${code}`); });
  root.querySelector('#vsCopy').addEventListener('click', () => { if (!code) return; try { navigator.clipboard.writeText(code); toast('اتنسخ'); } catch (e) { toast(code); } });
  net.host(game, pool, myName());
}

// ---------- ضيف ----------
function joinScreen(root, game, pool) {
  root.innerHTML = `<section class="card vs-room"><h2 class="sec-title">ادخل بكود صاحبك</h2>
    <input class="input vs-code-in" id="vsCodeIn" type="text" inputmode="text" autocapitalize="characters" maxlength="4" placeholder="ABCD" dir="ltr">
    <button type="button" class="btn btn-primary btn-big" id="vsGo">يلا ندخل</button>
    <p class="vs-room-status" id="vsStatus"></p>
    <a class="btn btn-ghost" href="#/vs">رجوع</a></section>`;
  const inp = root.querySelector('#vsCodeIn'), statusEl = root.querySelector('#vsStatus');
  inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4); });
  setTimeout(() => inp.focus(), 60);
  root.querySelector('#vsGo').addEventListener('click', () => {
    const code = inp.value.trim().toUpperCase();
    if (code.length !== 4) { statusEl.textContent = 'الكود 4 حروف'; return; }
    joinWithCode(root, code, game, statusEl);
  });
}

function joinWithCode(root, code, game, statusEl) {
  net = connect();
  if (!statusEl) { root.innerHTML = `<section class="card vs-room"><h2 class="sec-title">بندخل الغرفة ${esc(code)}…</h2><p class="vs-room-status" id="vsStatus">بنوصّل…</p><a class="btn btn-ghost" href="#/vs">إلغاء</a></section>`; statusEl = root.querySelector('#vsStatus'); }
  net.on('status', s => { if (s === 'noserver') statusEl.textContent = 'مفيش سيرفر'; else if (s === 'dropped' || s === 'error') statusEl.textContent = 'الاتصال وقع'; });
  net.on('err', m => { statusEl.textContent = m.code === 'notfound' ? 'مفيش غرفة بالكود ده' : m.code === 'full' ? 'الغرفة مليانة' : 'مش قادر أدخل'; });
  net.on('joined', m => { launch(root, m.game || game, m.pool, false, m.peer); });
  net.join(code, myName());
}

// ---------- تشغيل اللعبة ----------
function launch(root, game, pool, isHost, peerName) {
  stopPresence();   // الماتش له اتصاله الخاص (ومؤشر بنج خاص) — نقفل الاتصال الدافئ
  const mod = vsGame(game); if (!mod) { toast('لعبة مش موجودة'); location.hash = '#/vs'; return; }
  try { vs && vs.destroy(); } catch (e) { /* ignore */ }
  const onExit = reason => {
    if (reason === 'quit') { location.hash = '#/vs'; return; }
    if (reason === 'rematch') { launch(root, game, pool, isHost, peerName); return; }
  };
  vs = makeVs(root, { meta: mod.meta, net, isHost, meName: myName(), peerName, pool, onExit });
  try { mod.start(vs); } catch (e) { console.error('[vs] start', e); vs.end({ win: null, msg: 'حصلت مشكلة' }); }
}
