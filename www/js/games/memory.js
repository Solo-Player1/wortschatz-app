// 🃏 لعبة الذاكرة — كروت مقلوبة: كارت بالكلمة الألماني وكارت بمعناها بالعربي. لوحتين: 6 أزواج (3 عواميد) وبعدين 8 (4 عواميد).
// 5 قلوب، والقلب بيروح بس على «غلطة ذاكرة»: قلبت كارت وكنت شفت الكارت بتاعه قبل كده وما جبتوش.
import { injectCss } from './engine.js';
import { displayDe } from '../data.js';
import { normDe, sameWord } from '../exercises.js';

const KINDS = ['noun', 'verb', 'word'];
const BOARDS = [{ pairs: 6, cols: 3 }, { pairs: 8, cols: 4 }];
const POOL_MIN = 14;
const FLIP_BACK_MS = 900;

const MARKERS = /^(?:(?:mit|bei|an|auf|für|über|von|zu)\s+)?(?:etwas|jemanden|jemandem|jemand|sich)(?:\/(?:etwas|jemanden|jemandem|jemand))?\s+(.+)$/i;
// أساس الكلمة الألماني — Frau / die Frau ما يبقوش في نفس اللوحة
function baseKey(w) {
  if (w.k === 'noun' && w.sg) return normDe(w.sg);
  const b = displayDe(w);
  const m = b.match(MARKERS);
  return normDe(m ? m[1] : b);
}
// معنيين قريبين (أنت / أنت، أنتم …، أب / بابا) ما ينفعوش في نفس اللوحة — هيلخبطوا (sameWord من exercises.js)

// المعنى اللي على الكارت: من غير الشرح اللي بين قوسين في الآخر
export const arShort = ar => String(ar || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').replace(/[\s،,]+$/, '').trim();
function fitsCard(w) {
  const de = displayDe(w), ar = arShort(w.ar);
  if (!de || !ar || ar.includes('(')) return false;
  const longest = Math.max(...de.split(/\s+/).map(t => t.length));
  return de.length <= 18 && longest <= 13 && ar.length <= 24;
}
export const memoryWords = list => (list || []).filter(w => w && KINDS.includes(w.k) && fitsCard(w));
// درس واحد كلماته قليلة → نكمّل من الدروس اللي قبله لحد 14 (اللوحتين) · «اللي ذاكرته» = اللي ذاكره بس
const poolWords = pool => memoryWords(pool.words({ kinds: KINDS, min: pool.sel && pool.sel.kind === 'lesson' ? POOL_MIN : 6 }));

// لوحة: n كلمات من غير تكرار في الكلمة ولا في المعنى — والأولوية للكلمات اللي مش في avoid
function pickBoard(cands, n, avoid) {
  const chosen = [];
  const ok = w => !chosen.includes(w) && chosen.every(c => baseKey(c) !== baseKey(w) && !sameWord(c, w));
  for (const w of cands) { if (chosen.length >= n) break; if (!avoid.has(w.id) && ok(w)) chosen.push(w); }
  for (const w of cands) { if (chosen.length >= n) break; if (ok(w)) chosen.push(w); }
  return chosen;
}

export const meta = {
  id: 'memory',
  title: 'لعبة الذاكرة',
  icon: '🃏',
  short: 'اقلب الكروت ولاقي الكلمة ومعناها',
  desc: 'لوحتين كروت مقلوبة (6 أزواج وبعدين 8): كل كلمة ألماني ليها كارت بمعناها بالعربي — افتكر أماكنهم!',
  how: [
    'اقلب كارتين: لو كلمة ومعناها بيفضلوا مفتوحين، لو لأ بيتقفلوا تاني',
    'القلب بيروح بس لو نسيت: قلبت كارت كنت شفت الكارت بتاعه قبل كده وما جبتوش',
    'الغلط العادي وانت لسه بتكتشف الكروت ببلاش',
  ],
  hearts: 5,
  kinds: KINDS,
  needAudio: false,
  minItems: 6,
  unit: 'كلمة',
  count: pool => poolWords(pool).length,
};

const CSS = `
.gm-memory-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 0 2px; }
.gm-memory-head b { font-family: var(--font-head); font-size: 16px; }
.gm-memory-grid { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 8px; }
.gm-memory-card { position: relative; display: block; width: 100%; aspect-ratio: 5 / 4; min-height: 64px; padding: 0; border: none; background: none;
  color: inherit; cursor: pointer; perspective: 700px; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.gm-memory-grid.cols-4 .gm-memory-card { aspect-ratio: 1 / 1; }
.gm-memory-inner { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .3s ease; }
.gm-memory-card.open .gm-memory-inner, .gm-memory-card.done .gm-memory-inner { transform: rotateY(180deg); }
.gm-memory-face { position: absolute; inset: 0; display: grid; place-items: center; padding: 5px; border-radius: 14px; text-align: center; overflow: hidden;
  backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.gm-memory-back { background-color: var(--blue); color: #fff; font: 800 28px/1 var(--font-head); box-shadow: var(--shadow);
  background-image: repeating-linear-gradient(45deg, transparent 0 9px, rgba(255,255,255,.09) 9px 18px); }
.gm-memory-front { transform: rotateY(180deg); background: var(--surface); border: 2px solid var(--line-strong); color: var(--ink); box-shadow: var(--shadow); }
.gm-memory-card.ar .gm-memory-front { background: var(--surface-2); }
.gm-memory-card.done .gm-memory-front { border-color: var(--good); background: var(--good-tint); }
.gm-memory-card.done { cursor: default; }
.gm-memory-card.bad .gm-memory-front { border-color: var(--bad); background: var(--bad-tint); animation: gm-shake .35s; }
.gm-memory-card.hint .gm-memory-back { outline: 3px solid var(--warn); outline-offset: 2px; animation: gm-memory-pulse .45s 2 alternate; }
@keyframes gm-memory-pulse { to { transform: scale(1.06); } }
.gm-memory-de { font: 700 15px/1.25 var(--font-de); overflow-wrap: anywhere; hyphens: auto; }
.gm-memory-de .de { font-weight: 700; }
.gm-memory-de.long { font-size: 13px; }
.gm-memory-ar { font: 700 14px/1.45 var(--font-head); overflow-wrap: anywhere; }
.gm-memory-ar.long { font-size: 12.5px; }
.gm-memory-grid.cols-4 .gm-memory-de { font-size: 13px; }
.gm-memory-grid.cols-4 .gm-memory-de.long { font-size: 11.5px; }
.gm-memory-grid.cols-4 .gm-memory-ar { font-size: 12.5px; line-height: 1.35; }
.gm-memory-grid.cols-4 .gm-memory-ar.long { font-size: 11.5px; }
.gm-memory-grid.cols-4 .gm-memory-back { font-size: 24px; }
/* 5 قلوب + الكومبو + النقط في الشريط اللي فوق على 360px */
.gm-wrap[data-game="memory"] .gm-combo { white-space: nowrap; }
@media (max-width: 400px) {
  .gm-wrap[data-game="memory"] .gm-top { gap: 6px; }
  .gm-wrap[data-game="memory"] .gm-hearts { font-size: 18px; }
  .gm-wrap[data-game="memory"] .gm-combo { padding: 5px 8px; }
}
`;

export function start(g) {
  injectCss('memory', CSS);
  window.scrollTo(0, 0);   // الإنجن مش بيرجّع الصفحة لفوق لما اللعبة تبدأ (لو كان نزل يدوس «يلا نلعب» / «كمان مرة»)
  const words = poolWords(g);
  const mine = w => !!g.lesson && (w.lessons || []).includes(g.lesson);
  const cands = [...g.shuffle(words.filter(mine)), ...g.shuffle(words.filter(w => !mine(w)))];
  const b1 = pickBoard(cands, BOARDS[0].pairs, new Set());
  const b2 = pickBoard(cands, BOARDS[1].pairs, new Set(b1.map(w => w.id)));
  const boards = [{ ...BOARDS[0], words: b1 }, { ...BOARDS[1], words: b2 }].filter(b => b.words.length >= 2);
  if (!boards.length) { g.end({ win: true }); return; }
  const total = boards.reduce((s, b) => s + b.words.length, 0);

  let bi = 0, found = 0, cards = [], first = null, lock = false;
  const partner = c => cards.find(x => x.w.id === c.w.id && x.side !== c.side);
  const cardEl = c => g.stage.querySelector(`.gm-memory-card[data-i="${c.i}"]`);
  const pairHtml = w => `${g.wordHtml(w)} = ${g.esc(arShort(w.ar))}`;
  const longest = s => Math.max(...String(s).split(/\s+/).map(t => t.length));
  const faceHtml = c => (c.side === 'de'
    ? `<span class="gm-memory-de${longest(displayDe(c.w)) > 9 ? ' long' : ''}" lang="de">${g.wordHtml(c.w)}</span>`
    : `<span class="gm-memory-ar${arShort(c.w.ar).length > 14 ? ' long' : ''}">${g.esc(arShort(c.w.ar))}</span>`);

  const renderBoard = () => {
    const b = boards[bi];
    const deck = g.shuffle(b.words.flatMap(w => [{ w, side: 'de' }, { w, side: 'ar' }]));
    cards = deck.map((c, i) => ({ ...c, i, open: false, done: false, seen: false }));
    first = null;
    g.stage.innerHTML = `
      <div class="gm-memory-head">
        <b>${boards.length > 1 ? `اللوحة ${bi + 1} من ${boards.length}` : 'لاقي الأزواج'}</b>
        <span class="hint">${b.words.length} أزواج</span>
      </div>
      <div class="gm-memory-grid cols-${b.cols}" style="--cols:${b.cols}">
        ${cards.map(c => `<button type="button" class="gm-memory-card ${c.side}" data-i="${c.i}" aria-label="كارت مقفول">
          <span class="gm-memory-inner">
            <span class="gm-memory-face gm-memory-back" aria-hidden="true">؟</span>
            <span class="gm-memory-face gm-memory-front" aria-hidden="true">${faceHtml(c)}</span>
          </span>
        </button>`).join('')}
      </div>`;
  };

  const boardDone = () => {
    lock = true;
    if (bi + 1 < boards.length) {
      g.toast('اللوحة التانية!');
      g.after(1100, () => { bi++; renderBoard(); lock = false; });
      return;
    }
    g.after(700, () => g.end({ win: true }));
  };

  const match = (a, b) => {
    for (const x of [a, b]) {
      x.c.done = true;
      x.c.open = true;
      x.el.classList.add('done');
      x.el.disabled = true;
    }
    found++;
    g.setProgress(found, total);
    g.say(a.c.w);
    g.correct({ points: 10, wordId: a.c.w.id, quiet: true });
    if (cards.every(x => x.done)) boardDone();
  };

  const mismatch = (a, b) => {
    lock = true;
    const pa = partner(a.c), pb = partner(b.c);
    // غلطة ذاكرة: زميل الكارت الأول كان اتشاف قبل كده، أو الكارت التاني نفسه وزميله كانوا اتشافوا (يعني كان عارف)
    const forgotA = !!(pa && pa.seen);
    const forgotB = !!(b.seenBefore && pb && pb.seen);
    a.el.classList.add('bad');
    b.el.classList.add('bad');
    let dead = false;
    if (forgotA || forgotB) {
      const x = forgotA ? a.c : b.c;
      const px = forgotA ? pa : pb;
      const pel = cardEl(px);
      if (pel) pel.classList.add('hint');      // نوريه كان فين
      const fatal = g.hearts <= 1;
      g.wrong({
        wordId: x.w.id,
        correctHtml: pairHtml(x.w),
        label: 'غلطة ذاكرة — كنت شفت الكارت بتاعها قبل كده',
        msg: fatal ? undefined : 'نسيت مكانه!',
        wait: false,
      });
      dead = g.hearts <= 0;
    }
    g.after(FLIP_BACK_MS, () => {
      for (const x of [a, b]) {
        x.c.open = false;
        x.el.classList.remove('open', 'bad');
        x.el.setAttribute('aria-label', 'كارت مقفول');
      }
      g.stage.querySelectorAll('.gm-memory-card.hint').forEach(e => e.classList.remove('hint'));
      if (!dead) lock = false;     // آخر قلب: الإنجن بيستنى «متابعة» وبعدين بيقفل اللعبة
    });
  };

  const flip = (c, el) => {
    c.open = true;
    el.classList.add('open');
    el.setAttribute('aria-label', c.side === 'de' ? displayDe(c.w) : arShort(c.w.ar));
    const cur = { c, el, seenBefore: c.seen };
    c.seen = true;
    if (!first) { first = cur; return; }
    const a = first;
    first = null;
    if (a.c.w.id === c.w.id && a.c.side !== c.side) match(a, cur);
    else mismatch(a, cur);
  };

  g.on(g.stage, 'click', e => {
    const el = e.target.closest('.gm-memory-card');
    if (!el || lock || !g.alive) return;
    const c = cards[+el.dataset.i];
    if (!c || c.open || c.done) return;
    flip(c, el);
  });

  g.setProgress(0, total);
  renderBoard();
}
