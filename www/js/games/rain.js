// 🌧️ مطر الكلمات — كلمات ألماني بتنزل من فوق؛ اختار معنى الكلمة اللي تحت خالص (عليها 🎯) قبل ما توصل للأرض.
// اختيار غلط = قلب، كلمة توصل للأرض = قلب. كل ما تفرقع كلمات أكتر المطر بيسرع. 25 كلمة = كسبت.
// الحركة بـ requestAnimationFrame + transform (ناعمة)، والوقت بيتحسب من الفريمات نفسها → لو الأبلكيشن راح في الخلفية اللعبة بتقف معاه.
import { injectCss } from './engine.js';
import { DATA, displayDe, audioUrl } from '../data.js';
import { normAr, normDe, sameWord } from '../exercises.js';
import { store } from '../store.js';

export const meta = {
  id: 'rain',
  title: 'مطر الكلمات',
  icon: '🌧️',
  short: 'فرقع الكلمة قبل ما توصل للأرض!',
  desc: 'كلمات ألماني بتنزل زي المطر — دوس على معنى الكلمة اللي تحت خالص قبل ما توقع. فرقع 25 كلمة وتكسب!',
  how: [
    'اختار معنى الكلمة اللي عليها 🎯 (أقرب واحدة للأرض)',
    'اختيار غلط = قلب، وكلمة توصل للأرض = قلب',
    'كل ما تفرقع كلمات أكتر المطر بيسرع 🌧️',
  ],
  hearts: 3,
  kinds: ['noun', 'verb', 'word', 'phrase'],
  minItems: 6,
  unit: 'كلمة',
};

const GOAL = 25;            // كلمات لازم تتفرقع
const SPAWN_EVERY = 2.5;    // ثانية بين كل كلمة والتانية
const FALL_START = 12;      // ثواني من فوق لتحت في الأول
const FALL_MIN = 7.5;       // أسرع حاجة
const FALL_STEP = 0.18;     // كل كلمة بتتفرقع بتسرّع المطر شوية
const SKY = 34, GROUND = 10;

const CSS = `
.gm-wrap[data-game="rain"] { padding-bottom: 122px; }   /* مكان شريط الإجابة الصح تحت الأزرار (حتى لو 3 سطور) */
.gm-rain { display: flex; flex-direction: column; gap: 10px; }
.gm-rain-arena { flex: none; min-height: 0; height: 55vh; height: clamp(220px, min(55vh, calc(100dvh - 368px)), 560px); touch-action: manipulation; -webkit-user-select: none; user-select: none; }
.gm-rain-sky { position: absolute; top: 0; left: 0; right: 0; height: ${SKY}px; z-index: 2; display: flex; justify-content: space-around; align-items: center; background: var(--surface-2); border-bottom: 1px dashed var(--line-strong); font-size: 20px; line-height: 1; pointer-events: none; }
.gm-rain-ground { position: absolute; left: 0; right: 0; bottom: 0; height: ${GROUND}px; z-index: 2; background: var(--bad-tint); border-top: 2px dashed var(--bad); pointer-events: none; }
.gm-rain-msg { position: absolute; left: 12px; right: 12px; top: 42%; z-index: 3; margin: 0; text-align: center; font: 700 16px/1.6 var(--font-head); color: var(--ink-2); pointer-events: none; animation: gm-rain-fade 3.4s forwards; }
@keyframes gm-rain-fade { 0%, 70% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
.gm-rain-word { position: absolute; top: 0; left: 0; z-index: 1; max-width: calc(100% - 12px); will-change: transform; pointer-events: none; }
.gm-rain-chip { position: relative; display: block; direction: ltr; padding: 6px 12px; border-radius: 12px; background: var(--surface); border: 2px solid var(--line-strong); box-shadow: var(--shadow); font: 700 19px/1.3 var(--font-de); color: var(--ink); overflow-wrap: anywhere; animation: gm-rain-appear .25s ease-out; }
@keyframes gm-rain-appear { from { opacity: 0; } to { opacity: 1; } }
.gm-rain-word.target { z-index: 1; }
.gm-rain-word.target .gm-rain-chip { border-color: var(--blue); background: var(--blue-tint); box-shadow: 0 0 0 3px var(--blue-tint), var(--shadow); }
.gm-rain-word.target .gm-rain-chip::after { content: '🎯'; position: absolute; top: -11px; left: -7px; font-size: 16px; line-height: 1; }
.gm-rain-chip.pop { animation: gm-rain-pop .36s ease-out forwards; border-color: var(--good) !important; background: var(--good-tint) !important; color: var(--good-text); }
@keyframes gm-rain-pop { 0% { transform: none; opacity: 1; } 40% { transform: scale(1.25); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }
.gm-rain-chip.splash { animation: gm-rain-splash .45s ease-in forwards; border-color: var(--bad) !important; background: var(--bad-tint) !important; color: var(--bad-text); }
@keyframes gm-rain-splash { 0% { transform: none; opacity: 1; } 35% { transform: scale(1.15, .8); } 100% { transform: scale(1.4, .3); opacity: 0; } }
.gm-rain-chip.pop::after, .gm-rain-chip.splash::after { display: none; }
.gm-rain-btns .gm-choice { min-height: 58px; padding: 8px 10px; font-size: 16.5px; line-height: 1.35; touch-action: manipulation; }
.gm-rain-btns.fresh .gm-choice { animation: gm-rain-in .2s ease-out; }
.gm-rain-btns .gm-choice.wrong { animation: gm-shake .35s; }
.gm-rain-btns .gm-choice:disabled:not(.wrong):not(.right) { opacity: .6; }
@keyframes gm-rain-in { from { opacity: .25; transform: translateY(4px); } to { opacity: 1; transform: none; } }
`;

export function start(g) {
  injectCss('rain', CSS);
  const all = g.words({ kinds: meta.kinds, min: meta.minItems }).filter(w => w && w.ar && displayDe(w));
  const short = all.filter(w => displayDe(w).length <= 20 && String(w.ar).length <= 26);
  const pool = short.length >= 6 ? short : all;
  if (pool.length < 4) { g.end({ win: true }); return; }

  g.stage.innerHTML = '';
  const box = g.el(`<div class="gm-rain">
    <div class="gm-arena gm-rain-arena">
      <div class="gm-rain-sky" aria-hidden="true"><span>☁️</span><span>🌧️</span><span>☁️</span><span>🌧️</span><span>☁️</span></div>
      <p class="gm-rain-msg">🎯 اختار معنى الكلمة اللي تحت خالص</p>
      <div class="gm-rain-ground" aria-hidden="true"></div>
    </div>
    <div class="gm-choices cols-2 gm-rain-btns">${'<button type="button" class="gm-choice" disabled>…</button>'.repeat(4)}</div>
  </div>`);
  g.stage.appendChild(box);
  const arena = box.querySelector('.gm-rain-arena'), btnBox = box.querySelector('.gm-rain-btns');
  const btns = [...btnBox.children];

  let H = 0, W = 0;
  const measure = () => { H = arena.clientHeight; W = arena.clientWidth; };
  measure();
  g.on(window, 'resize', measure);

  const words = [];          // اللي على الشاشة، الأقدم (الأوطى) الأول: { w, el, chip, y, h, wrongs }
  let target = null, locked = false, refreshT = null;
  let raf = 0, lastTs = 0, gameT = 0, lastSpawnT = 0.6, cleared = 0, over = false;
  g.setProgress(0, GOAL);

  // صوت الكلمة بعد ما تتفرقع (واطي) — لو أصوات الألعاب والتشغيل التلقائي مفتوحين
  const st = (store.state && store.state.settings) || {};
  const audioOn = st.gameSounds !== false && st.autoplay !== false;
  let au = null;
  const playQuiet = w => {
    if (!audioOn || !w.file) return;
    try {
      au = au || new Audio();
      au.volume = 0.35;
      au.src = audioUrl(w);
      const p = au.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* مش مهم */ }
  };
  const stopAll = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (au) { try { au.pause(); } catch (e) { /* ignore */ } }
  };
  g.onCleanup(stopAll);

  // ---------- الكلمات ----------
  let bag = [];
  const deKey = w => normDe(displayDe(w));
  function nextWord() {
    const onScreen = new Set(words.map(it => deKey(it.w)));
    for (let tries = 0; tries < 2; tries++) {
      if (!bag.length) bag = g.shuffle(pool);
      while (bag.length) { const w = bag.pop(); if (!onScreen.has(deKey(w))) return w; }
    }
    return null;
  }
  function spawn() {
    const w = nextWord();
    lastSpawnT = gameT;
    if (!w) return;
    const el = g.el(`<div class="gm-rain-word"><span class="gm-rain-chip">${g.wordHtml(w)}</span></div>`);
    el.style.transform = `translate3d(0,${-80}px,0)`;
    arena.appendChild(el);
    const h = el.offsetHeight, wd = el.offsetWidth;
    el.style.left = `${Math.round(6 + Math.random() * Math.max(0, W - wd - 12))}px`;
    const it = { w, el, chip: el.firstElementChild, y: SKY - Math.round(h / 2), h, wrongs: 0 };   // نصها طالع من تحت السحاب → باينة على طول
    el.style.transform = `translate3d(0,${it.y}px,0)`;
    words.push(it);
    if (!target && !locked) setTarget();
  }
  const removeWord = it => { const k = words.indexOf(it); if (k >= 0) words.splice(k, 1); };

  // ---------- أزرار المعاني ----------
  // 3 معاني غلط: من نفس النوع الأول، ومش معنى كلمة تانية على الشاشة، ومش معنى تاني لنفس الكلمة الألماني (sie = هي / هم)
  // ولا معنى قريب من الصح (لا، كلّا / لا، ليس · أب / بابا، أبي) — ده كان هيبقى صح برضه
  function wrongMeanings(w) {
    const myDe = deKey(w);
    const banned = new Set([normAr(w.ar)]);
    for (const it of words) if (it.w !== w) banned.add(normAr(it.w.ar));
    const out = [];
    const tryAdd = x => {
      if (!x || !x.ar || out.length >= 3) return;
      const a = normAr(x.ar);
      if (!a || banned.has(a) || deKey(x) === myDe || sameWord(x, w)) return;
      banned.add(a);
      out.push(x.ar);
    };
    for (const x of g.shuffle(pool.filter(x => x.k === w.k))) tryAdd(x);
    for (const x of g.shuffle(pool)) tryAdd(x);
    if (out.length < 3) for (const x of g.shuffle(DATA.words.filter(x => x && x.ar && String(x.ar).length <= 26))) tryAdd(x);
    return out;
  }
  function renderButtons() {
    const t = target;
    const opts = t ? g.shuffle([{ ar: t.w.ar, ok: true }, ...wrongMeanings(t.w).map(ar => ({ ar, ok: false }))]) : [];
    btns.forEach((b, k) => {
      const o = opts[k];
      b.className = 'gm-choice';
      b.disabled = !o;
      b.textContent = o ? o.ar : '…';
      b.dataset.ok = o && o.ok ? '1' : '';
    });
    btnBox.classList.remove('fresh');
    void btnBox.offsetWidth;
    if (t) btnBox.classList.add('fresh');
  }
  function setTarget() {
    const t = words[0] || null;
    if (target && target !== t && target.el) target.el.classList.remove('target');
    target = t;
    if (t) t.el.classList.add('target');
    renderButtons();
  }
  // الهدف اتغيّر: نقفل الأزرار لحظة (عشان مايدوسش على اختيار جديد بالغلط) وبعدين المعاني الجديدة
  function refreshSoon(ms) {
    locked = true;
    btns.forEach(b => { b.disabled = true; });
    if (target && target.el) target.el.classList.remove('target');
    target = null;
    if (refreshT) g.clear(refreshT);
    refreshT = g.after(ms, () => { refreshT = null; locked = false; if (!over) setTarget(); });
  }

  const answerHtml = w => `${g.wordHtml(w)} = ${g.esc(w.ar)}`;
  function finish() {
    over = true;
    stopAll();
    if (refreshT) { g.clear(refreshT); refreshT = null; }
    btns.forEach(b => { b.disabled = true; });
  }
  function pop(it, btn) {
    removeWord(it);
    btn.classList.add('right');
    it.chip.classList.add('pop');
    g.after(380, () => it.el.remove());
    cleared++;
    g.setProgress(cleared, GOAL);
    const points = it.wrongs ? 3 : it.y < H * 0.4 ? 15 : 10;     // بدري = نقط زيادة
    g.correct({ points, quiet: true });
    playQuiet(it.w);
    if (cleared >= GOAL) { finish(); g.after(450, () => g.end({ win: true })); return; }
    refreshSoon(220);
  }
  function wrongTap(it, btn) {
    btn.classList.add('wrong');
    btn.disabled = true;
    it.wrongs++;
    g.wrong({ wait: false, wordId: it.w.id, correctHtml: answerHtml(it.w), label: `اخترت: ${btn.textContent}` });
    if (g.hearts <= 0) finish();
  }
  function miss(it) {
    removeWord(it);
    it.chip.classList.add('splash');
    g.after(450, () => it.el.remove());
    g.wrong({ wait: false, wordId: it.w.id, correctHtml: answerHtml(it.w), label: 'وقعت على الأرض', msg: 'وقعت على الأرض! 💧' });
    if (g.hearts <= 0) { finish(); return; }
    if (it === target) refreshSoon(260);
  }

  g.on(btnBox, 'click', e => {
    const b = e.target.closest('.gm-choice');
    if (!b || b.disabled || over || locked || !g.alive || !target) return;
    if (b.dataset.ok === '1') pop(target, b); else wrongTap(target, b);
  });

  // ---------- اللوب ----------
  function frame(ts) {
    raf = 0;
    if (over || !g.alive) { stopAll(); return; }
    const dt = lastTs ? Math.min(0.05, Math.max(0, (ts - lastTs) / 1000)) : 0;   // بعد وقفة (الخلفية) مفيش قفزة
    lastTs = ts;
    gameT += dt;
    const fall = Math.max(FALL_MIN, FALL_START - FALL_STEP * cleared);
    const v = Math.max(60, H - SKY - GROUND) / fall;
    for (const it of words) { it.y += v * dt; it.el.style.transform = `translate3d(0,${it.y.toFixed(1)}px,0)`; }
    const low = words[0];
    if (low && low.y + low.h >= H - GROUND) miss(low);
    if (over || !g.alive) return;
    const cap = cleared >= 10 ? 4 : 3;
    const since = gameT - lastSpawnT;
    if (words.length < cap && (since >= SPAWN_EVERY || (!words.length && since >= 0.6))) {
      const top = words[words.length - 1];
      if (!top || top.y > SKY + top.h / 2 + 10) spawn();      // مفيش كلمتين فوق بعض
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}
