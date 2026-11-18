// 🧩 قواعد مهمة — كويز على المواضيع اللي بتلخبط: der/ein، ein/kein، mein/sein/ihr، ihr/ihre، الصفة قبل الاسم، حروف الجر،
// أيام الأسبوع والشهور. جملة فيها فراغ ← اختار الصح ← بعدها السبب بالمصري. كل غلطة = قلب.
// #/game/grammar?topic=<id> (موضوع واحد من صفحته في المراجع) · من غير topic = خليط من كل المواضيع
import { choiceGrid } from './rounds.js';
import { injectCss } from './engine.js';
import { CONTENT, topicById } from '../content.js';
import { studiedUpTo } from '../mastery.js';
import { mixHtml } from '../ui.js';

export const meta = {
  id: 'grammar',
  title: 'قواعد مهمة',
  icon: '🧩',
  short: 'اختار الكلمة الصح في الجملة',
  desc: 'جمل فيها كلمة ناقصة من القواعد اللي بتلخبط: der ولا ein، mein ولا meine، ihr ولا ihre، حروف الجر، الأيام والشهور… وبعد كل إجابة السبب.',
  how: [
    'اقرا الجملة والمعنى بالعربي تحتها، واختار الكلمة الصح',
    'بعد كل إجابة هتشوف «ليه» — ده الأهم',
    'من صفحة كل موضوع في «المراجع ← قواعد مهمة» تقدر تلعب عليه لوحده',
  ],
  source: 'none',
  hearts: 3,
  minItems: 4,
  unit: 'سؤال',
  rounds: 12,
  count: (pool, params = {}) => itemsFor(params).length,
};

const CSS = `
.gm-gr-p { display: grid; gap: 10px; justify-items: center; width: 100%; }
.gm-gr-topic { font-size: 13px; white-space: normal; max-width: 100%; text-align: center; line-height: 1.5; }   /* عنوان الموضوع طويل (الصفة والموصوف …) → يلف مش يوسّع الشاشة */
.gm-gr-de { margin: 0; font-family: var(--font-de); font-size: 23px; font-weight: 700; line-height: 1.75; overflow-wrap: anywhere; text-align: center; }
.gm-gr-blank { display: inline-block; min-width: 3em; min-height: 1.35em; padding: 0 8px; margin: 0 2px; line-height: 1.35; border-bottom: 3px dashed var(--blue);
  border-radius: 8px 8px 0 0; background: var(--blue-tint); color: var(--blue); text-align: center; white-space: pre; }
.gm-gr-blank.ok { border-bottom-style: solid; border-color: var(--good); background: var(--good-tint); color: var(--good-text); }
.gm-gr-p .gm-ar { font-size: 17px; color: var(--ink-2); overflow-wrap: anywhere; text-align: center; }
.gm-gr-why { font-size: 15px; line-height: 1.7; }
`;

// أسئلة متولّدة للأيام والشهور (من lists في الموضوع): «Nach Montag kommt ___.»
function dayMonthItems(t) {
  const L = t && t.lists;
  if (!L) return [];
  const out = [];
  const seq = (list, lesson, kind) => list.forEach((x, i) => {
    const nxt = list[(i + 1) % list.length];
    const others = list.filter(y => y.de !== nxt.de && y.de !== x.de).map(y => y.de);
    const opts = [nxt.de, ...others.sort(() => Math.random() - 0.5).slice(0, 2)];          // كلمات مش objects
    out.push({ q: `Nach ${x.de} kommt ___.`, answer: nxt.de, opts, ar: `بعد ${x.ar} ${kind === 'day' ? 'ييجي يوم' : 'ييجي شهر'} ${nxt.ar}.`,
      why: `${x.de} = ${x.ar} ← وبعده ${nxt.de} = ${nxt.ar}`, lesson, topic: t.id, gen: true });
  });
  if ((L.days || []).length === 7) seq(L.days, t.lesson || 31, 'day');
  if ((L.months || []).length === 12) seq(L.months, Math.max(t.lesson || 31, 34), 'month');
  return out;
}

// الأسئلة: من الدروس اللي وصلتلها؛ لو قليلة، أسهل الأسئلة (الموضوع اتطلب دلوقتي حتى لو درسه لسه جاي)
export function itemsFor(params = {}) {
  const ts = params.topic ? [topicById(params.topic)].filter(Boolean) : CONTENT.topics;
  const all = ts.flatMap(t => (t.quiz || []).map((q, k) => ({ ...q, topic: t.id, key: `${t.id}:${k}` })).concat(t.id === 'daysmonths' ? dayMonthItems(t) : []));
  const up = Math.max(studiedUpTo(), 1);
  const known = all.filter(q => (q.lesson | 0) <= up);
  if (known.length >= 8) return known;
  return all.slice().sort((a, b) => (a.lesson | 0) - (b.lesson | 0)).slice(0, Math.max(10, known.length));
}

export function start(g) {
  injectCss('grammar', CSS);
  const params = g.params || {};
  const list = g.shuffle(itemsFor(params)).slice(0, meta.rounds);
  if (!list.length) { g.end({ win: true }); return; }
  const titleOf = id => (topicById(id) || {}).title || '';
  let i = 0;

  const ask = q => new Promise(resolve => {
    const [before, after] = String(q.q).split('___');
    const full = `${before}${q.answer}${after}`;
    g.stage.innerHTML = '';
    const el = g.el(`<div class="gm-q"><div class="gm-prompt"><div class="gm-gr-p" data-topic="${g.esc(q.topic)}">
        ${params.topic ? '' : `<span class="chip blue gm-gr-topic">${g.esc(titleOf(q.topic))}</span>`}
        <p class="gm-gr-de"><bdi class="de">${g.esc(before)}<span class="gm-gr-blank" aria-label="كلمة ناقصة"> </span>${g.esc(after)}</bdi></p>
        <p class="gm-ar">${g.esc(q.ar || '')}</p>
      </div></div></div>`);
    g.stage.appendChild(el);
    const blank = el.querySelector('.gm-gr-blank');
    const opts = g.shuffle(q.opts);
    g.stage.appendChild(choiceGrid(g, opts.map(o => ({ html: `<bdi class="de">${g.esc(o)}</bdi>`, value: o, correct: o === q.answer })), async o => {
      blank.textContent = q.answer;
      blank.classList.add('ok');
      g.say(full);
      // السبب فيه ألماني جوّا عربي → mixHtml (كل جملة ألماني في <bdi>)، ولو فيه شرح يفضل لحد «متابعة»
      const why = q.why ? `<div class="gm-gr-why">${mixHtml(q.why)}</div>` : '';
      const go = o.correct
        ? await g.correct({ points: 10, itemId: q.gen ? undefined : `g:${q.key}`, msg: q.why || undefined, wait: !!q.why })
        : await g.wrong({ itemId: q.gen ? undefined : `g:${q.key}`, correctHtml: `<bdi class="de">${g.esc(full)}</bdi>${why}`, label: q.ar || '' });
      resolve(go);
    }, { cols: opts.length === 4 ? 2 : 1 }));
  });

  const next = async () => {
    if (!g.alive) return;
    if (i >= list.length) { g.end({ win: true }); return; }
    const q = list[i++];
    g.setProgress(i - 1, list.length);
    if (await ask(q)) next();
  };
  next();
}
