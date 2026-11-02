// 🔤 الحروف المتلخبطة — معنى الكلمة بالعربي وحروفها متلخبطة: دوس على الحروف بالترتيب وكوّن الكلمة الألماني.
// 12 كلمة · أول ما الحروف تكمل بتتصحح لوحدها · 💡 بيحط الحرف الجاي بس النقط بتبقى النص · كل غلطة = قلب
import { injectCss } from './engine.js';
import { displayDe } from '../data.js';

const ROUNDS = 12;
const KINDS = ['noun', 'verb', 'word'];
const KIND_AR = { noun: 'اسم', verb: 'فعل', word: 'كلمة' };
// (etwas) / jemanden / mit jemandem … قبل الفعل — بنشيلهم ونسيب المصدر بس
const MARKERS = /^(?:(?:mit|bei|an|auf|für|über|von|zu)\s+)?(?:etwas|jemanden|jemandem|jemand|sich)(?:\/(?:etwas|jemanden|jemandem|jemand))?\s+(.+)$/i;

// الكلمة اللي بتترتّب: الاسم من غير أداة، الفعل من غير (etwas)/jemanden…، والباقي زي ما هو
export function solutionOf(w) {
  if (!w) return '';
  if (w.k === 'noun') return String(w.sg || '').trim();
  const base = displayDe(w);
  if (w.k === 'verb') { const m = base.match(MARKERS); return (m ? m[1] : base).trim(); }
  return base;
}
const okSolution = s => /^\p{L}{3,12}$/u.test(s);      // كلمة واحدة، حروف بس، من 3 لـ 12

// [{ w, s }] من غير تكرار (Frau/die Frau أو sprechen/mit jemandem sprechen = نفس الحروف)
export function scrambleItems(words) {
  const seen = new Set(), out = [];
  for (const w of words || []) {
    const s = solutionOf(w);
    const key = s.toLowerCase();
    if (!okSolution(s) || seen.has(key)) continue;
    seen.add(key);
    out.push({ w, s });
  }
  return out;
}
// البلاطات بحروف كبيرة — بس ß تفضل ß
export const upper = c => (c === 'ß' ? 'ß' : c.toLocaleUpperCase('de-DE'));
// درس واحد كلماته قليلة → نكمّل من الدروس اللي قبله لحد 12 · «اللي ذاكرته» = اللي ذاكره بس
const poolWords = pool => pool.words({ kinds: KINDS, min: pool.sel && pool.sel.kind === 'lesson' ? ROUNDS : 4 });
const poolItems = pool => scrambleItems(poolWords(pool));

export const meta = {
  id: 'scramble',
  title: 'الحروف المتلخبطة',
  icon: '🔤',
  short: 'رتّب الحروف وكوّن الكلمة',
  desc: 'هتشوف معنى الكلمة بالعربي وحروفها متلخبطة — رتّبها وكوّن الكلمة الألماني!',
  how: [
    'دوس على الحروف بالترتيب، ولو حطيت حرف غلط دوس عليه يرجع',
    'أول ما الحروف تكمل بتتصحح لوحدها — الغلط بقلب',
    '💡 بيحطلك الحرف الجاي بس النقط بتبقى النص',
  ],
  hearts: 3,
  kinds: KINDS,
  needAudio: false,
  minItems: 4,
  unit: 'كلمة',
  rounds: ROUNDS,
  count: pool => poolItems(pool).length,
};

const CSS = `
.gm-scramble-card { padding-top: 40px; }
.gm-scramble-kind { position: absolute; top: 10px; inset-inline-start: 10px; }
.gm-scramble-solved { font: 700 28px/1.3 var(--font-de); animation: gm-scramble-pop .3s ease-out; overflow-wrap: anywhere; }
@keyframes gm-scramble-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.gm-scramble-slots, .gm-scramble-bank { display: grid; grid-template-columns: repeat(var(--cols, 6), 48px); gap: 6px; justify-content: center; direction: ltr; }
.gm-scramble-slot, .gm-scramble-tile { width: 48px; height: 54px; padding: 0; border-radius: 12px; display: grid; place-items: center;
  font: 800 24px/1 var(--font-de); color: var(--ink); cursor: pointer; touch-action: manipulation; transition: transform .08s; }
.gm-scramble-slot { border: 2px solid var(--blue); background: var(--blue-tint); }
.gm-scramble-slot.empty { border: 2px dashed var(--line-strong); background: var(--surface-2); cursor: default; }
.gm-scramble-slot.hint { border-color: var(--warn); background: var(--warn-tint); color: var(--warn-text); cursor: default; }
.gm-scramble-slots.right .gm-scramble-slot { border: 2px solid var(--good); background: var(--good-tint); color: var(--good-text); }
.gm-scramble-slots.wrong .gm-scramble-slot { border: 2px solid var(--bad); background: var(--bad-tint); color: var(--bad-text); }
.gm-scramble-slots.wrong { animation: gm-shake .35s; }
.gm-scramble-tile { border: 1px solid var(--line-strong); border-bottom-width: 4px; background: var(--surface); box-shadow: var(--shadow); }
.gm-scramble-tile:active:not(:disabled) { transform: translateY(2px); border-bottom-width: 2px; }
.gm-scramble-tile.ghost { border: 2px dashed var(--line); background: transparent; box-shadow: none; }
.gm-scramble-slot:disabled, .gm-scramble-tile:disabled { cursor: default; }
.gm-scramble-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.gm-scramble-tools .btn { min-height: 50px; }
`;

export function start(g) {
  injectCss('scramble', CSS);
  window.scrollTo(0, 0);   // الإنجن مش بيرجّع الصفحة لفوق لما اللعبة تبدأ (لو كان نزل يدوس «يلا نلعب» / «كمان مرة»)
  const mine = it => !!g.lesson && (it.w.lessons || []).includes(g.lesson);
  const items = scrambleItems(g.shuffle(poolWords(g)));
  // كلمات الدرس المختار الأول، وبعدين الباقي
  const list = g.shuffle([...items.filter(mine), ...items.filter(it => !mine(it))].slice(0, ROUNDS));
  if (!list.length) { g.end({ win: true }); return; }

  let i = 0;
  let r = null;   // السؤال الحالي: { w, s, letters, order, slots, locked, hints, maxHints, done }
  const same = (k, p) => k !== null && r.letters[k].toLowerCase() === r.s[p].toLowerCase();

  const draw = () => {
    const placed = new Set(r.slots.filter(k => k !== null));
    g.stage.querySelector('.gm-scramble-slots').innerHTML = r.slots.map((k, p) => (k === null
      ? `<button type="button" class="gm-scramble-slot empty" data-p="${p}" aria-label="مكان فاضي" disabled></button>`
      : `<button type="button" class="gm-scramble-slot${r.locked.has(p) ? ' hint' : ''}" data-p="${p}"${r.locked.has(p) || r.done ? ' disabled' : ''} aria-label="رجّع ${g.esc(upper(r.letters[k]))}">${g.esc(upper(r.letters[k]))}</button>`)).join('');
    const bank = g.stage.querySelector('.gm-scramble-bank');
    bank.hidden = r.done;    // بعد التصحيح البنك كله فاضي — نخفيه
    bank.innerHTML = r.order.map(k => (placed.has(k)
      ? '<span class="gm-scramble-tile ghost" aria-hidden="true"></span>'
      : `<button type="button" class="gm-scramble-tile" data-k="${k}"${r.done ? ' disabled' : ''}>${g.esc(upper(r.letters[k]))}</button>`)).join('');
    const hb = g.stage.querySelector('.gm-scramble-hint');
    hb.textContent = `💡 حرف (${r.maxHints - r.hints})`;
    hb.disabled = r.done || r.hints >= r.maxHints;
    g.stage.querySelector('.gm-scramble-clear').disabled = r.done || !r.slots.some((k, p) => k !== null && !r.locked.has(p));
  };

  const next = () => {
    if (!g.alive) return;
    if (i >= list.length) { g.end({ win: true }); return; }
    const { w, s } = list[i++];
    g.setProgress(i - 1, list.length);
    const letters = [...s];
    let order = g.shuffle(letters.map((_, k) => k));
    // الخلط ما يطلعش هو نفس الكلمة
    const spelled = o => o.map(k => letters[k]).join('').toLowerCase();
    for (let t = 0; t < 20 && spelled(order) === s.toLowerCase() && new Set(s.toLowerCase()).size > 1; t++) order = g.shuffle(order);
    r = { w, s, letters, order, slots: letters.map(() => null), locked: new Set(), hints: 0, maxHints: Math.max(1, Math.floor(letters.length / 2)), done: false };
    const cols = letters.length <= 6 ? letters.length : Math.ceil(letters.length / 2);
    g.stage.innerHTML = `
      <div class="gm-q gm-scramble-card">
        <span class="chip gm-scramble-kind">${KIND_AR[w.k] || ''}</span>
        <p class="gm-ar">${g.esc(w.ar)}</p>
        <p class="hint center">${w.k === 'noun' ? 'رتّب الحروف — الاسم من غير der / die / das' : 'رتّب الحروف وكوّن الكلمة بالألماني'}</p>
        <p class="gm-scramble-solved" hidden></p>
      </div>
      <div class="de gm-scramble-slots" dir="ltr" lang="de" style="--cols:${cols}" aria-label="الكلمة"></div>
      <div class="de gm-scramble-bank" dir="ltr" lang="de" style="--cols:${cols}" aria-label="الحروف"></div>
      <div class="gm-scramble-tools">
        <button type="button" class="btn gm-scramble-hint"></button>
        <button type="button" class="btn gm-scramble-clear">↺ امسح</button>
      </div>`;
    draw();
  };

  const place = k => {
    const p = r.slots.indexOf(null);
    if (p < 0 || r.slots.includes(k)) return;
    r.slots[p] = k;
    draw();
    if (!r.slots.includes(null)) check();
  };
  const unplace = p => {
    if (r.locked.has(p) || r.slots[p] === null) return;
    r.slots[p] = null;
    draw();
  };
  const clearAll = () => {
    r.slots = r.slots.map((k, p) => (r.locked.has(p) ? k : null));
    draw();
  };
  // 💡 الحرف الجاي: أول مكان فاضي أو غلط بيتحط فيه الحرف الصح ويتقفل
  const hint = () => {
    if (r.hints >= r.maxHints) return;
    const n = r.letters.length;
    let p = 0;
    while (p < n && same(r.slots[p], p)) p++;
    if (p >= n) return;
    r.slots[p] = null;
    const want = r.s[p].toLowerCase();
    const placed = new Set(r.slots.filter(k => k !== null));
    let k = r.order.find(x => !placed.has(x) && r.letters[x].toLowerCase() === want);
    if (k === undefined) {
      // الحرف محطوط في مكان تاني غلط → ناخده من هناك
      const q = r.slots.findIndex((x, qq) => x !== null && !r.locked.has(qq) && r.letters[x].toLowerCase() === want && !same(x, qq));
      if (q < 0) return;
      k = r.slots[q];
      r.slots[q] = null;
    }
    r.slots[p] = k;
    r.locked.add(p);
    r.hints++;
    draw();
    if (!r.slots.includes(null)) check();
  };

  // ننتظر صوت الكلمة يخلص (بحد أقصى ms)
  const settle = (p, ms) => new Promise(res => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    Promise.resolve(p).then(fin, fin);
    g.after(ms, fin);
  });

  const check = async () => {
    r.done = true;
    const { w, s } = r;
    const built = r.slots.map(k => r.letters[k]).join('');
    const ok = built.toLowerCase() === s.toLowerCase();
    draw();
    g.stage.querySelector('.gm-scramble-slots').classList.add(ok ? 'right' : 'wrong');
    const solved = g.stage.querySelector('.gm-scramble-solved');
    solved.innerHTML = g.wordHtml(w);
    solved.hidden = false;
    const audio = g.say(w);
    let go;
    if (ok) {
      const [cont] = await Promise.all([g.correct({ points: r.hints ? 5 : 10, wordId: w.id }), settle(audio, 2200)]);
      go = cont;
    } else {
      go = await g.wrong({ wordId: w.id, correctHtml: g.wordHtml(w), label: `رتّبتها: ${[...built].map(upper).join('')}` });
    }
    if (go) next();
  };

  g.on(g.stage, 'click', e => {
    if (!r || r.done || !g.alive) return;
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.classList.contains('gm-scramble-tile')) place(+b.dataset.k);
    else if (b.classList.contains('gm-scramble-slot')) unplace(+b.dataset.p);
    else if (b.classList.contains('gm-scramble-hint')) hint();
    else if (b.classList.contains('gm-scramble-clear')) clearAll();
  });
  next();
}
