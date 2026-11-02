// 🎯 der die das بسرعة — بيظهرلك اسم من غير أداته وتختار der / die / das قبل الوقت ما يخلص.
// الوقت بيبدأ 6 ثواني وبيقصر ربع ثانية مع كل إجابة صح (لحد 2.5 ثانية) · كل 5 صح ورا بعض = قلب زيادة · 20 سؤال
import { injectCss } from './engine.js';

const ROUNDS = 20;
const T_START = 6, T_STEP = 0.25, T_MIN = 2.5;
const POOL_MIN = 10;                       // درس واحد أسماءه قليلة → نكمّل من الدروس اللي قبله («اللي ذاكرته» = اللي ذاكره بس)
const ARTS = ['der', 'die', 'das'];
const AUDIO_MS = 1800;                     // وقفة بعد الإجابة: صوت «الأداة + المفرد» يكمل قبل الكارت الجاي
const FAST = ['سريع!', 'إيه السرعة دي!', 'صاروخ!', 'طيارة!'];

const nounsOf = pool => pool.words({ kinds: ['noun'], min: pool.sel && pool.sel.kind === 'lesson' ? POOL_MIN : 3 }).filter(w => w && w.sg && ARTS.includes(w.art));
const secsFor = rights => Math.max(T_MIN, T_START - T_STEP * rights);
const fmtSecs = s => String(Math.round(s * 100) / 100);

export const meta = {
  id: 'articles',
  title: 'der die das بسرعة',
  icon: '🎯',
  short: 'اختار الأداة قبل الوقت ما يخلص',
  desc: 'هيظهرلك اسم من غير أداته — اختار der ولا die ولا das قبل الوقت ما يخلص!',
  how: [
    'الوقت بيقصر مع كل إجابة صح — وكل ما تجاوب أسرع النقط بتزيد',
    'لو الوقت خلص قبل ما تختار تبقى غلطة بقلب',
    'كل 5 صح ورا بعض = قلب زيادة',
  ],
  hearts: 3,
  kinds: ['noun'],
  needAudio: false,
  minItems: 3,       // الدرس الأول فيه ٣ أسماء بس (Mann / Frau / Beispiel) — الأسماء بتتكرر متلخبطة
  unit: 'اسم',
  rounds: ROUNDS,
  count: pool => nounsOf(pool).length,
};

const CSS = `
.gm-articles-card { min-height: clamp(200px, 32vh, 300px); padding: 46px 14px 22px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.gm-articles-n, .gm-articles-secs { position: absolute; top: 10px; font: 700 13px/1 var(--font-de); color: var(--ink-2); background: var(--surface-2);
  padding: 6px 10px; border-radius: 999px; direction: ltr; unicode-bidi: isolate; }
.gm-articles-n { inset-inline-start: 10px; }
.gm-articles-secs { inset-inline-end: 10px; }
.gm-articles-word { font: 700 36px/1.25 var(--font-de); overflow-wrap: anywhere; }
.gm-articles-word.long { font-size: 30px; }
.gm-articles-word.xlong { font-size: 25px; }
.gm-articles-word .de { font-weight: 700; }
.gm-articles-slot { display: inline-block; text-align: center; }
.gm-articles-slot:not(.on) { min-width: 1.9em; border-bottom: 3px dashed var(--line-strong); color: var(--muted); }
.gm-articles-slot.on { animation: gm-articles-pop .3s ease-out; }
.gm-articles-ar { margin-top: 8px; color: var(--ink-2); font-size: 16px; line-height: 1.5; }
.gm-articles-btns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; direction: ltr; }
.gm-articles-btn { position: relative; min-height: 88px; padding: 0 4px; border: none; border-radius: 18px; background: var(--der); color: var(--bg);
  font: 800 28px/1 var(--font-de); cursor: pointer; touch-action: manipulation; box-shadow: inset 0 -6px 0 rgba(0,0,0,.22), var(--shadow);
  transition: transform .08s, opacity .2s; }
.gm-articles-btn .de { font-weight: 800; }
.gm-articles-btn.art-die { background: var(--die); }
.gm-articles-btn.art-das { background: var(--das); }
.gm-articles-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: inset 0 -3px 0 rgba(0,0,0,.22); }
.gm-articles-btn:disabled { cursor: default; }
.gm-articles-btn:disabled:not(.right):not(.wrong) { opacity: .3; }
.gm-articles-btn.right { outline: 4px solid var(--good); outline-offset: 3px; animation: gm-articles-pop .3s ease-out; }
@keyframes gm-articles-pop { 50% { transform: scale(1.07); } }
.gm-articles-btn.wrong { outline: 4px solid var(--bad); outline-offset: 3px; animation: gm-shake .35s; }
.gm-articles-btn.right::after, .gm-articles-btn.wrong::after { position: absolute; top: -9px; right: -5px; width: 28px; height: 28px; border-radius: 50%;
  display: grid; place-items: center; font: 800 16px/1 var(--font-de); color: #fff; box-shadow: var(--shadow); }
.gm-articles-btn.right::after { content: "✓"; background: var(--good); }
.gm-articles-btn.wrong::after { content: "✕"; background: var(--bad); }
@media (max-width: 370px) {
  .gm-articles-word { font-size: 32px; } .gm-articles-word.long { font-size: 27px; } .gm-articles-word.xlong { font-size: 23px; }
  .gm-articles-btn { min-height: 80px; font-size: 25px; }
}
`;

export function start(g) {
  injectCss('articles', CSS);
  window.scrollTo(0, 0);   // الإنجن مش بيرجّع الصفحة لفوق لما اللعبة تبدأ (لو كان نزل يدوس «يلا نلعب» / «كمان مرة»)
  const pool = nounsOf(g);
  if (!pool.length) { g.end({ win: true }); return; }

  const mine = w => !!g.lesson && (w.lessons || []).includes(g.lesson);
  // أسماء الدرس المختار الأول والباقي بعدها، وبعدين نخلط اللي اتختار
  let queue = g.shuffle([...g.shuffle(pool.filter(mine)), ...g.shuffle(pool.filter(w => !mine(w)))].slice(0, ROUNDS));
  let round = 0, rights = 0, streak = 0, last = null, cur = null;

  // الاسم الجاي (لو الأسماء خلصت قبل الـ 20 سؤال بنعيدها متلخبطة — ومن غير نفس الاسم مرتين ورا بعض)
  const take = () => {
    const notLast = w => !last || w.id !== last.id;
    let k = queue.findIndex(notLast);
    if (k < 0) { queue = queue.concat(g.shuffle(pool)); k = queue.findIndex(notLast); }
    if (k < 0) k = 0;
    return queue.splice(k, 1)[0];
  };

  const next = () => {
    if (!g.alive) return;
    if (round >= ROUNDS) { g.end({ win: true }); return; }
    g.stopAudio();     // صوت الاسم اللي فات بيكمّل بـ«die + الجمع» — ما يتسمعش على السؤال الجديد
    const w = take();
    last = w;
    round++;
    const secs = secsFor(rights);
    g.stage.innerHTML = `
      <div class="gm-q gm-articles-card">
        <span class="gm-articles-n" aria-label="السؤال ${round} من ${ROUNDS}">${round}/${ROUNDS}</span>
        <span class="gm-articles-secs" aria-label="${fmtSecs(secs)} ثانية">⏱ ${fmtSecs(secs)}</span>
        <p class="gm-articles-word${w.sg.length > 13 ? ' xlong' : w.sg.length > 10 ? ' long' : ''}"><bdi class="de"><span class="gm-articles-slot">?</span> ${g.esc(w.sg)}</bdi></p>
        <p class="gm-articles-ar">${g.esc(w.ar)}</p>
      </div>
      <div class="gm-articles-btns" role="group" aria-label="اختار الأداة">
        ${ARTS.map(a => `<button type="button" class="gm-articles-btn art-${a}" data-art="${a}"><bdi class="de">${a}</bdi></button>`).join('')}
      </div>`;
    cur = { w, secs, done: false };
    cur.timer = g.timer(secs, () => answer(null));
  };

  // art = الأداة اللي اختارها، أو null لو الوقت خلص
  const answer = async art => {
    if (!cur || cur.done || !g.alive) return;
    const { w, secs } = cur;
    cur.done = true;
    cur.timer.stop();
    const left = Math.max(0, secs - cur.timer.elapsed);     // وقت التايمر نفسه (بيقف لو الأبلكيشن في الخلفية)
    const ok = art === w.art;

    // نوريه الأداة الصح على الكارت والزرار
    const slot = g.stage.querySelector('.gm-articles-slot');
    if (slot) { slot.textContent = w.art; slot.className = `gm-articles-slot art art-${w.art} on`; }
    g.stage.querySelectorAll('.gm-articles-btn').forEach(b => {
      b.disabled = true;
      if (b.dataset.art === w.art) b.classList.add('right');
      else if (b.dataset.art === art) b.classList.add('wrong');
    });
    g.say(w);   // صوت DW بيقول الاسم بأداته

    let go;
    if (ok) {
      rights++;
      streak++;
      const bonus = Math.round((10 * left) / secs);
      if (streak % 5 === 0 && g.hearts < g.meta.hearts) {
        g.addHeart();
        g.toast('قلب زيادة!');
      }
      // ١٫٨ ثانية: «der/die/das + الاسم» في صوت DW بيخلص في أقل من ١٫٥ ثانية لـ٩٠٪ من الأسماء — بعدها next() بيوقف «die + الجمع»
      go = await g.correct({ points: 10 + bonus, wordId: w.id, msg: bonus >= 6 ? FAST[Math.floor(Math.random() * FAST.length)] : undefined, ms: AUDIO_MS });
    } else {
      streak = 0;
      if (round < ROUNDS) queue.splice(Math.min(2, queue.length), 0, w);   // الاسم ده هيرجعلك كمان شوية
      const fatal = g.hearts <= 1;
      go = await g.wrong({
        wordId: w.id,
        correctHtml: g.wordHtml(w),
        label: w.ar,
        msg: fatal || art ? undefined : 'الوقت خلص!',
        wait: false,
        ms: AUDIO_MS,       // يسمع الأداة الصح كاملة
      });
    }
    if (go) next();
  };

  g.on(g.stage, 'click', e => {
    const b = e.target.closest('.gm-articles-btn');
    if (b && !b.disabled) answer(b.dataset.art);
  });
  next();
}
