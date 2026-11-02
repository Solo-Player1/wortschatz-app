// ⚡ صح ولا غلط — كلمة ألماني ومعنى بالعربي (نصهم صح ونصهم معنى كلمة تانية) أو «الأداة صح؟».
// دقيقة واحدة + 3 قلوب · الفيدباك سريع جدًا · اللعبة بتخلص لما الوقت يخلص (فوز) أو القلوب تخلص
import { injectCss } from './engine.js';
import { DATA, displayDe } from '../data.js';
import { normDe, arParts, sameMeaning, sameWord } from '../exercises.js';

const KINDS = ['noun', 'verb', 'word'];
const ARTS = ['der', 'die', 'das'];
const SECONDS = 60;
const POOL_MIN = 8;
const ART_SHARE = 0.3;            // نسبة أسئلة «الأداة صح؟» من كروت الأسماء
const OK_MS = 450;               // الكارت الجاي بعد الإجابة الصح (بعد الغلط: لما شريط الإنجن يخلص)

const MARKERS = /^(?:(?:mit|bei|an|auf|für|über|von|zu)\s+)?(?:etwas|jemanden|jemandem|jemand|sich)(?:\/(?:etwas|jemanden|jemandem|jemand))?\s+(.+)$/i;
// أساس الكلمة الألماني (من غير أداة ولا etwas…) — علشان Frau / die Frau أو sprechen / mit jemandem sprechen يتحسبوا نفس الكلمة
export function baseKey(w) {
  if (w.k === 'noun' && w.sg) return normDe(w.sg);
  const b = displayDe(w);
  const m = b.match(MARKERS);
  return normDe(m ? m[1] : b);
}
// معنيين «قريبين» (هاتف / هاتف محمول، لا / لا، كلّا، أب / بابا) ما ينفعوش كإجابة غلط — المقارنة نفسها في exercises.js
export { arParts, sameMeaning };
const usable = list => (list || []).filter(w => w && w.ar && displayDe(w) && KINDS.includes(w.k));
// درس واحد كلماته قليلة → نكمّل من الدروس اللي قبله · «اللي ذاكرته» = اللي ذاكره بس
const poolWords = pool => usable(pool.words({ kinds: KINDS, min: pool.sel && pool.sel.kind === 'lesson' ? POOL_MIN : 4 }));
const pick = a => a[Math.floor(Math.random() * a.length)];
const size = t => (t.length > 20 ? ' xlong' : t.length > 14 ? ' long' : '');

export const meta = {
  id: 'truefalse',
  title: 'صح ولا غلط',
  icon: '⚡',
  short: 'صح ولا غلط؟ جاوب بسرعة في دقيقة',
  desc: 'كلمة ألماني ومعنى بالعربي: صح ولا غلط؟ جاوب على قد ما تقدر قبل الدقيقة ما تخلص!',
  how: [
    'دوس «✓ صح» لو المعنى مظبوط، و«✗ غلط» لو لأ',
    'ساعات السؤال بيبقى «الأداة صح؟» — ركّز في der / die / das',
    'عندك دقيقة و3 قلوب — كل غلطة بقلب',
  ],
  hearts: 3,
  clock: SECONDS,
  kinds: KINDS,
  needAudio: false,
  minItems: 4,
  unit: 'كلمة',
  count: pool => poolWords(pool).length,
};

const CSS = `
.gm-truefalse-card { min-height: clamp(218px, 33vh, 320px); padding: 16px 14px 18px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  transition: border-color .12s, background-color .12s; }
.gm-truefalse-ask { font: 700 14px/1.4 var(--font-head); color: var(--ink-2); background: var(--surface-2); padding: 4px 12px; border-radius: 999px; }
.gm-truefalse-de { margin-top: 6px; font: 700 30px/1.3 var(--font-de); overflow-wrap: anywhere; hyphens: auto; }
.gm-truefalse-de.long { font-size: 25px; }
.gm-truefalse-de.xlong { font-size: 21px; }
.gm-truefalse-de .de { font-weight: 700; }
.gm-truefalse-eq { font: 700 18px/1 var(--font-de); color: var(--muted); }
.gm-truefalse-ar { font: 700 22px/1.5 var(--font-head); }
.gm-truefalse-sub { color: var(--ink-2); font-size: 15px; line-height: 1.5; }
.gm-truefalse-art { display: inline-block; min-width: 1.7em; border-bottom: 3px solid var(--warn); }
.gm-truefalse-x { text-decoration: line-through; text-decoration-thickness: 3px; opacity: .55; }
.gm-truefalse-fix { font: 700 19px/1.5 var(--font-head); color: var(--good-text); }
.gm-truefalse-stamp { position: absolute; top: 8px; inset-inline-end: 12px; font: 800 28px/1 var(--font-de); }
.gm-truefalse-card.ok { border-color: var(--good); background: var(--good-tint); }
.gm-truefalse-card.bad { border-color: var(--bad); background: var(--bad-tint); animation: gm-shake .35s; }
.gm-truefalse-card.ok .gm-truefalse-stamp::after { content: "✓"; color: var(--good); }
.gm-truefalse-card.bad .gm-truefalse-stamp::after { content: "✗"; color: var(--bad); }
.gm-truefalse-card.ok .gm-truefalse-ask, .gm-truefalse-card.bad .gm-truefalse-ask { background: var(--surface); }
.gm-truefalse-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.gm-truefalse-btn { min-height: 80px; border-radius: 18px; border: 2.5px solid; font: 800 23px/1.2 var(--font-head); cursor: pointer; touch-action: manipulation;
  box-shadow: var(--shadow); transition: transform .08s, opacity .15s; }
.gm-truefalse-btn.yes { background: var(--good-tint); border-color: var(--good); color: var(--good-text); }
.gm-truefalse-btn.no { background: var(--bad-tint); border-color: var(--bad); color: var(--bad-text); }
.gm-truefalse-btn:active:not(:disabled) { transform: scale(.96); }
.gm-truefalse-btn:disabled { cursor: default; }
.gm-truefalse-btn:disabled:not(.picked) { opacity: .35; }
.gm-truefalse-btn.picked { transform: scale(.96); }
`;

export function start(g) {
  injectCss('truefalse', CSS);
  window.scrollTo(0, 0);   // الإنجن مش بيرجّع الصفحة لفوق لما اللعبة تبدأ (لو كان نزل يدوس «يلا نلعب» / «كمان مرة»)
  const pool = poolWords(g);
  if (pool.length < 2) { g.end({ win: true }); return; }
  const allWords = usable(DATA.words);

  // معنى غلط مقنع: كلمة تانية من نفس النوع ونفس الدرس الأول (أرقام مع أرقام، أكل مع أكل…) — من غير نفس الكلمة ولا معنى قريب
  const distractorFor = w => {
    const key = baseKey(w);
    const fits = o => o.id !== w.id && baseKey(o) !== key && !sameWord(o, w);
    const mates = new Set(w.lessons || []);
    const sameLesson = o => (o.lessons || []).some(n => mates.has(n));
    for (const tier of [allWords.filter(o => o.k === w.k && sameLesson(o)), pool.filter(o => o.k === w.k), allWords.filter(o => o.k === w.k), pool, allWords]) {
      const c = tier.filter(fits);
      if (c.length) return pick(c);
    }
    return null;
  };

  const mine = w => !!g.lesson && (w.lessons || []).includes(g.lesson);
  let queue = [...g.shuffle(pool.filter(mine)), ...g.shuffle(pool.filter(w => !mine(w)))];
  let last = null, card = null;
  // الكلمة الجاية: بنلف على الكلمات متلخبطة، ومن غير نفس الكلمة مرتين ورا بعض
  const take = () => {
    const notLast = w => !last || w.id !== last.id;
    let k = queue.findIndex(notLast);
    if (k < 0) { queue = queue.concat(g.shuffle(pool)); k = queue.findIndex(notLast); }
    if (k < 0) k = 0;
    return queue.splice(k, 1)[0];
  };

  const makeCard = w => {
    if (w.k === 'noun' && w.sg && ARTS.includes(w.art) && Math.random() < ART_SHARE) {
      const truth = Math.random() < 0.5;
      return { mode: 'art', w, truth, art: truth ? w.art : pick(ARTS.filter(a => a !== w.art)) };
    }
    let truth = Math.random() < 0.5;
    const other = truth ? null : distractorFor(w);
    if (!other) truth = true;
    return { mode: 'mean', w, truth, ar: truth ? w.ar : other.ar };
  };

  const render = c => {
    const w = c.w;
    const de = c.mode === 'art'
      ? `<bdi class="de"><span class="gm-truefalse-art">${g.esc(c.art)}</span> ${g.esc(w.sg)}</bdi>`
      : g.wordHtml(w);
    g.stage.innerHTML = `
      <div class="gm-q gm-truefalse-card">
        <span class="gm-truefalse-stamp" aria-hidden="true"></span>
        <p class="gm-truefalse-ask">${c.mode === 'art' ? 'الأداة صح؟' : 'المعنى صح؟'}</p>
        <p class="gm-truefalse-de${size(c.mode === 'art' ? `${c.art} ${w.sg}` : displayDe(w))}" lang="de">${de}</p>
        ${c.mode === 'art'
          ? `<p class="gm-truefalse-sub">${g.esc(w.ar)}</p>`
          : `<p class="gm-truefalse-eq" aria-hidden="true">=</p><p class="gm-truefalse-ar">${g.esc(c.ar)}</p>`}
        <p class="gm-truefalse-fix" hidden></p>
      </div>
      <div class="gm-truefalse-btns">
        <button type="button" class="gm-truefalse-btn yes" data-a="1">✓ صح</button>
        <button type="button" class="gm-truefalse-btn no" data-a="0">✗ غلط</button>
      </div>`;
  };

  const nextCard = () => {
    if (!g.alive) return;
    const w = take();
    last = w;
    card = makeCard(w);
    render(card);
  };

  // لو الكارت كان غلط: نوريه الصح على الكارت نفسه
  const reveal = c => {
    const w = c.w;
    if (c.mode === 'art') {
      const a = g.stage.querySelector('.gm-truefalse-art');
      if (a) a.outerHTML = c.truth
        ? `<span class="art art-${w.art}">${w.art}</span>`
        : `<span class="gm-truefalse-x">${g.esc(c.art)}</span> <span class="art art-${w.art}">${w.art}</span>`;
    } else if (!c.truth) {
      const ar = g.stage.querySelector('.gm-truefalse-ar');
      if (ar) ar.classList.add('gm-truefalse-x');
      const fix = g.stage.querySelector('.gm-truefalse-fix');
      if (fix) { fix.textContent = `✓ ${w.ar}`; fix.hidden = false; }
    }
  };

  const answer = async said => {
    if (!card || card.done || !g.alive) return;
    const c = card;
    c.done = true;
    const ok = said === c.truth;
    g.stage.querySelector('.gm-truefalse-card').classList.add(ok ? 'ok' : 'bad');
    g.stage.querySelectorAll('.gm-truefalse-btn').forEach(b => {
      b.disabled = true;
      if ((b.dataset.a === '1') === said) b.classList.add('picked');
    });
    reveal(c);
    if (ok) {
      g.correct({ points: 10, wordId: c.w.id, quiet: true });
      g.after(OK_MS, nextCard);
      return;
    }
    const w = c.w;
    const fatal = g.hearts <= 1;
    // الكارت بيفضل باين بالتصحيح لحد ما شريط الإنجن يخلص (wait:false = 1.3 ثانية)، وبعدين الكارت الجاي
    // آخر قلب: الإنجن بيستنى «متابعة» وبعدين بيقفل اللعبة → go = false
    const go = await g.wrong({
      wordId: w.id,
      correctHtml: c.mode === 'art' ? g.wordHtml(w) : `${g.wordHtml(w)} = ${g.esc(w.ar)}`,
      label: c.mode === 'art'
        ? (c.truth ? `«${c.art}» كانت صح` : `مش «${c.art}»`)
        : (c.truth ? 'المعنى ده كان صح' : `«${c.ar}» ده معنى كلمة تانية`),
      msg: fatal ? undefined : c.truth ? 'لأ… ده كان صح ✓' : 'لأ… ده كان غلط ✗',
      wait: false,
    });
    if (go) nextCard();
  };

  g.on(g.stage, 'click', e => {
    const b = e.target.closest('.gm-truefalse-btn');
    if (b && !b.disabled) answer(b.dataset.a === '1');
  });

  nextCard();
  // الوقت خلص = فوز — إلا لو القلوب خلصت وهو مستني «متابعة» (ساعتها الإنجن هو اللي بيقفلها خسارة)
  g.clock(SECONDS, { onEnd: () => { if (g.hearts > 0) g.end({ win: true, timeUp: true }); } });
}
