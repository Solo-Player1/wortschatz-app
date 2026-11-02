// 🎧 اسمع واكتب — تسمع الكلمة بصوت DW وتكتبها (الأسماء بأداتها). كل غلطة = قلب.
// mode=drill (من صفحة الدرس): كل كلمات الدرس اللي لسه ما اتكتبتش صح، والمعنى ظاهر — ده اللي بيجيب ⭐ الكتابة
import { askType } from './rounds.js';
import { wordsOfLesson } from '../data.js';
import { typedCount } from '../progress.js';

export const meta = {
  id: 'listen-write',
  title: 'اسمع واكتب',
  icon: '🎧',
  desc: 'هتسمع الكلمة بصوت DW واكتبها صح — كل غلطة بقلب!',
  how: ['دوس 🔊 تسمعها تاني براحتك', 'الأسماء لازم بأداتها: der / die / das', 'زرار «المعنى» بيورّيك المعنى بالعربي، بس النقط بتبقى النص'],
  hearts: 3,
  kinds: ['noun', 'verb', 'word'],
  needAudio: true,
  minItems: 4,
  unit: 'كلمة',
  rounds: 15,
};

export function start(g) {
  const drill = g.params.mode === 'drill' && g.lesson;
  let list;
  if (drill) {
    // كل كلمات الدرس اللي محتاجة كتابة (من غير الجمل)، اللي لسه ما اتكتبتش الأول
    const words = wordsOfLesson(g.lesson).filter(w => w.k !== 'phrase');
    const todo = g.shuffle(words.filter(w => typedCount(w.id) === 0));
    const rest = g.shuffle(words.filter(w => typedCount(w.id) > 0));
    list = todo.length ? todo : rest;
  } else {
    list = g.shuffle(g.words({ kinds: meta.kinds, needAudio: true, min: meta.minItems })).slice(0, meta.rounds);
  }
  if (!list.length) { g.end({ win: true }); return; }

  let i = 0, hintUsed = false;
  // زرار 💡 جوه السؤال (event delegation على الـ stage)
  g.on(g.stage, 'click', e => {
    const b = e.target.closest('.gm-hint-btn');
    if (!b) return;
    hintUsed = true;
    b.hidden = true;
    const ar = g.stage.querySelector('.gm-ar');
    if (ar) ar.hidden = false;
  });

  const next = async () => {
    if (!g.alive) return;
    if (i >= list.length) { g.end({ win: true }); return; }
    const w = list[i++];
    g.setProgress(i - 1, list.length);
    hintUsed = false;
    const exp = g.expectedFor(w, { withSynonyms: !w.file });
    const showMeaning = drill || !w.file;
    const go = await askType(g, {
      promptHtml: `<p class="hint center">${w.file ? 'اسمع واكتب' : 'اكتب بالألماني'}${w.k === 'noun' ? ' — المفرد بأداته (der / die / das)' : ''}</p>
        <p class="gm-ar"${showMeaning ? '' : ' hidden'}>${g.esc(w.ar)}</p>
        ${showMeaning ? '' : '<button type="button" class="btn btn-ghost gm-hint-btn">المعنى</button>'}`,
      expected: exp.accept,
      show: exp.show,
      wordId: w.id,
      audio: w,
      points: () => (hintUsed ? 5 : 10),
      placeholder: w.k === 'noun' ? 'der / die / das …' : 'اكتب الكلمة…',
    });
    if (go) next();
  };
  next();
}
