// srs.js — جدولة المراجعة (Spaced Repetition) والتقييم وبناء جلسة المذاكرة
// مفيش DOM هنا علشان يتعمل له test في node
import { DATA, lessonOf, wordsOfLesson } from './data.js';
import { store, todayIndex } from './store.js';
import { pickType, shuffle } from './exercises.js';

// أيام الإضافة لكل صندوق 0..6
export const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
export const MAX_BOX = INTERVALS.length - 1;

const DEFAULT_STATE = () => ({ box: 0, due: 0, seen: 0, ok: 0, bad: 0, last: 0 });

const progress = () => store.state.progress || (store.state.progress = {});
const hasProgress = s => !!(s && s.seen > 0);

// سجل الكلمة (الحقيقي لو موجود، وإلا نسخة افتراضية مش محفوظة)
export function getState(id) { return progress()[id] || DEFAULT_STATE(); }
function ensureState(id) {
  const p = progress();
  if (!p[id]) p[id] = DEFAULT_STATE();
  return p[id];
}

export const isSeen = id => getState(id).seen > 0;
export const isLearned = id => getState(id).box >= 1;    // اتعلمتها
export const isKnown = id => getState(id).box >= 2;      // عارفها
export const isMastered = id => getState(id).box >= 4;   // ثابتة

export function stage(id) {
  const s = getState(id);
  if (!(s.seen > 0)) return 'new';
  if (s.box >= 4) return 'mastered';
  if (s.box >= 2) return 'known';
  return 'learning';
}

// كل الكلمات أو كلمات درس معيّن (بترتيب الدرس)
const pool = lessonN => (lessonN ? wordsOfLesson(lessonN) : DATA.words);
const byDueThenBox = p => (a, b) => (p[a.id].due - p[b.id].due) || (p[a.id].box - p[b.id].box);

// الكلمات اللي جه وقت مراجعتها: due ≤ النهارده، الأقدم أولاً وبعدين الصندوق الأصغر
export function dueWords(lessonN) {
  const t = todayIndex(), p = progress();
  return pool(lessonN).filter(w => hasProgress(p[w.id]) && p[w.id].due <= t).sort(byDueThenBox(p));
}

// كلمات لسه ما شافهاش، بترتيب الدروس (الدرس 1 الأول، وجوه الدرس بالترتيب)
export function newWords(limit, lessonN) {
  const max = (limit === undefined || limit === null) ? Infinity : Math.max(0, +limit || 0);
  if (max === 0) return [];
  const out = [], visited = new Set();
  const lessons = lessonN ? [lessonOf(lessonN)].filter(Boolean) : DATA.lessons.slice().sort((a, b) => a.n - b.n);
  const consider = id => {
    if (visited.has(id)) return false;
    visited.add(id);
    const w = DATA.byId.get(id);
    if (!w || isSeen(id)) return false;
    out.push(w);
    return out.length >= max;
  };
  for (const l of lessons) for (const id of l.words || []) if (consider(id)) return out;
  if (!lessonN) for (const w of DATA.words) if (consider(w.id)) return out;   // كلمات مش في أي درس (احتياطي)
  return out;
}

// تقييم إجابة: ok=صح، early=مراجعة قبل وقتها، retry=إعادة بعد غلط في نفس الجلسة
export function grade(id, ok, { early = false, retry = false } = {}) {
  const s = ensureState(id), t = todayIndex();
  if (ok) {
    if (!early) {
      s.box = Math.min(MAX_BOX, (s.box | 0) + 1);
      s.due = t + INTERVALS[s.box];
    }
    s.ok = (s.ok | 0) + 1;
  } else {
    s.box = 0;
    s.due = t;
    s.bad = (s.bad | 0) + 1;
  }
  s.seen = (s.seen | 0) + 1;
  s.last = Date.now();
  const xp = ok ? (retry ? 5 : 10) : 0;
  const day = store.touchDay();
  store.state.xp = (store.state.xp | 0) + xp;
  day.xp = (day.xp | 0) + xp;
  if (!retry) day.done = (day.done | 0) + 1;   // الهدف اليومي بيعدّ أول محاولة بس
  store.save();
  return { state: s, xp };
}

// الكلمة اتعرضت لأول مرة (كارت تعريف) من غير ما تتجاوب
export function markIntro(id) {
  const s = ensureState(id);
  const wasNew = !(s.seen > 0);
  if (wasNew) {
    s.seen = 1;
    s.box = 0;
    s.due = todayIndex();
    const day = store.touchDay();
    day.new = (day.new | 0) + 1;
  }
  s.last = Date.now();
  store.save();
  return s;
}

// XP من غير SRS (لعبة التوصيل مثلاً)
export function addXp(n) {
  const xp = Math.max(0, n | 0);
  store.state.xp = (store.state.xp | 0) + xp;
  const day = store.touchDay();
  day.xp = (day.xp | 0) + xp;
  store.save();
  return store.state.xp;
}

// إحصائيات الكلمات كلها أو درس واحد
export function counts(lessonN) {
  const words = pool(lessonN), t = todayIndex(), p = progress();
  const c = { total: words.length, new: 0, learning: 0, known: 0, mastered: 0, due: 0 };
  for (const w of words) {
    const s = p[w.id];
    if (!hasProgress(s)) { c.new++; continue; }
    if (s.box >= 4) c.mastered++;
    else if (s.box >= 2) c.known++;
    else c.learning++;
    if (s.due <= t) c.due++;
  }
  return c;
}
export const countsAll = () => counts();
export const lessonCounts = n => counts(n);

// خلط خفيف: نخلط جوه كل 4 عناصر بس علشان الأقدم يفضل قريب من الأول
function lightShuffle(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 4) out.push(...shuffle(arr.slice(i, i + 4)));
  return out;
}

// الكلمات الجديدة: تعريف، وبعده بـ 2–3 عناصر اختبار mcq_de_ar لنفس الكلمة
function interleaveNew(reviewItems, newIds) {
  const items = reviewItems.slice();
  const n = newIds.length;
  if (!n) return items;
  const intro = id => ({ id, type: 'intro' });
  const check = id => ({ id, type: 'mcq_de_ar' });
  if (n === 1) {
    // كلمة واحدة: نحطّها قبل آخر مراجعتين علشان الاختبار ما يجيش وراها على طول
    const tail = items.splice(Math.max(0, items.length - 2));
    items.push(intro(newIds[0]), ...tail, check(newIds[0]));
    return items;
  }
  // النمط: جديد، جديد، اختبار الأولى، جديد، اختبار اللي قبلها، … وفي الآخر اختبار الأخيرة
  items.push(intro(newIds[0]), intro(newIds[1]), check(newIds[0]));
  for (let k = 2; k < n; k++) items.push(intro(newIds[k]), check(newIds[k - 1]));
  items.push(check(newIds[n - 1]));
  return items;
}

// بناء جلسة: مراجعات مستحقة أولاً، بعدين كلمات جديدة؛ لو مفيش ولا ده ولا ده → مراجعة مبكّرة
export function buildSession({ lesson = null, newLimit, maxReviews = 30 } = {}) {
  const settings = store.state.settings || {};
  if (newLimit === undefined || newLimit === null) newLimit = settings.newPerSession;
  if (newLimit === undefined || newLimit === null) newLimit = 8;
  newLimit = Math.max(0, +newLimit || 0);
  maxReviews = Math.max(0, +maxReviews || 0);
  const lessonN = lesson ? +lesson : null;

  let reviews = dueWords(lessonN).slice(0, maxReviews);
  const news = newWords(newLimit, lessonN);
  let early = false;
  if (!reviews.length && !news.length) {
    // مفيش حاجة مستحقة ولا جديدة: نراجع أقرب 20 كلمة في المستقبل (بتتقيّم بـ early:true)
    early = true;
    const p = progress();
    reviews = pool(lessonN).filter(w => hasProgress(p[w.id])).sort(byDueThenBox(p)).slice(0, 20);
  }
  const reviewItems = lightShuffle(reviews).map(w => {
    const type = pickType(w, getState(w.id));
    return { id: w.id, type: type === 'intro' ? 'mcq_de_ar' : type };
  });
  return {
    items: interleaveNew(reviewItems, news.map(w => w.id)),
    newIds: news.map(w => w.id),
    reviewIds: reviews.map(w => w.id),
    early,
  };
}
