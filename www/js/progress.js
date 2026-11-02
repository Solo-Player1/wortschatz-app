// progress.js — تسجيل التقدّم اللي مش جوه صناديق المراجعة: الكتابة الصح، الجمل/الأسئلة، الألعاب، الامتحانات
import { store, todayIndex } from './store.js';

const prog = () => (store.state.progress ||= {});
const items = () => (store.state.items ||= {});
const word = id => (prog()[id] ||= { box: 0, due: 0, seen: 0, ok: 0, bad: 0, last: 0 });

// كتابة الكلمة صح (بالأداة للأسماء) = دليل إنك حافظها فعلاً
export function recordTyped(id, ok) {
  if (!id) return;
  const s = word(id);
  if (ok) s.typed = (s.typed | 0) + 1;
  else {
    s.typedBad = (s.typedBad | 0) + 1;
    if (s.seen > 0 && s.due > todayIndex()) s.due = todayIndex();   // غلطت فيها → ترجعلك النهارده
  }
  store.save();
}
export const typedCount = id => ((prog()[id] || {}).typed | 0);

// غلطة في لعبة (من غير كتابة): نرجّع الكلمة للمراجعة النهارده من غير ما نغيّر صندوقها
export function weakWord(id) {
  const s = prog()[id];
  if (s && s.seen > 0 && s.due > todayIndex()) { s.due = todayIndex(); store.save(); }
}

// الجمل وأسئلة الاستفهام والتصريف: { ok, bad, last }
export function recordItem(id, ok) {
  if (!id) return;
  const it = (items()[id] ||= { ok: 0, bad: 0, last: 0 });
  if (ok) it.ok = (it.ok | 0) + 1; else it.bad = (it.bad | 0) + 1;
  it.last = todayIndex();
  store.save();
}
export const itemState = id => items()[id] || { ok: 0, bad: 0, last: 0 };
export const itemDone = id => (itemState(id).ok | 0) > 0;

// كل إجابة في لعبة بتتحسب في هدف النهارده
export function countAnswer() {
  const d = store.touchDay();
  d.done = (d.done | 0) + 1;
  store.save();
}
export function finishGame(gameId, { score = 0, win = false } = {}) {
  const g = (store.state.games ||= {});
  const r = (g[gameId] ||= { best: 0, plays: 0, wins: 0, last: 0 });
  const record = score > (r.best | 0);
  r.best = Math.max(r.best | 0, score | 0);
  r.plays = (r.plays | 0) + 1;
  if (win) r.wins = (r.wins | 0) + 1;
  r.last = todayIndex();
  const d = store.touchDay();
  d.games = (d.games | 0) + 1;
  store.bumpStreak();                 // لعبة خلصت = يوم مذاكرة للستريك
  store.save();
  return { record, best: r.best };
}
export const gameRecord = id => ((store.state.games || {})[id]) || { best: 0, plays: 0, wins: 0, last: 0 };

// الامتحانات: exams[n] = { passed: يوم النجاح, best, tries, crown: يوم التاج, crownTries, lastTry }
export function examRec(n) { return ((store.state.exams ||= {})[n] ||= { passed: 0, best: 0, tries: 0, crown: 0, crownTries: 0, lastTry: 0 }); }
// بيرجّع { rec, first } — first = أول مرة ينجح فيها (هي بس اللي بتتحسب في مهمة النهارده والـ XP الكبير)
export function recordExam(n, { kind = 'exam', passed = false, score = 0 } = {}) {
  const r = examRec(n), t = todayIndex();
  r.lastTry = t;
  let first = false;
  if (kind === 'crown') {
    r.crownTries = (r.crownTries | 0) + 1;
    if (passed && !r.crown) { r.crown = t; first = true; }
  } else {
    r.tries = (r.tries | 0) + 1;
    r.best = Math.max(r.best | 0, score | 0);
    if (passed && !r.passed) { r.passed = t; first = true; }
  }
  const d = store.touchDay();
  if (first) d[kind === 'crown' ? 'crowns' : 'exams'] = (d[kind === 'crown' ? 'crowns' : 'exams'] | 0) + 1;
  store.bumpStreak();                 // الامتحان = مذاكرة يوم كامل للستريك
  store.save();
  return { rec: r, first };
}

// بعد النجاح في الامتحان: الكلمات اللي كتبتها صح فيه ولسه ما دخلتش المراجعة بتتحسب «اتعلمتها» (صندوق 1، مراجعة بكره)
export function promoteProven(words) {
  const t = todayIndex();
  let n = 0;
  for (const w of words) {
    const s = word(w.id);
    if (s.seen > 0) continue;
    if ((s.typed | 0) > 0 || itemDone('p:' + w.id)) {
      s.seen = 1; s.box = 1; s.due = t + 1; s.ok = (s.ok | 0) + 1; s.last = Date.now();
      n++;
    }
  }
  if (n) store.save();
  return n;
}

