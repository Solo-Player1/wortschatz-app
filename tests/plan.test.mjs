// Tests for plan.js (📅 جدول المذاكرة) + its use in mastery.mission() — plain node, no framework.
// Run from the project root:  node tests/plan.test.mjs   (exit code 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); },
  clear: () => mem.clear(),
  key: i => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

const { DATA } = await import('../www/js/data.js');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'data', 'lessons.json'), 'utf8'));
DATA.version = raw.version || 0;
DATA.lessons = raw.lessons;
DATA.words = raw.words;
DATA.byId = new Map(raw.words.map(w => [w.id, w]));
DATA.translit = {};

const { store, dayIndex, todayIndex, dateFromIndex } = await import('../www/js/store.js');
const plan = await import('../www/js/plan.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
const reset = () => { store.state = JSON.parse(JSON.stringify({ ...store.state, exams: {}, settings: { ...store.state.settings, planTarget: undefined, planOn: undefined } })); };
const passLessons = (ns, day) => { for (const n of ns) store.state.exams[n] = { passed: day, best: 10, tries: 1 }; };
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const T = dayIndex('2026-11-19');                 // a fixed "today" so the test doesn't depend on the clock
const TARGET = dayIndex(plan.DEFAULT_TARGET);     // 2026-12-30
const TOTAL = plan.courseLessons().length;

console.log('plan.js');
test('course has 76 content lessons (DW exam page without words is not counted)', () => {
  assert.equal(TOTAL, DATA.lessons.filter(l => l.words.length).length);
  assert.ok(TOTAL >= 76, `got ${TOTAL}`);
});
test('default target 30/12/2026, A2 starts 31/12', () => {
  reset();
  const p = plan.planStatus(T);
  assert.equal(p.target, '2026-12-30');
  assert.equal(p.a2Day, '2026-12-31');
  assert.equal(p.daysLeft, TARGET - T + 1);
  assert.equal(p.daysLeft, 42);
});
test('15 lessons done before today → 61 left / 42 days = 2 per day', () => {
  reset();
  passLessons(range(1, 15), T - 3);
  const p = plan.planStatus(T);
  assert.equal(p.startLeft, TOTAL - 15);
  assert.equal(p.perDay, Math.ceil((TOTAL - 15) / 42));
  assert.equal(p.perDay, 2);
  assert.equal(p.doneToday, 0);
  assert.equal(p.leftToday, 2);
  assert.equal(p.metToday, false);
});
test('missed days → the quota rises by itself (2 → 3 → 4)', () => {
  reset();
  passLessons(range(1, 15), T - 3);
  const at = d => plan.planStatus(d).perDay;
  assert.equal(at(T), 2);
  assert.equal(at(TARGET - 29), 3);                // 30 days left
  assert.equal(at(TARGET - 19), 4);                // 20 days left
  assert.ok(at(TARGET) >= TOTAL - 15);             // last day: everything
});
test('quota is fixed during the day; passing lessons today counts down leftToday', () => {
  reset();
  passLessons(range(1, 15), T - 3);
  passLessons([16], T);
  let p = plan.planStatus(T);
  assert.equal(p.perDay, 2);
  assert.equal(p.doneToday, 1);
  assert.equal(p.leftToday, 1);
  assert.equal(p.metToday, false);
  passLessons([17], T);
  p = plan.planStatus(T);
  assert.equal(p.perDay, 2);
  assert.equal(p.leftToday, 0);
  assert.equal(p.metToday, true);
  assert.equal(p.passed, 17);
  assert.equal(p.left, TOTAL - 17);
});
test('working ahead lowers the next days', () => {
  reset();
  passLessons(range(1, 30), T - 1);
  assert.equal(plan.planStatus(T).perDay, Math.ceil((TOTAL - 30) / 42));
  assert.equal(plan.planStatus(T).perDay, 2);
  reset();
  passLessons(range(1, 60), T - 1);
  assert.equal(plan.planStatus(T).perDay, 1);
});
test('after the (saved) target date: overdue, everything due today', () => {
  reset();
  store.state.settings.planTarget = plan.DEFAULT_TARGET;        // the date this profile has been using
  passLessons(range(1, 70), T - 1);
  const p = plan.planStatus(TARGET + 2);
  assert.equal(p.overdue, true);
  assert.equal(p.daysLeft, 1);
  assert.equal(p.perDay, TOTAL - 70);
});
test('all lessons passed → finished, no quota', () => {
  reset();
  passLessons(plan.courseLessons(), T - 1);
  const p = plan.planStatus(T);
  assert.equal(p.finished, true);
  assert.equal(p.perDay, 0);
  assert.equal(p.metToday, false);
});
test('custom target from settings; invalid value falls back to the default', () => {
  reset();
  store.state.settings.planTarget = '2027-01-31';
  assert.equal(plan.planTarget(T), '2027-01-31');
  assert.equal(plan.planStatus(T).daysLeft, dayIndex('2027-01-31') - T + 1);
  store.state.settings.planTarget = 'bogus';
  assert.equal(plan.planTarget(T), '2026-12-30');
});
test('profile without a date after the default passed → its own target 42 days ahead, saved once', () => {
  reset();
  const late = dayIndex('2027-01-10');
  assert.equal(plan.planTarget(late), dateFromIndex(late + plan.NEW_PROFILE_DAYS));
  assert.equal(store.state.settings.planTarget, dateFromIndex(late + plan.NEW_PROFILE_DAYS), 'persisted');
  assert.equal(plan.planStatus(late).daysLeft, 43);
  assert.equal(plan.planStatus(late + 1).daysLeft, 42, 'fixed target → missed days shrink the window');
  assert.equal(plan.planStatus(late).overdue, false);
});
test('clock moved back (passed day in the future) counts as today', () => {
  reset();
  passLessons([1], T + 5);
  assert.equal(plan.planStatus(T).doneToday, 1);
});
test('nLessons / fmtDate (Egyptian plural, western digits)', () => {
  assert.equal(plan.nLessons(1), 'درس واحد');
  assert.equal(plan.nLessons(2), 'درسين');
  assert.equal(plan.nLessons(4), '4 دروس');
  assert.equal(plan.nLessons(14), '14 درس');
  assert.equal(plan.fmtDate('2026-12-30'), '30/12');
  assert.equal(plan.fmtDate('2026-12-30', true), '30/12/2026');
  assert.equal(plan.fmtDate('x'), '');
});

// ---- mission() uses the plan (real clock — only relative checks) ----
let mastery = null, progress = null;
try { mastery = await import('../www/js/mastery.js'); progress = await import('../www/js/progress.js'); } catch (e) { console.log('  skip mission tests (import failed: ' + (e && e.message) + ')'); }
if (mastery) {
  console.log('mastery.mission() + plan');
  const t = todayIndex();
  test('plan on: mission title/done follow today\'s quota', () => {
    reset();
    store.state.settings.missionMode = 'lesson';
    store.state.settings.planTarget = dateFromIndex(t + 20);     // relative to the real clock → quota 3 on any day
    passLessons(range(1, 15), t - 1);
    const p = plan.planStatus(t);
    assert.ok(p.perDay > 1 && 15 + p.perDay < TOTAL, `quota ${p.perDay}`);
    const m = mastery.mission();
    assert.ok(m.plan, 'mission carries the plan');
    assert.equal(m.plan.perDay, p.perDay);
    assert.equal(m.done, false);
    assert.equal(m.lesson, 16);
    assert.ok(/مطلوب النهارده/.test(m.title) && /الدرس 16/.test(m.title), m.title);
    passLessons([16], t);
    assert.equal(mastery.mission().done, false, 'one lesson is not the quota');
    passLessons(range(17, 15 + p.perDay), t);
    assert.equal(mastery.mission().done, true);
  });
  test('target date passed: mission falls back to one lesson (no impossible quota, reminders can stop)', () => {
    reset();
    store.state.settings.missionMode = 'lesson';
    store.state.settings.planTarget = dateFromIndex(t - 2);
    passLessons(range(1, 15), t - 5);
    assert.equal(plan.planStatus(t).overdue, true);
    const m = mastery.mission();
    assert.equal(m.plan, undefined);
    assert.equal(m.title, 'خلّص الدرس 16 النهارده');
    progress.recordExam(16, { kind: 'exam', passed: true, score: 100 });   // the real path (counts days[today].exams)
    assert.equal(mastery.mission().done, true);
  });
  test('plan off: back to the old rule (one lesson exam today = done)', () => {
    reset();
    store.state.settings.missionMode = 'lesson';
    store.state.settings.planOn = false;
    passLessons(range(1, 15), t - 1);
    const m = mastery.mission();
    assert.equal(m.plan, undefined);
    assert.equal(m.title, 'خلّص الدرس 16 النهارده');
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
