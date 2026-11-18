// plan.js — 📅 جدول المذاكرة: كام درس مطلوب النهارده عشان تخلّص A1 قبل تاريخ الهدف
// المطلوب بيتحسب مرة في أول اليوم وما بيتغيّرش طول اليوم:
//   (الدروس اللي لسه ما اتمتحنتش لحد امبارح) ÷ (الأيام الفاضلة لحد تاريخ الهدف، والنهارده منهم) — مقرّب لفوق.
// فلو فوّت يوم، الباقي بيتوزّع على أيام أقل → المطلوب بيزيد لوحده (٢ → ٣ → ٤…)، ولو سبقت بيقل.
// «الدرس خلص» = نجحت في امتحانه 🏁 (exams[n].passed = رقم يوم النجاح) — نظام الامتحان نفسه ما اتلمسش.
// مفيش DOM هنا علشان يتعمل له test في node.
import { DATA } from './data.js';
import { store, todayIndex, dayIndex, dateFromIndex } from './store.js';

// عبد الله (18/11/2026): «أخلّص A1 قبل ١/١ بيوم — يوم ٣١/١٢ أكون ببدأ A2»
export const DEFAULT_TARGET = '2026-12-30';

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(dayIndex(s));

export const planOn = () => (store.state.settings || {}).planOn !== false;

// بروفايل جديد / اتمسح / نسخة قديمة من غير تاريخ بعد ما DEFAULT_TARGET عدّى ← تاريخ قريب يتحفظ مرة واحدة
// (لازم يتحفظ: تاريخ «متحرك» كل يوم كان هيخلّي الأيام الفاضلة ثابتة والمطلوب ما يزيدش لما يفوّت)
export const NEW_PROFILE_DAYS = 42;

export function planTarget(t = todayIndex()) {
  const s = store.state.settings || (store.state.settings = {});
  if (isDate(s.planTarget)) return s.planTarget;
  s.planTarget = dayIndex(DEFAULT_TARGET) >= t ? DEFAULT_TARGET : dateFromIndex(t + NEW_PROFILE_DAYS);
  store.save();
  return s.planTarget;
}

// دروس الكورس اللي ليها كلمات (لو صفحة امتحان DW من غير كلمات دخلت الداتا ما تتحسبش)
export const courseLessons = () => DATA.lessons.filter(l => (l.words || []).length > 0).map(l => l.n).sort((a, b) => a - b);

const passedDay = n => ((store.state.exams || {})[n] || {}).passed | 0;

export function planStatus(t = todayIndex()) {
  const lessons = courseLessons();
  let before = 0, today = 0;
  for (const n of lessons) {
    const p = passedDay(n);
    if (!p) continue;
    if (p < t) before++;
    else today++;                                   // p > t = ساعة الجهاز رجعت لورا: نعدّه النهارده
  }
  const total = lessons.length;
  const target = planTarget(t);
  const targetIdx = dayIndex(target);
  const startLeft = total - before;                  // الباقي في أول النهارده
  const left = Math.max(0, startLeft - today);       // الباقي دلوقتي
  const overdue = t > targetIdx;
  const daysLeft = overdue ? 1 : targetIdx - t + 1;  // النهارده محسوب
  const perDay = startLeft > 0 ? Math.ceil(startLeft / daysLeft) : 0;
  const leftToday = Math.max(0, perDay - today);
  return {
    on: planOn(),
    total,
    passed: before + today,
    doneToday: today,
    left,
    startLeft,
    perDay,
    leftToday,
    metToday: perDay > 0 && today >= perDay,
    target,
    targetIdx,
    daysLeft,
    overdue,
    finished: total > 0 && left === 0,
    a2Day: dateFromIndex(targetIdx + 1),
    nextLesson: lessons.find(n => !passedDay(n)) || null,
  };
}

// صيغ الجمع بالمصري (أرقام غربية): درس واحد · درسين · 3 دروس · 11 درس
export function nLessons(n) {
  n = +n || 0;
  if (n === 0) return 'ولا درس';
  if (n === 1) return 'درس واحد';
  if (n === 2) return 'درسين';
  if (n <= 10) return `${n} دروس`;
  return `${n} درس`;
}

// '2026-12-30' → '30/12' (أو '30/12/2026')
export function fmtDate(s, withYear = false) {
  if (!isDate(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}
