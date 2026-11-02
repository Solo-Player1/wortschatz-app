// 🧱 كوّن الجملة — بتشوف الجملة بالعربي وترتّب كلماتها بالألماني. كل غلطة = قلب.
// كل تالت جملة «اسمع ورتّب»: المعنى مستخبي والجملة بتتقال بصوت، و💡 بيورّي المعنى بنص النقط.
// من الجملة السادسة فيه كلمة أو كلمتين زيادة (من جمل تانية) للتمويه.
// mode=drill (من صفحة الدرس): كل جمل الدرس اللي لسه ما اتكوّنتش صح (ولو خلصوا كلهم: كل جمل الدرس) — والمعنى ظاهر دايمًا
import { askTiles } from './rounds.js';
import { injectCss } from './engine.js';
import { sentencesOf, tilesOf } from '../content.js';
import { itemDone } from '../progress.js';
import { normDe } from '../exercises.js';

export const meta = {
  id: 'sentence',
  title: 'كوّن الجملة',
  icon: '🧱',
  short: 'رتّب الكلمات وكوّن جملة صح',
  desc: 'هتشوف الجملة بالعربي وترتّب كلماتها بالألماني — كل غلطة بقلب!',
  how: [
    'دوس على الكلمات بالترتيب، ولو غلطت دوس على الكلمة ترجع مكانها',
    'كل تالت جملة «اسمع ورتّب» — وزرار «المعنى» بيورّيك المعنى، بس النقط بتبقى النص',
    'من الجملة السادسة فيه كلمة زيادة مش من الجملة — سيبها',
  ],
  hearts: 3,
  minItems: 4,
  unit: 'جملة',
  rounds: 10,
  count: pool => pool.sentences().length,
};

const CSS = `
.gm-sentence-p { display: grid; gap: 8px; justify-items: center; width: 100%; }
.gm-sentence-p .gm-ar { overflow-wrap: anywhere; }
.gm-sentence-tag { font-size: 13px; }
.gm-sentence-extra { margin: 0; padding: 4px 12px; border-radius: 999px; background: var(--warn-tint); color: var(--warn-text); font-size: 13.5px; font-weight: 700; line-height: 1.6; }
.gm-q.gm-sentence-q > .gm-speaker.sm { width: 48px; height: 48px; }
.gm-q.gm-sentence-q ~ .gm-tiles .gm-tile { min-width: 48px; }
.gm-q.gm-sentence-listen > .gm-speaker.sm { display: none; }
.gm-sentence-play { margin: 2px auto 0; }
.gm-sentence-play.playing { animation: gm-sentence-pulse .9s ease-in-out infinite alternate; }
@keyframes gm-sentence-pulse { from { box-shadow: 0 0 0 0 var(--blue-tint); } to { box-shadow: 0 0 0 10px var(--blue-tint); } }
.gm-sentence-hint { min-height: 48px; }
.gm-sentence-note { margin: 0; font-size: 13px; color: var(--muted); }
`;

const LISTEN_PTS = 20, LISTEN_HINT_PTS = 10, PTS = 15;
// الكلمة من غير الترقيم اللازق فيها: "Müller!" → "Müller"
const bare = t => String(t).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
// من القصيرة للطويلة (sort ثابت: الترتيب العشوائي بيفضل جوه نفس الطول)
const byLength = list => list.slice().sort((a, b) => tilesOf(a).length - tilesOf(b).length);

export function start(g) {
  injectCss('sentence', CSS);
  const drill = !!(g.params.mode === 'drill' && g.lesson);
  const pool = drill ? sentencesOf(g.lesson) : g.sentences();
  const usable = pool.filter(s => tilesOf(s).length >= 2);
  const todo = g.shuffle(usable.filter(s => !itemDone(s.id)));
  const rest = g.shuffle(usable.filter(s => itemDone(s.id)));
  // drill: كل اللي لسه ما اتعملش (أو كل الجمل لو خلصت) — اللعبة العادية: ١٠ جمل، اللي لسه ما اتعملتش الأول
  const list = byLength(drill ? (todo.length ? todo : rest) : todo.concat(rest).slice(0, meta.rounds));
  if (!list.length) { g.end({ win: true }); return; }
  const sources = pool.length > 1 ? pool : g.sentences();

  // كلمات التمويه: من جمل تانية، عمرها ما تكون كلمة موجودة في الجملة دي
  const distractors = (s, n) => {
    const own = new Set(tilesOf(s).map(t => normDe(t)));
    const seen = new Set(), cands = [];
    for (const o of sources) {
      if (o.id === s.id) continue;
      for (const t of tilesOf(o)) {
        const w = bare(t), k = normDe(w);
        if (w.length < 2 || !k || own.has(k) || seen.has(k)) continue;
        seen.add(k);
        cands.push(w);
      }
    }
    return g.shuffle(cands).slice(0, n);
  };

  let i = 0, round = 0, hintUsed = false, answered = false, cur = null, playSeq = 0;
  const $ = sel => g.stage.querySelector(sel);

  // المعنى بالعربي (في «اسمع ورتّب»): penalty = دوس 💡 (نص النقط)
  const reveal = (penalty, note) => {
    const ar = $('.gm-sentence-p .gm-ar');
    if (!ar || !ar.hidden) return;
    if (penalty) hintUsed = true;
    ar.hidden = false;
    const b = $('.gm-sentence-hint');
    if (b) b.hidden = true;
    if (note) ar.insertAdjacentHTML('afterend', `<p class="gm-sentence-note">${g.esc(note)}</p>`);
  };
  const play = auto => {
    if (!cur) return;
    const seq = ++playSeq, r = round;
    const btn = $('.gm-sentence-play');
    if (btn) btn.classList.add('playing');
    g.say(cur.de).then(ok => {
      if (seq !== playSeq || r !== round || !g.alive) return;
      const b = $('.gm-sentence-play');
      if (b) b.classList.remove('playing');
      // مفيش صوت ألماني على الجهاز → نورّيه المعنى من غير ما نخصم نقط
      if (!ok && auto && !answered) reveal(false, 'الصوت مش شغال — المعنى ظهر من غير خصم');
    });
  };
  g.on(g.stage, 'click', e => {
    if (e.target.closest('.gm-sentence-hint')) reveal(true);
    else if (e.target.closest('.gm-sentence-play')) play(false);
    else if (e.target.closest('.gm-submit')) answered = true;
  });

  const promptFor = (s, listen, nExtra) => {
    const extra = nExtra ? `<p class="gm-sentence-extra">⚠️ فيه ${nExtra === 1 ? 'كلمة زيادة' : 'كلمتين زيادة'} مش من الجملة</p>` : '';
    if (listen) return `<div class="gm-sentence-p" data-sid="${g.esc(s.id)}" data-mode="listen">
        <span class="chip blue gm-sentence-tag">اسمع ورتّب</span>
        <button type="button" class="gm-speaker gm-sentence-play" aria-label="اسمع الجملة تاني">🔊</button>
        <p class="gm-ar" hidden>${g.esc(s.ar)}</p>
        <button type="button" class="btn btn-ghost gm-sentence-hint">المعنى بالعربي (بنص النقط)</button>
        ${extra}
      </div>`;
    return `<div class="gm-sentence-p" data-sid="${g.esc(s.id)}">
        <span class="chip gm-sentence-tag">رتّب الجملة</span>
        <p class="gm-ar">${g.esc(s.ar)}</p>
        <p class="hint center">قولها بالألماني: رتّب الكلمات</p>
        ${extra}
      </div>`;
  };

  const next = async () => {
    if (!g.alive) return;
    if (i >= list.length) { g.end({ win: true }); return; }
    const s = list[i++];
    cur = s; round++; hintUsed = false; answered = false;
    g.setProgress(i - 1, list.length);
    const listen = !drill && i % 3 === 0;
    const nExtra = i >= 6 ? (i >= 8 && tilesOf(s).length < 9 ? 2 : 1) : 0;
    const extra = nExtra ? distractors(s, nExtra) : [];
    const pending = askTiles(g, {
      sentence: s,
      promptHtml: promptFor(s, listen, extra.length),
      points: () => (listen ? (hintUsed ? LISTEN_HINT_PTS : LISTEN_PTS) : PTS),
      extra,
    });
    const q = $('.gm-q');
    if (q) q.classList.add('gm-sentence-q');
    if (listen) {
      if (q) q.classList.add('gm-sentence-listen');
      g.after(350, () => { if (cur === s && !answered) play(true); });
    }
    if (await pending) next();
  };
  next();
}
