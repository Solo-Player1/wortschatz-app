// mastery.js — «الدرس خلص بضمير»: نجوم الدرس + الامتحان + التاج + مهمة النهارده + المستوى
// ⭐1 حفظت كل الكلمات (صندوق ≥ 1) · ⭐2 كتبت كل الكلمات صح (الأسماء بالأداة) · ⭐3 كوّنت ٨٠٪ من جمل وأسئلة الدرس
// 🏁 امتحان الدرس (٣ قلوب) = الدرس خلصان · 👑 امتحان تثبيت بعد ٣ أيام = مش هتنساه
import { DATA, wordsOfLesson } from './data.js';
import { store, today, todayIndex } from './store.js';
import { getState, isLearned, isSeen, counts } from './srs.js';
import { sentencesOf, wfragenOf } from './content.js';
import { typedCount, itemDone } from './progress.js';

export const CROWN_DAYS = 3;
export const ITEMS_PASS = 0.8;

const needsTyping = w => w && w.k !== 'phrase';
const examOf = n => ((store.state.exams || {})[n]) || {};
export const sortedLessonNs = () => DATA.lessons.map(l => l.n).sort((a, b) => a - b);

export function lessonStatus(n) {
  n = +n;
  const words = wordsOfLesson(n);
  const learned = words.filter(w => isLearned(w.id)).length;
  const seen = words.filter(w => isSeen(w.id)).length;
  const typeWords = words.filter(needsTyping);
  const typed = typeWords.filter(w => typedCount(w.id) > 0).length;
  const items = [...sentencesOf(n), ...wfragenOf(n)];
  const itemsDone = items.filter(it => itemDone(it.id)).length;
  const itemsNeed = items.length ? Math.ceil(items.length * ITEMS_PASS) : 0;
  const star1 = words.length > 0 && learned === words.length;
  const star2 = typeWords.length === 0 || typed === typeWords.length;
  const star3 = itemsDone >= itemsNeed;
  const ex = examOf(n);
  const passed = !!ex.passed, crown = !!ex.crown;
  const t = todayIndex();
  const crownAt = passed ? (ex.passed | 0) + CROWN_DAYS : 0;
  const lapsed = passed ? words.filter(w => { const s = getState(w.id); return s.seen > 0 && s.box === 0 && s.due <= t; }).length : 0;
  const needsReview = passed && lapsed >= Math.max(2, Math.ceil(words.length * 0.25));
  const stars = (star1 ? 1 : 0) + (star2 ? 1 : 0) + (star3 ? 1 : 0);
  const frac = (a, b) => (b > 0 ? a / b : 1);
  const pct = Math.round(100 * (0.35 * frac(learned, words.length) + 0.2 * frac(typed, typeWords.length)
    + 0.2 * Math.min(1, frac(itemsDone, itemsNeed)) + (passed ? 0.18 : 0) + (crown ? 0.07 : 0)));
  return {
    n, words: words.length, seen, learned, typeNeed: typeWords.length, typed,
    itemsTotal: items.length, itemsNeed, itemsDone,
    star1, star2, star3, stars, passed, passedDay: ex.passed | 0, best: ex.best | 0, tries: ex.tries | 0,
    crown, crownDay: ex.crown | 0, crownAt, crownReady: passed && !crown && t >= crownAt, crownIn: passed && !crown ? Math.max(0, crownAt - t) : 0,
    needsReview, lapsed, started: seen > 0 || typed > 0 || itemsDone > 0 || passed, pct: Math.min(100, pct),
  };
}

// الدرس اللي عليه الدور: أول درس لسه ما اتمتحنش، وإلا أول درس من غير تاج
export function currentLesson() {
  const ns = sortedLessonNs();
  for (const n of ns) if (!examOf(n).passed) return n;
  for (const n of ns) if (lessonStatus(n).crownReady) return n;      // تاج جاهز أولى من درس لسه مستني
  for (const n of ns) if (!examOf(n).crown) return n;
  return ns[ns.length - 1] || 1;
}
// آخر درس وصلّه (من غير ما التيجان تفرق): أول درس لسه ما اتمتحنش، أو آخر درس لو كله نجح — لـ«اللي ذاكرته» في الألعاب
export function studiedUpTo() {
  const ns = sortedLessonNs();
  for (const n of ns) if (!examOf(n).passed) return n;
  return ns[ns.length - 1] || 1;
}

// الخطوة الجاية في درس: { key, icon, label, hint, href }
export function nextStep(n, st = lessonStatus(n)) {
  if (st.passed) {
    if (st.needsReview) return { key: 'review', icon: '🔁', label: 'راجع الدرس', hint: `${st.lapsed} كلمة بدأت تتنسي`, href: `#/session?lesson=${n}` };
    if (st.crownReady) return { key: 'crown', icon: '👑', label: 'امتحان التثبيت', hint: 'اتأكد إنك لسه فاكر الدرس', href: `#/exam/${n}?kind=crown` };
    if (!st.star3 && st.itemsTotal) return { key: 'sentences', icon: '🧱', label: 'كمّل جمل الدرس', hint: `${st.itemsDone}/${st.itemsNeed}${st.crown ? ' — عشان النجمة التالتة' : ' — لحد ما التثبيت يفتح'}`, href: `#/drill/${n}` };
    if (!st.star1) return { key: 'words', icon: '⭐', label: 'كمّل كلمات الدرس', hint: `${st.learned}/${st.words} كلمة`, href: `#/session?lesson=${n}` };
  }
  if (!st.star1) return { key: 'words', icon: '⭐', label: 'احفظ كلمات الدرس', hint: `${st.learned}/${st.words} كلمة`, href: `#/session?lesson=${n}` };
  if (!st.star2) return { key: 'write', icon: '✍️', label: 'اكتب كلمات الدرس صح', hint: `${st.typed}/${st.typeNeed} كلمة`, href: `#/game/listen-write?lesson=${n}&mode=drill` };
  if (!st.star3) return { key: 'sentences', icon: '🧱', label: 'كوّن جمل الدرس', hint: `${st.itemsDone}/${st.itemsNeed} جملة وسؤال`, href: `#/drill/${n}` };
  if (!st.passed) return { key: 'exam', icon: '🏁', label: 'امتحان الدرس', hint: 'كل الكلمات + جمل — عندك ٣ قلوب', href: `#/exam/${n}` };
  if (st.needsReview) return { key: 'review', icon: '🔁', label: 'راجع الدرس', hint: `${st.lapsed} كلمة بدأت تتنسي`, href: `#/session?lesson=${n}` };
  if (st.crownReady) return { key: 'crown', icon: '👑', label: 'امتحان التثبيت', hint: 'اتأكد إنك لسه فاكر الدرس', href: `#/exam/${n}?kind=crown` };
  if (!st.crown) return { key: 'wait', icon: '⏳', label: `التثبيت بعد ${st.crownIn === 1 ? 'يوم' : st.crownIn === 2 ? 'يومين' : st.crownIn + ' أيام'}`, hint: 'لحد ساعتها راجع والعب', href: `#/session?lesson=${n}` };
  return { key: 'done', icon: '👑', label: 'الدرس ثابت', hint: 'كمّل مراجعة من وقت للتاني', href: `#/session?lesson=${n}` };
}

export function allPassed() { return sortedLessonNs().every(n => !!examOf(n).passed); }

// مهمة المراجعة (بعد الـ15 امتحان): أول ما تتحقق (مفيش مستحق + ١٠ إجابات) بتتعلّم خالصة لآخر اليوم.
// بتتنادى مع كل إجابة — قبل ما الغلطة ترجّع كلمة للمراجعة — عشان غلطة بعدها ما تفتحش المهمة والتذكيرات تاني
export function latchReview() {
  const day = (store.state.days || {})[today()];
  if (!day || day.reviewDone || (day.done | 0) < 10 || !allPassed() || counts().due > 0) return;
  day.reviewDone = true;
  store.save();
}

// مهمة النهارده — mode 'lesson' (افتراضي): تنجح في امتحان درس (أو تاج) النهارده · mode 'goal': توصل لهدف الإجابات
export function mission() {
  const s = store.state.settings || {};
  const mode = s.missionMode === 'goal' ? 'goal' : 'lesson';
  const day = (store.state.days || {})[today()] || {};
  const due = counts().due;
  const goal = Math.max(1, +s.dailyGoal || 20);
  const answers = day.done | 0;
  if (mode === 'goal') {
    return { mode, done: answers >= goal, answers, goal, due, title: `هدف النهارده: ${goal} إجابة`, lesson: currentLesson() };
  }
  const lesson = currentLesson();
  const st = lessonStatus(lesson);
  const passedToday = (day.exams | 0) > 0 || (day.crowns | 0) > 0;     // أول نجاح بس (progress.recordExam)
  if (allPassed()) {
    // كل الامتحانات خلصت: لو فيه تاج جاهز → المهمة التاج، غير كده مراجعة المستحق + ١٠ إجابات
    if (st.crownReady) return { mode, done: passedToday, answers, goal, due, lesson, status: st, step: nextStep(lesson, st), title: `خد تاج الدرس ${lesson} 👑` };
    const step = due > 0
      ? { key: 'review', icon: '🧠', label: 'راجع الكلمات المستحقة', hint: `${due} كلمة مستنية`, href: '#/session' }
      : { key: 'play', icon: '🎮', label: 'العب لعبة', hint: `${Math.max(0, 10 - answers)} إجابة وتخلص`, href: '#/games' };
    // لما توصلها مرة النهارده تفضل خالصة (غلطة بعدها بترجّع كلمة للمراجعة بس مش بتفتح المهمة والتذكيرات تاني)
    const reached = due === 0 && answers >= 10;
    if (reached && !day.reviewDone) { store.touchDay().reviewDone = true; store.save(); }
    return { mode, review: true, done: passedToday || reached || !!day.reviewDone, answers, goal: 10, due, lesson, status: st, step, title: 'راجع الكلمات المستحقة + ١٠ إجابات' };
  }
  return { mode, done: passedToday, answers, goal, due, lesson, status: st, step: nextStep(lesson, st), title: `خلّص الدرس ${lesson} النهارده` };
}

// ---------- المستوى ----------
export const levelXp = L => 50 * L * (L - 1);          // L2 = 100, L3 = 300, L4 = 600 …
export function level(xp = store.state.xp | 0) {
  let L = 1;
  while (xp >= levelXp(L + 1)) L++;
  const from = levelXp(L), to = levelXp(L + 1);
  return { level: L, xp, from, to, pct: Math.round((100 * (xp - from)) / (to - from)) };
}
