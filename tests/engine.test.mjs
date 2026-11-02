// Engine tests for srs.js / exercises.js / audio.js — plain node, no framework.
// Run from the project root:  node tests/engine.test.mjs   (exit code 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- in-memory localStorage BEFORE store.js is imported ----
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); },
  clear: () => mem.clear(),
  key: i => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

const { DATA, displayDe, wordsOfLesson, pluralOf } = await import('../www/js/data.js');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'data', 'lessons.json'), 'utf8'));
DATA.version = raw.version || 0;
DATA.lessons = raw.lessons;
DATA.words = raw.words;
DATA.byId = new Map(raw.words.map(w => [w.id, w]));
DATA.translit = {};

const { store, todayIndex, today } = await import('../www/js/store.js');
const srs = await import('../www/js/srs.js');
const ex = await import('../www/js/exercises.js');
const audio = await import('../www/js/audio.js');

// ---- tiny runner: tests run one after another (sync or async) in definition order ----
let passed = 0, failed = 0;
const failures = [];
let chain = Promise.resolve();
function test(name, fn) {
  chain = chain.then(async () => {
    try { await fn(); passed++; console.log('  ok   ' + name); }
    catch (e) { failed++; failures.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
  });
}
const assert = (c, msg) => { if (!c) throw new Error(msg || 'assertion failed'); };
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const section = t => { chain = chain.then(() => console.log('\n# ' + t)); };
const fresh = () => { store.reset(); };
const T = () => todayIndex();
const W = DATA.words;
const byDe = de => W.filter(w => w.de === de);
const one = de => { const r = byDe(de); if (r.length !== 1) throw new Error(`fixture "${de}" matched ${r.length} words`); return r[0]; };
const setState = (id, s) => { store.state.progress[id] = { box: 0, due: 0, seen: 1, ok: 0, bad: 0, last: 0, ...s }; };
const uniq = arr => new Set(arr).size === arr.length;
const singleLessonWords = n => wordsOfLesson(n).filter(w => w.lessons.length === 1);

// ================================================================
section('data sanity');
test('data loaded: 15 lessons, 341 words, unique ids', () => {
  eq(DATA.lessons.length, 15, 'lessons');
  eq(W.length, 341, 'words');
  assert(uniq(W.map(w => w.id)), 'ids unique');
  assert(W.every(w => w.file), 'every word has an audio file');
});

// ================================================================
section('grade() transitions');
test('markIntro: seen=1 box=0 due=today, days.new++ once', () => {
  fresh();
  const w = W[0];
  const s = srs.markIntro(w.id);
  eq(s.seen, 1, 'seen'); eq(s.box, 0, 'box'); eq(s.due, T(), 'due');
  eq(store.state.days[today()].new, 1, 'new');
  srs.markIntro(w.id);               // second intro of the same word is harmless
  eq(store.state.progress[w.id].seen, 1, 'seen stays 1');
  eq(store.state.days[today()].new, 1, 'new not double counted');
  assert(srs.isSeen(w.id) && !srs.isLearned(w.id), 'seen but not learned');
  eq(srs.stage(w.id), 'learning', 'stage after intro');
});

test('correct answers climb boxes with INTERVALS and award 10 xp', () => {
  fresh();
  const id = W[1].id;
  srs.markIntro(id);
  const expectDue = [1, 3, 7, 14, 30, 60];
  for (let i = 0; i < 6; i++) {
    const { state, xp } = srs.grade(id, true);
    eq(state.box, i + 1, `box after ${i + 1} ok`);
    eq(state.due, T() + expectDue[i], `due after ${i + 1} ok`);
    eq(xp, 10, 'xp');
  }
  const { state } = srs.grade(id, true);
  eq(state.box, 6, 'box capped at 6');
  eq(state.due, T() + 60, 'due stays +60');
  eq(state.seen, 8, 'seen = intro + 7 answers');
  eq(state.ok, 7, 'ok count');
  eq(state.bad, 0, 'bad count');
  assert(state.last > 0, 'last set');
  eq(store.state.xp, 70, 'store xp');
  eq(store.state.days[today()].xp, 70, 'day xp');
  eq(store.state.days[today()].done, 7, 'day done');
  eq(srs.stage(id), 'mastered', 'stage');
  assert(srs.isLearned(id) && srs.isKnown(id) && srs.isMastered(id), 'flags');
});

test('stage thresholds: box 1 learning, 2-3 known, 4+ mastered', () => {
  fresh();
  const id = W[2].id;
  setState(id, { box: 1 }); eq(srs.stage(id), 'learning');
  setState(id, { box: 2 }); eq(srs.stage(id), 'known'); assert(srs.isKnown(id) && !srs.isMastered(id));
  setState(id, { box: 3 }); eq(srs.stage(id), 'known');
  setState(id, { box: 4 }); eq(srs.stage(id), 'mastered');
  eq(srs.stage('nope'), 'new', 'unknown id is new');
  const d = srs.getState('nope');
  eq(d.box, 0); eq(d.seen, 0); eq(d.due, 0);
});

test('lapse: wrong answer resets to box 0, due today, bad++, xp 0', () => {
  fresh();
  const id = W[3].id;
  setState(id, { box: 5, due: T() - 2, seen: 9, ok: 8 });
  const { state, xp } = srs.grade(id, false);
  eq(state.box, 0); eq(state.due, T()); eq(state.bad, 1); eq(state.ok, 8); eq(state.seen, 10); eq(xp, 0);
  eq(store.state.xp, 0, 'no xp'); eq(store.state.days[today()].done, 1, 'still counts as answered');
  eq(srs.stage(id), 'learning');
});

test('early review: ok keeps box/due, still counts seen/ok/xp; wrong still resets', () => {
  fresh();
  const id = W[4].id;
  setState(id, { box: 3, due: T() + 5, seen: 4, ok: 3 });
  const r = srs.grade(id, true, { early: true });
  eq(r.state.box, 3); eq(r.state.due, T() + 5); eq(r.state.seen, 5); eq(r.state.ok, 4); eq(r.xp, 10);
  const r2 = srs.grade(id, false, { early: true });
  eq(r2.state.box, 0); eq(r2.state.due, T()); eq(r2.state.bad, 1); eq(r2.xp, 0);
});

test('retry: ok gives 5 xp and does not count towards the daily goal', () => {
  fresh();
  const id = W[5].id;
  srs.markIntro(id);
  srs.grade(id, false);                               // first attempt wrong → done 1
  const r = srs.grade(id, true, { retry: true });
  eq(r.xp, 5); eq(r.state.box, 1); eq(r.state.due, T() + 1);
  eq(store.state.days[today()].done, 1, 'done unchanged by retry');
  eq(store.state.days[today()].xp, 5); eq(store.state.xp, 5);
  const r3 = srs.grade(id, false, { retry: true });
  eq(r3.xp, 0); eq(store.state.days[today()].done, 1, 'wrong retry also not counted');
});

test('grade() on a word without record creates it and persists to localStorage', () => {
  fresh();
  const id = W[6].id;
  srs.grade(id, true);
  const saved = JSON.parse(localStorage.getItem('ws:v1'));
  eq(saved.progress[id].box, 1, 'persisted box');
  eq(saved.xp, 10, 'persisted xp');
  store.state = { version: 1, settings: {}, progress: {}, days: {}, streak: {}, xp: 0, lastSession: null };
  store.load();
  eq(store.state.progress[id].box, 1, 'reloaded box');
  eq(store.state.settings.dailyGoal, 20, 'settings merged with defaults');
});

test('addXp adds to total and today without touching progress', () => {
  fresh();
  srs.addXp(15);
  eq(store.state.xp, 15); eq(store.state.days[today()].xp, 15);
  eq(Object.keys(store.state.progress).length, 0);
});

// ================================================================
section('dueWords / newWords ordering');
test('dueWords: only due<=today, sorted by due asc then box asc, lesson filter', () => {
  fresh();
  const L1 = singleLessonWords(1);
  const [A, B, C, D, E, F] = L1;
  setState(A.id, { box: 2, due: T() - 3 });
  setState(B.id, { box: 0, due: T() - 1 });
  setState(C.id, { box: 1, due: T() - 3 });
  setState(D.id, { box: 1, due: T() + 2 });     // future → not due
  setState(E.id, { box: 4, due: T() });
  setState(F.id, { box: 0, due: T() - 10, seen: 0 });  // no real progress → ignored
  const due = srs.dueWords();
  eq(due.map(w => w.id).join(','), [C, A, B, E].map(w => w.id).join(','), 'order');
  eq(srs.dueWords(1).length, 4, 'lesson 1 filter');
  eq(srs.dueWords(2).length, 0, 'lesson 2 has none');
  eq(srs.dueWords(99).length, 0, 'unknown lesson');
});

test('newWords: unseen, lesson order, no duplicates, limit, lesson filter', () => {
  fresh();
  const l1 = DATA.lessons.find(l => l.n === 1).words;
  eq(srs.newWords(5).map(w => w.id).join(','), l1.slice(0, 5).join(','), 'first 5 of lesson 1');
  const all = srs.newWords();
  eq(all.length, 341, 'all unseen without limit');
  assert(uniq(all.map(w => w.id)), 'no duplicates (multi-lesson words appear once)');
  const pos = id => all.findIndex(w => w.id === id);
  const lastL1 = Math.max(...singleLessonWords(1).map(w => pos(w.id)));
  const firstL2 = Math.min(...singleLessonWords(2).map(w => pos(w.id)));
  assert(lastL1 < firstL2, `lesson 1 words come before lesson 2 words (${lastL1} < ${firstL2})`);
  srs.markIntro(l1[0]); srs.markIntro(l1[1]); srs.markIntro(l1[2]);
  eq(srs.newWords(2).map(w => w.id).join(','), l1.slice(3, 5).join(','), 'skips seen words');
  eq(srs.newWords(0).length, 0, 'limit 0');
  const n2 = srs.newWords(5, 2);
  eq(n2.length, 5);
  assert(n2.every(w => w.lessons.includes(2)), 'lesson filter');
  eq(srs.newWords(5, 99).length, 0, 'unknown lesson');
  eq(srs.newWords(3).length, 3, 'limit respected');
});

test('counts()/countsAll()/lessonCounts()', () => {
  fresh();
  const c0 = srs.countsAll();
  eq(c0.total, 341); eq(c0.new, 341); eq(c0.due, 0); eq(c0.learning + c0.known + c0.mastered, 0);
  const L3 = wordsOfLesson(3);
  eq(srs.lessonCounts(3).total, L3.length, 'lesson 3 total');
  setState(L3[0].id, { box: 0, due: T() });
  setState(L3[1].id, { box: 1, due: T() + 1 });
  setState(L3[2].id, { box: 2, due: T() - 1 });
  setState(L3[3].id, { box: 5, due: T() + 30 });
  const c = srs.counts(3);
  eq(c.new, L3.length - 4); eq(c.learning, 2); eq(c.known, 1); eq(c.mastered, 1); eq(c.due, 2);
  eq(srs.countsAll().new, 341 - 4, 'global counts see the same records');
  eq(srs.counts(99).total, 0, 'unknown lesson → empty counts');
});

// ================================================================
section('buildSession');
function checkNewStructure(sess, allowAdjacent = false) {
  const idx = (id, type) => sess.items.findIndex(it => it.id === id && it.type === type);
  for (const id of sess.newIds) {
    const intros = sess.items.filter(it => it.id === id && it.type === 'intro').length;
    const checks = sess.items.filter(it => it.id === id && it.type === 'mcq_de_ar').length;
    eq(intros, 1, `one intro for ${id}`); eq(checks, 1, `one check for ${id}`);
    const gap = idx(id, 'mcq_de_ar') - idx(id, 'intro');
    assert(gap >= 1, `check after intro for ${id} (gap ${gap})`);
    if (!allowAdjacent) assert(gap >= 2 && gap <= 3, `check 2-3 items after intro for ${id} (gap ${gap})`);
  }
  const introIds = sess.items.filter(it => it.type === 'intro').map(it => it.id);
  eq(introIds.length, sess.newIds.length, 'no stray intros');
  assert(sess.reviewIds.every(id => !introIds.includes(id)), 'reviews never get intros');
}

test('fresh store: 8 new words, intro + check 2-3 later, no reviews', () => {
  fresh();
  for (let round = 0; round < 20; round++) {
    const s = srs.buildSession({});
    eq(s.early, false); eq(s.reviewIds.length, 0); eq(s.newIds.length, 8); eq(s.items.length, 16);
    assert(uniq(s.newIds), 'new ids unique');
    eq(s.items[0].type, 'intro', 'session starts with an intro when nothing is due');
    checkNewStructure(s);
    assert(s.items.every(it => ex.TYPES.includes(it.type) && DATA.byId.has(it.id)), 'valid items');
  }
});

test('newLimit variants: 2, 3, 1 (with reviews), settings.newPerSession', () => {
  fresh();
  checkNewStructure(srs.buildSession({ newLimit: 2 }));
  checkNewStructure(srs.buildSession({ newLimit: 3 }));
  store.state.settings.newPerSession = 5;
  eq(srs.buildSession({}).newIds.length, 5, 'defaults to settings.newPerSession');
  // one new word + a few reviews → the check still lands 2-3 after the intro
  const L2 = singleLessonWords(2);
  for (let i = 0; i < 5; i++) setState(L2[i].id, { box: 1, due: T() - 1 });
  for (let round = 0; round < 10; round++) {
    const s = srs.buildSession({ newLimit: 1 });
    eq(s.newIds.length, 1); eq(s.reviewIds.length, 5); eq(s.items.length, 7);
    checkNewStructure(s);
    const reviewItems = s.items.filter(it => s.reviewIds.includes(it.id));
    eq(reviewItems.length, 5, 'all 5 reviews present');
    assert(s.items.slice(0, 3).every(it => s.reviewIds.includes(it.id)), 'at most the last two reviews move behind the intro');
  }
  // one new word and no reviews: check right after (nothing else to put between)
  fresh();
  const s1 = srs.buildSession({ newLimit: 1 });
  eq(s1.items.length, 2); checkNewStructure(s1, true);
});

test('reviews first (lightly shuffled), types via pickType, maxReviews honoured', () => {
  fresh();
  const L1 = singleLessonWords(1), L2 = singleLessonWords(2);
  const dueIds = [];
  for (const w of L1.slice(0, 10)) { setState(w.id, { box: 1, due: T() - 2 }); dueIds.push(w.id); }
  for (const w of L2.slice(0, 30)) { setState(w.id, { box: 2, due: T() - 1 }); dueIds.push(w.id); }
  for (let round = 0; round < 10; round++) {
    const s = srs.buildSession({});
    eq(s.early, false);
    eq(s.reviewIds.length, 30, 'capped at maxReviews=30');
    assert(s.reviewIds.every(id => dueIds.includes(id)), 'reviews are due words');
    // the 10 older (due -2) words must be among the reviews, before newer ones
    assert(L1.slice(0, 10).every(w => s.reviewIds.includes(w.id)), 'oldest due words first');
    const head = s.items.slice(0, 30);
    assert(head.every(it => it.type !== 'intro' && s.reviewIds.includes(it.id)), 'first 30 items are reviews');
    assert(head.every(it => ['mcq_de_ar', 'mcq_ar_de', 'article', 'listen', 'plural', 'type'].includes(it.type)), 'review types graded types');
    eq(s.newIds.length, 8); eq(s.items.length, 30 + 16);
    checkNewStructure(s);
  }
  const s5 = srs.buildSession({ maxReviews: 5 });
  eq(s5.reviewIds.length, 5);
  const s0 = srs.buildSession({ maxReviews: 0, newLimit: 0 });
  assert(s0.early, 'nothing allowed → early fallback');
});

test('lightly shuffled: order varies between builds but stays near the due order', () => {
  fresh();
  const L2 = singleLessonWords(2).slice(0, 12);
  L2.forEach((w, i) => setState(w.id, { box: 1, due: T() - 12 + i }));
  const orders = new Set();
  for (let i = 0; i < 15; i++) {
    const s = srs.buildSession({ newLimit: 0 });
    orders.add(s.items.map(it => it.id).join(','));
    // each item stays within its 4-wide window
    s.items.forEach((it, pos) => {
      const orig = L2.findIndex(w => w.id === it.id);
      assert(Math.floor(orig / 4) === Math.floor(pos / 4), `item ${it.id} moved out of its window`);
    });
  }
  assert(orders.size > 1, 'at least two different orders over 15 builds');
});

test('lesson filter: all ids belong to the lesson; small lesson (10 words)', () => {
  fresh();
  const L3 = wordsOfLesson(3);
  const s = srs.buildSession({ lesson: 3 });
  assert(s.items.every(it => DATA.byId.get(it.id).lessons.includes(3)), 'ids in lesson 3');
  eq(s.newIds.length, 8); eq(s.reviewIds.length, 0); eq(s.early, false);
  const s2 = srs.buildSession({ lesson: 3, newLimit: 20 });
  eq(s2.newIds.length, L3.length, 'fewer than newLimit available → all of them');
  checkNewStructure(s2);
  // lesson given as a string (router param)
  eq(srs.buildSession({ lesson: '3' }).newIds.length, 8);
});

test('early mode: no due + no new → up to 20 soonest-due seen words, graded early', () => {
  fresh();
  const L2 = wordsOfLesson(2);
  L2.forEach((w, i) => setState(w.id, { box: 2 + (i % 3), due: T() + 1 + (i % 7) }));
  const s = srs.buildSession({ lesson: 2 });
  eq(s.early, true); eq(s.newIds.length, 0); eq(s.reviewIds.length, 20); eq(s.items.length, 20);
  assert(s.items.every(it => it.type !== 'intro'), 'no intros in early mode');
  assert(uniq(s.items.map(it => it.id)), 'unique ids');
  // the 20 picked have the smallest due values
  const dues = s.reviewIds.map(id => store.state.progress[id].due);
  const maxPicked = Math.max(...dues);
  const notPicked = L2.filter(w => !s.reviewIds.includes(w.id)).map(w => store.state.progress[w.id].due);
  assert(notPicked.every(d => d >= maxPicked), 'smallest due picked first');
});

test('early mode with fewer than 20 seen words; newLimit 0; fresh+newLimit 0 → empty', () => {
  fresh();
  const L3 = wordsOfLesson(3);
  L3.slice(0, 7).forEach(w => setState(w.id, { box: 1, due: T() + 3 }));
  const s = srs.buildSession({ lesson: 3, newLimit: 0 });
  eq(s.early, true); eq(s.items.length, 7); eq(s.reviewIds.length, 7); eq(s.newIds.length, 0);
  // newLimit 0 while new words exist → still early (user asked for no new words)
  const s2 = srs.buildSession({ newLimit: 0 });
  eq(s2.early, true); eq(s2.items.length, 7);
  // newLimit 0 with due words → plain review session, no intros
  setState(L3[0].id, { box: 1, due: T() });
  const s3 = srs.buildSession({ newLimit: 0 });
  eq(s3.early, false); eq(s3.reviewIds.length, 1); eq(s3.newIds.length, 0); eq(s3.items.length, 1);
  fresh();
  const s4 = srs.buildSession({ newLimit: 0 });
  eq(s4.early, true); eq(s4.items.length, 0); eq(s4.reviewIds.length, 0); eq(s4.newIds.length, 0);
});

test('intro-only words (quit mid-session) come back as reviews with mcq types', () => {
  fresh();
  const w = W[0];
  srs.markIntro(w.id);
  const s = srs.buildSession({ newLimit: 0 });
  eq(s.reviewIds[0], w.id); assert(['mcq_de_ar', 'mcq_ar_de', 'article'].includes(s.items[0].type), 'box 0 type');
});

// ================================================================
section('pickType');
const nounPl = one('das Beispiel, die Beispiele');
const nounNoPl = one('der Käse');
const verb = one('kommen');
const phrase = one('Wie geht es dir?');
const dist = (word, state, n = 400) => { const c = {}; for (let i = 0; i < n; i++) { const t = ex.pickType(word, state); c[t] = (c[t] || 0) + 1; } return c; };
const keys = c => Object.keys(c).sort().join(',');

test('seen 0 → intro, regardless of word', () => {
  for (const w of [nounPl, nounNoPl, verb, phrase]) {
    eq(ex.pickType(w, { box: 0, seen: 0 }), 'intro');
    eq(ex.pickType(w, undefined), 'intro');
    eq(ex.pickType(w, srs.getState(w.id)), 'intro');
  }
});

test('box 0-1: mcq both directions, nouns ~30% article, non-nouns never article', () => {
  for (const box of [0, 1]) {
    const cn = dist(nounPl, { box, seen: 1 });
    eq(keys(cn), 'article,mcq_ar_de,mcq_de_ar', `noun box ${box}`);
    assert(cn.article > 60 && cn.article < 180, `article ~30% (got ${cn.article}/400)`);
    const cv = dist(verb, { box, seen: 3 });
    eq(keys(cv), 'mcq_ar_de,mcq_de_ar', `verb box ${box}`);
    const cp = dist(phrase, { box, seen: 3 });
    eq(keys(cp), 'mcq_ar_de,mcq_de_ar', `phrase box ${box}`);
  }
});

test('box 2-3: listen/mcq_ar_de + article (nouns) + plural (nouns with pl only)', () => {
  for (const box of [2, 3]) {
    eq(keys(dist(nounPl, { box, seen: 5 })), 'article,listen,mcq_ar_de,plural', `noun with pl box ${box}`);
    eq(keys(dist(nounNoPl, { box, seen: 5 })), 'article,listen,mcq_ar_de', `noun without pl box ${box}`);
    eq(keys(dist(verb, { box, seen: 5 })), 'listen,mcq_ar_de', `verb box ${box}`);
    eq(keys(dist(phrase, { box, seen: 5 })), 'listen,mcq_ar_de', `phrase box ${box}`);
  }
});

test('box 4+: type ~50% when settings.typing, never when off; others otherwise', () => {
  fresh();
  store.state.settings.typing = true;
  for (const box of [4, 5, 6]) {
    const c = dist(nounPl, { box, seen: 9 });
    assert(c.type > 130 && c.type < 270, `type ~50% (got ${c.type}/400)`);
    eq(keys(c), 'article,listen,mcq_ar_de,plural,type', `noun box ${box}`);
    eq(keys(dist(verb, { box, seen: 9 })), 'listen,mcq_ar_de,type', `verb box ${box}`);
    eq(keys(dist(nounNoPl, { box, seen: 9 })), 'article,listen,mcq_ar_de,type', `noun no pl box ${box}`);
  }
  store.state.settings.typing = false;
  for (const box of [4, 6]) {
    eq(keys(dist(nounPl, { box, seen: 9 })), 'article,listen,mcq_ar_de,plural', `typing off noun box ${box}`);
    eq(keys(dist(verb, { box, seen: 9 })), 'listen,mcq_ar_de', `typing off verb box ${box}`);
  }
  store.state.settings.typing = true;
});

test('listen only when word.file exists', () => {
  const noFile = { ...verb, file: '' };
  eq(keys(dist(noFile, { box: 2, seen: 5 })), 'mcq_ar_de');
  eq(keys(dist(noFile, { box: 5, seen: 5 })), 'mcq_ar_de,type');
});

// ================================================================
section('makeExercise for every word / every applicable type');
const allPlurals = new Set(W.filter(w => w.k === 'noun' && w.pl).map(w => ex.normDe(w.pl)));
const wordsByDe = new Map();
for (const w of W) { const k = ex.normDe(displayDe(w)); if (!wordsByDe.has(k)) wordsByDe.set(k, []); wordsByDe.get(k).push(w); }
const applicable = w => {
  const t = ['intro', 'mcq_de_ar', 'mcq_ar_de', 'type'];
  if (w.file) t.push('listen');
  if (w.k === 'noun') t.push('article');
  if (w.k === 'noun' && w.pl) t.push('plural');
  return t;
};
function checkOptions(e, n, isDe) {
  assert(Array.isArray(e.options), 'options array');
  eq(e.options.length, n, `${e.type}: ${n} options`);
  eq(e.options.filter(o => o.correct).length, 1, `${e.type}: exactly one correct`);
  assert(e.options.every(o => typeof o.text === 'string' && o.text.trim() && o.isDe === isDe), `${e.type}: texts non-empty, isDe=${isDe}`);
  const norm = isDe ? ex.normDe : ex.normAr;
  assert(uniq(e.options.map(o => norm(o.text))), `${e.type}: no duplicate option texts (${e.options.map(o => o.text).join(' | ')})`);
}
function checkExercise(w, type, e) {
  eq(e.type, type, 'type kept'); eq(e.id, w.id, 'id'); assert(e.word === w, 'word ref'); assert(e.prompt && typeof e.prompt === 'object', 'prompt');
  const myAr = ex.normAr(w.ar);
  switch (type) {
    case 'intro':
      assert(e.prompt.de.startsWith('<bdi class="de'), 'intro de html');
      eq(e.prompt.ar, w.ar); eq(e.prompt.audio, 'audio/' + w.file); assert(typeof e.prompt.hint === 'string');
      break;
    case 'mcq_de_ar': {
      assert(e.prompt.de.includes('<bdi class="de'), 'de html'); eq(e.prompt.audio, 'audio/' + w.file); assert(!e.prompt.ar, 'no Arabic in prompt');
      checkOptions(e, 4, false);
      eq(e.options.find(o => o.correct).text, w.ar, 'correct is word.ar');
      // never a distractor that is actually a right answer (same German text, other meaning)
      const myDe = ex.normDe(displayDe(w));
      for (const o of e.options.filter(o => !o.correct)) {
        const sources = W.filter(x => ex.normAr(x.ar) === ex.normAr(o.text));
        assert(sources.length, 'distractor Arabic comes from the data');
        assert(sources.every(x => ex.normDe(displayDe(x)) !== myDe), `distractor "${o.text}" is a meaning of the same German word`);
      }
      break;
    }
    case 'mcq_ar_de':
    case 'listen': {
      if (type === 'listen') { eq(e.prompt.audio, 'audio/' + w.file); assert(!e.prompt.de && !e.prompt.ar, 'listen prompt has only audio'); }
      else { eq(e.prompt.ar, w.ar); assert(!e.prompt.de && !e.prompt.audio, 'ar→de prompt has only Arabic'); }
      checkOptions(e, 4, true);
      eq(e.options.find(o => o.correct).text, displayDe(w), 'correct is displayDe');
      for (const o of e.options.filter(o => !o.correct)) {
        const sources = wordsByDe.get(ex.normDe(o.text)) || [];
        assert(sources.length, `distractor "${o.text}" comes from the data`);
        assert(sources.every(x => ex.normAr(x.ar) !== myAr), `distractor "${o.text}" has the same Arabic meaning as the prompt`);
        assert(ex.normDe(o.text) !== ex.normDe(displayDe(w)), 'distractor != answer');
      }
      break;
    }
    case 'article':
      assert(e.prompt.de.includes(w.sg) && !e.prompt.de.includes('class="art'), 'noun shown without article');
      checkOptions(e, 3, true);
      eq(e.options.map(o => o.text).join(','), 'der,die,das', 'three articles');
      eq(e.options.find(o => o.correct).text, w.art, 'correct article');
      break;
    case 'plural': {
      assert(e.prompt.de.includes('class="art'), 'headword with article'); eq(e.prompt.ar, w.ar);
      checkOptions(e, 3, true);
      eq(e.options.find(o => o.correct).text, w.pl, 'correct plural');
      for (const o of e.options.filter(o => !o.correct)) {
        assert(o.text.startsWith('die '), `wrong plural "${o.text}" starts with die`);
        assert(ex.normDe(o.text) !== ex.normDe(w.pl), 'wrong plural != real');
        assert(!allPlurals.has(ex.normDe(o.text)), `wrong plural "${o.text}" is a real plural of some noun`);
        assert(o.text.length > 4, 'non-empty plural');
      }
      break;
    }
    case 'type': {
      eq(e.prompt.ar, w.ar); assert(!e.prompt.de, 'no German in prompt'); assert(Array.isArray(e.accept), 'accept array');
      assert(typeof e.answer === 'string' && e.answer.trim(), 'answer present');
      if (w.k === 'noun') { eq(e.answer, w.sg, 'noun → sg'); assert(e.accept.includes(`${w.art} ${w.sg}`), 'accepts art sg'); }
      else {
        assert(!/^\(/.test(e.answer), 'no leading marker');
        assert(!/[.!?…,;:\s]$/.test(e.answer), 'no trailing punctuation');
        assert(w.de.includes(e.answer), 'answer is part of de');
      }
      assert(ex.gradeAnswer(e, e.answer).ok, 'answer grades ok');
      for (const a of e.accept) assert(ex.gradeAnswer(e, a).ok, `accept "${a}" grades ok`);
      assert(!ex.gradeAnswer(e, e.answer + 'xyz').ok, 'garbage not ok');
      break;
    }
  }
}
test('every word × every applicable type × 4 rounds', () => {
  let count = 0;
  for (const w of W) for (const type of applicable(w)) for (let r = 0; r < 4; r++) {
    const e = ex.makeExercise(w, type);
    try { checkExercise(w, type, e); } catch (err) { throw new Error(`${w.de} [${type}]: ${err.message}`); }
    count++;
  }
  assert(count > 341 * 4 * 4, 'ran a lot');
  console.log(`       (${count} exercises generated)`);
});

test('mcq grading: correct option by index/text/object, wrong ones and invalid input', () => {
  for (const w of [nounPl, verb, phrase, one('Hallo!'), byDe('sie')[0]]) {
    for (const type of ['mcq_de_ar', 'mcq_ar_de', 'listen']) {
      const e = ex.makeExercise(w, type);
      const ci = e.options.findIndex(o => o.correct), wi = e.options.findIndex(o => !o.correct);
      const g = ex.gradeAnswer(e, ci);
      eq(g.ok, true, 'by index'); eq(g.correctText, e.options[ci].text, 'correctText');
      eq(ex.gradeAnswer(e, e.options[ci].text).ok, true, 'by text');
      eq(ex.gradeAnswer(e, e.options[ci]).ok, true, 'by object');
      eq(ex.gradeAnswer(e, String(ci)).ok, true, 'by numeric string');
      eq(ex.gradeAnswer(e, wi).ok, false, 'wrong index');
      eq(ex.gradeAnswer(e, e.options[wi].text).ok, false, 'wrong text');
      eq(ex.gradeAnswer(e, 9).ok, false, 'out of range');
      eq(ex.gradeAnswer(e, undefined).ok, false, 'undefined');
      eq(ex.gradeAnswer(e, null).ok, false, 'null');
      eq(ex.gradeAnswer(e, '').ok, false, 'empty');
    }
  }
  const art = ex.makeExercise(nounPl, 'article');
  eq(ex.gradeAnswer(art, 'das').ok, true); eq(ex.gradeAnswer(art, 'der').ok, false); eq(ex.gradeAnswer(art, 2).ok, true);
  eq(ex.gradeAnswer(art, 'der').correctText, 'das');
  const pl = ex.makeExercise(nounPl, 'plural');
  eq(ex.gradeAnswer(pl, 'die Beispiele').ok, true); eq(ex.gradeAnswer(pl, 'die beispiele').ok, true, 'case-insensitive text');
  eq(ex.gradeAnswer(pl, pl.options.find(o => !o.correct).text).ok, false);
});

test('duplicate headwords (sie/das/nein/bitte) and duplicate meanings (Hallo!/Hey!)', () => {
  for (const de of ['sie', 'das', 'nein', 'bitte']) {
    const pair = byDe(de);
    eq(pair.length, 2, `two "${de}" entries`);
    for (let r = 0; r < 30; r++) for (const w of pair) {
      const a = ex.makeExercise(w, 'mcq_de_ar');
      const other = pair.find(x => x !== w);
      assert(!a.options.some(o => !o.correct && ex.normAr(o.text) === ex.normAr(other.ar)), `"${de}": other meaning offered as distractor`);
      const b = ex.makeExercise(w, 'mcq_ar_de');
      eq(b.options.filter(o => ex.normDe(o.text) === de).length, 1, `"${de}" appears once in ar→de options`);
    }
  }
  const hallo = one('Hallo!'), hey = one('Hey!');
  eq(hallo.ar, hey.ar, 'fixture: same Arabic');
  for (let r = 0; r < 30; r++) {
    assert(!ex.makeExercise(hallo, 'mcq_ar_de').options.some(o => o.text === 'Hey!'), 'Hey! never a distractor for Hallo!');
    assert(!ex.makeExercise(hey, 'listen').options.some(o => o.text === 'Hallo!'), 'Hallo! never a distractor for Hey!');
    assert(ex.makeExercise(hallo, 'mcq_de_ar').options.filter(o => ex.normAr(o.text) === ex.normAr(hallo.ar)).length === 1, 'one مرحباً option');
  }
});

test('distractors prefer same kind + same lesson', () => {
  const w = nounPl;   // lesson 1 & 6 noun
  let sameKind = 0, sameLesson = 0, total = 0;
  for (let r = 0; r < 50; r++) {
    const e = ex.makeExercise(w, 'mcq_ar_de');
    for (const o of e.options.filter(o => !o.correct)) {
      const src = (wordsByDe.get(ex.normDe(o.text)) || [])[0];
      total++;
      if (src.k === 'noun') sameKind++;
      if (src.lessons.some(l => w.lessons.includes(l))) sameLesson++;
    }
  }
  eq(sameKind, total, 'all distractors are nouns');
  assert(sameLesson > total * 0.8, `most distractors from the same lessons (${sameLesson}/${total})`);
});

test('unsupported type for a word falls back instead of throwing', () => {
  eq(ex.makeExercise(nounNoPl, 'plural').type, 'article', 'plural without pl → article');
  eq(ex.makeExercise(verb, 'plural').type, 'mcq_ar_de', 'plural for verb → mcq_ar_de');
  eq(ex.makeExercise(verb, 'article').type, 'mcq_ar_de', 'article for verb → mcq_ar_de');
  eq(ex.makeExercise({ ...verb, file: '' }, 'listen').type, 'mcq_ar_de', 'listen without file → mcq_ar_de');
  eq(ex.makeExercise(verb, 'bogus').type, 'mcq_de_ar', 'unknown type → mcq_de_ar');
  eq(ex.makeExercise(verb.id, 'intro').type, 'intro', 'accepts an id');
  let threw = false; try { ex.makeExercise('nope', 'intro'); } catch (e) { threw = true; }
  assert(threw, 'unknown id throws');
});

test('wrongPlurals patterns: umlaut, -in, -e, -um, never real', () => {
  const cases = [['die Mutter, die Mütter', 'Mütter'], ['das Haus, die Häuser', 'Häuser'], ['die Freundin, die Freundinnen', 'Freundinnen'],
    ['die Familie, die Familien', 'Familien'], ['das Museum, die Museen', 'Museen'], ['der Computer, die Computer', 'Computer']];
  for (const [de, real] of cases) {
    const w = byDe(de)[0];
    if (!w) continue;   // fixture may not exist in this data version
    for (let r = 0; r < 20; r++) {
      const wrong = ex.wrongPlurals(w, 2);
      eq(wrong.length, 2, de);
      assert(wrong.every(t => t.startsWith('die ') && ex.normDe(t) !== ex.normDe('die ' + real) && !allPlurals.has(ex.normDe(t))), `${de}: ${wrong}`);
      assert(uniq(wrong.map(ex.normDe)), 'two different wrong plurals');
    }
  }
  const haus = byDe('das Haus, die Häuser')[0];
  if (haus) {
    const seen = new Set(); for (let r = 0; r < 60; r++) ex.wrongPlurals(haus, 2).forEach(t => seen.add(t));
    assert(!seen.has('die Haüser') && !seen.has('die Haüse'), 'au → äu, never aü');
  }
});

// ================================================================
section('gradeAnswer typing leniency');
test('exact / case / spaces / punctuation / apostrophes', () => {
  const e = ex.makeExercise(phrase, 'type');            // Wie geht es dir?
  eq(e.answer, 'Wie geht es dir');
  eq(ex.gradeAnswer(e, 'Wie geht es dir?').ok, true); eq(ex.gradeAnswer(e, 'wie  geht es   dir').ok, true);
  assert(!ex.gradeAnswer(e, 'Wie geht es dir?').note, 'no note for exact');
  eq(ex.gradeAnswer(e, 'Wie geht es Ihnen').ok, false); eq(ex.gradeAnswer(e, '').ok, false); eq(ex.gradeAnswer(e, null).ok, false);
  eq(ex.gradeAnswer(e, 'Wie geht es Ihnen').correctText, 'Wie geht es dir');
  const machs = ex.makeExercise(one('Mach’s gut!'), 'type');
  eq(machs.answer, 'Mach’s gut');
  eq(ex.gradeAnswer(machs, "Mach's gut").ok, true); eq(ex.gradeAnswer(machs, 'machs gut!').ok, true);
  const name = ex.makeExercise(one('Mein Name ist ...'), 'type');
  eq(name.answer, 'Mein Name ist'); eq(ex.gradeAnswer(name, 'mein name ist').ok, true); eq(ex.gradeAnswer(name, 'Mein Name ist ...').ok, true);
  const ent = ex.makeExercise(one('Entschuldigung, ...'), 'type');
  eq(ent.answer, 'Entschuldigung'); eq(ex.gradeAnswer(ent, 'Entschuldigung').ok, true);
  const email = byDe('die E-Mail, die E-Mails')[0];
  if (email) { const ee = ex.makeExercise(email, 'type'); eq(ex.gradeAnswer(ee, 'email').ok, true, 'hyphen lenient'); eq(ex.gradeAnswer(ee, 'die E-Mail').ok, true); }
});

test('umlaut folding → ok with note; wrong → not ok', () => {
  const kaese = ex.makeExercise(nounNoPl, 'type');       // der Käse
  eq(kaese.answer, 'Käse');
  // اسم من غير أداة: صح للمراجعة بس بملاحظة إن الأداة لازمة عشان ✍️
  const g1 = ex.gradeAnswer(kaese, 'Käse'); eq(g1.ok, true); assert(g1.note && g1.note.includes('der Käse') && g1.note.includes('الأداة'), 'bare noun: article note: ' + g1.note); eq(g1.correctText, 'der Käse');
  const g1b = ex.gradeAnswer(kaese, 'der Käse'); eq(g1b.ok, true); assert(!g1b.note, 'exact with article: no note');
  const g2 = ex.gradeAnswer(kaese, 'Kaese'); eq(g2.ok, true); assert(g2.note && g2.note.includes('الكتابة الصح') && g2.note.includes('Käse') && g2.note.includes('الأداة'), 'folding + article note: ' + g2.note);
  eq(ex.gradeAnswer(kaese, 'der kaese').ok, true, 'article + folding');
  eq(ex.gradeAnswer(kaese, 'Kase').ok, false); eq(ex.gradeAnswer(kaese, 'Brot').ok, false); eq(ex.gradeAnswer(kaese, 'Käs').ok, false);
  const str = byDe('die Straße, die Straßen')[0];
  if (str) { const se = ex.makeExercise(str, 'type'); eq(ex.gradeAnswer(se, 'Strasse').ok, true); assert(ex.gradeAnswer(se, 'Strasse').note, 'ß note'); eq(ex.gradeAnswer(se, 'Straße').ok, true); }
  const schoen = byDe('schön')[0];
  if (schoen) { const se = ex.makeExercise(schoen, 'type'); eq(ex.gradeAnswer(se, 'schoen').ok, true); eq(ex.gradeAnswer(se, 'SCHÖN').ok, true); eq(ex.gradeAnswer(se, 'schon').ok, false); }
  const tschuess = byDe('Tschüss.')[0];
  if (tschuess) { const te = ex.makeExercise(tschuess, 'type'); eq(te.answer, 'Tschüss'); eq(ex.gradeAnswer(te, 'tschuess').ok, true); eq(ex.gradeAnswer(te, 'Tschüss!').ok, true); }
});

test('nouns: typed article accepted, wrong article accepted with a note, sg alone ok', () => {
  const e = ex.makeExercise(nounPl, 'type');             // das Beispiel
  eq(e.answer, 'Beispiel'); assert(e.accept.includes('das Beispiel'));
  eq(ex.gradeAnswer(e, 'Beispiel').ok, true); eq(ex.gradeAnswer(e, 'das Beispiel').ok, true); eq(ex.gradeAnswer(e, 'Das  beispiel').ok, true);
  assert(!ex.gradeAnswer(e, 'das Beispiel').note, 'right article: no note');
  const wrongArt = ex.gradeAnswer(e, 'der Beispiel');
  eq(wrongArt.ok, true); assert(wrongArt.note && wrongArt.note.includes('das'), 'wrong article note: ' + wrongArt.note);
  eq(ex.gradeAnswer(e, 'Beispiele').ok, false); eq(ex.gradeAnswer(e, 'die Beispiele').ok, false);
  eq(ex.gradeAnswer(e, 'Beispiele').correctText, 'das Beispiel');
  // a word that IS an article-like token must not be stripped to nothing
  const das = byDe('das')[0];
  const de = ex.makeExercise(das, 'type'); eq(ex.gradeAnswer(de, 'das').ok, true); eq(ex.gradeAnswer(de, 'der').ok, false);
  // phrases starting with an article keep it
  const dasIst = byDe('Das ist Nico.')[0];
  if (dasIst) { const pe = ex.makeExercise(dasIst, 'type'); eq(ex.gradeAnswer(pe, 'Das ist Nico').ok, true); eq(ex.gradeAnswer(pe, 'ist Nico').ok, false); }
});

test('verbs: marker stripped, bare verb and marker form accepted', () => {
  const lernen = ex.makeExercise(one('(etwas) lernen'), 'type');
  eq(lernen.answer, 'lernen'); eq(ex.gradeAnswer(lernen, 'lernen').ok, true); eq(ex.gradeAnswer(lernen, 'etwas lernen').ok, true); eq(ex.gradeAnswer(lernen, 'lernt').ok, false);
  const suchen = ex.makeExercise(one('etwas suchen'), 'type');
  eq(suchen.answer, 'etwas suchen'); eq(ex.gradeAnswer(suchen, 'suchen').ok, true); eq(ex.gradeAnswer(suchen, 'etwas suchen').ok, true);
  const kennen = ex.makeExercise(one('jemanden/etwas kennen'), 'type');
  eq(ex.gradeAnswer(kennen, 'kennen').ok, true); eq(ex.gradeAnswer(kennen, 'jemanden/etwas kennen').ok, true);
  const mit = ex.makeExercise(one('mit jemandem sprechen'), 'type');
  eq(ex.gradeAnswer(mit, 'sprechen').ok, true); eq(ex.gradeAnswer(mit, 'mit jemandem sprechen').ok, true);
  const deutsch = ex.makeExercise(one('(das) Deutsch'), 'type');
  eq(deutsch.answer, 'Deutsch'); eq(ex.gradeAnswer(deutsch, 'Deutsch').ok, true); eq(ex.gradeAnswer(deutsch, 'das Deutsch').ok, true);
  const sonst = ex.makeExercise(one('Sonst noch etwas?'), 'type');
  eq(sonst.answer, 'Sonst noch etwas'); eq(ex.gradeAnswer(sonst, 'etwas').ok, false, 'etwas in the middle is not a marker');
});

// ================================================================
section('makeMatch');
test('shape: 6 pairs, both columns shuffled, same id sets, unique texts', () => {
  const words = wordsOfLesson(2);
  let leftDiffers = 0, rightDiffers = 0;
  for (let r = 0; r < 30; r++) {
    const m = ex.makeMatch(words);
    eq(m.pairs.length, 6); eq(m.left.length, 6); eq(m.right.length, 6);
    assert(m.pairs.every(p => p.id && p.de && p.ar && DATA.byId.has(p.id)), 'pairs have id/de/ar');
    assert(m.pairs.every(p => p.de === displayDe(DATA.byId.get(p.id)) && p.ar === DATA.byId.get(p.id).ar), 'pair texts');
    assert(m.pairs.every(p => words.includes(DATA.byId.get(p.id))), 'from the given words');
    const ids = m.pairs.map(p => p.id).sort().join(',');
    eq(m.left.map(x => x.id).sort().join(','), ids, 'left ids'); eq(m.right.map(x => x.id).sort().join(','), ids, 'right ids');
    assert(m.left.every(x => x.text === m.pairs.find(p => p.id === x.id).de && x.isDe === true), 'left = German');
    assert(m.right.every(x => x.text === m.pairs.find(p => p.id === x.id).ar && x.isDe === false), 'right = Arabic');
    assert(uniq(m.pairs.map(p => ex.normDe(p.de))) && uniq(m.pairs.map(p => ex.normAr(p.ar))), 'unique texts');
    if (m.left.map(x => x.id).join() !== m.pairs.map(p => p.id).join()) leftDiffers++;
    if (m.right.map(x => x.id).join() !== m.left.map(x => x.id).join()) rightDiffers++;
  }
  assert(leftDiffers > 0 && rightDiffers > 0, 'columns are shuffled');
});

test('fewer than 6 words → filled from the deck; ambiguous meanings never together', () => {
  const three = wordsOfLesson(3).slice(0, 3);
  const m = ex.makeMatch(three);
  eq(m.pairs.length, 6); assert(three.every(w => m.pairs.some(p => p.id === w.id)), 'given words kept');
  const m6 = ex.makeMatch(wordsOfLesson(3).slice(0, 6));
  eq(m6.pairs.map(p => p.id).sort().join(), wordsOfLesson(3).slice(0, 6).map(w => w.id).sort().join(), 'exactly the 6 given');
  const amb = [one('Hallo!'), one('Hey!'), ...byDe('sie'), ...byDe('das')];
  for (let r = 0; r < 20; r++) {
    const mm = ex.makeMatch(amb);
    eq(mm.pairs.length, 6);
    assert(uniq(mm.pairs.map(p => ex.normAr(p.ar))) && uniq(mm.pairs.map(p => ex.normDe(p.de))), 'no ambiguous pair');
  }
  eq(ex.makeMatch([]).pairs.length, 6, 'empty input still gives 6');
  eq(ex.makeMatch(wordsOfLesson(2).map(w => w.id)).pairs.length, 6, 'accepts ids');
  eq(ex.makeMatch(wordsOfLesson(2), 4).pairs.length, 4, 'custom n');
});

// ================================================================
section('audio.js in node');
test('imports without window/document; play resolves (false) and never rejects', async () => {
  eq(typeof audio.play, 'function'); eq(typeof audio.stop, 'function'); eq(typeof audio.preload, 'function'); eq(typeof audio.autoplay, 'function');
  audio.stop();
  audio.preload(W.slice(0, 3));
  audio.preload(null);
  const r = await audio.play(W[0]);
  eq(r, false, 'no Audio in node → false');
  eq(await audio.play('audio/x.mp3'), false);
  eq(await audio.play(null), false);
  eq(await audio.autoplay(W[0]), false);
  eq(audio.isPlaying(), false);
});

// ================================================================
section('contract with ui.js (deMarkup == deHtml)');
test('deMarkup matches ui.deHtml for every word (ui.js loaded with a window stub)', async () => {
  globalThis.window = globalThis.window || {};
  let ui;
  try { ui = await import('../www/js/ui.js'); }
  catch (e) { console.log('       (skipped: ui.js needs a browser: ' + e.message + ')'); return; }
  for (const w of W) {
    eq(ex.deMarkup(w), ui.deHtml(w), `deHtml ${w.de}`);
    eq(ex.deMarkup(w, { big: true }), ui.deHtml(w, { big: true }), `deHtml big ${w.de}`);
  }
});

// ---- wait for the sequential test chain before the summary ----
await chain;

// ================================================================
console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const [name, e] of failures) console.log(' - ' + name + ': ' + (e && e.message || e));
  process.exit(1);
}
process.exit(0);
