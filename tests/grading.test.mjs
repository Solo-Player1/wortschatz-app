// Grading of typed answers for DW notations that appear from lesson 16 on — plain node, no framework.
// separable verbs «auf|stehen», optional endings «mein(e)», alternatives «euer/eure», plural-only nouns «die Eltern (Plural)»,
// object markers «etwas sagen». Run:  node tests/grading.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() };

const { DATA } = await import('../www/js/data.js');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'data', 'lessons.json'), 'utf8'));
DATA.lessons = raw.lessons; DATA.words = raw.words; DATA.byId = new Map(raw.words.map(w => [w.id, w])); DATA.translit = {};
const ex = await import('../www/js/exercises.js');
// games/engine.js registers a hashchange listener at import time: a tiny window stub is enough for node
globalThis.window ||= { addEventListener() {}, removeEventListener() {} };
const eng = await import('../www/js/games/engine.js');        // no try/catch: the games/exam half must really run

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); } }
const word = re => { const w = DATA.words.find(x => re.test(x.de)); if (!w) throw new Error('no word matching ' + re); return w; };
const typed = (w, answer) => ex.gradeAnswer(ex.makeExercise(w, 'type'), answer).ok;
const game = (w, answer) => eng.checkTyped(eng.expectedFor(w).accept, answer).ok;
const both = (w, answer, want) => {
  assert.equal(typed(w, answer), want, `session type: ${JSON.stringify(w.de)} ← ${JSON.stringify(answer)}`);
  assert.equal(game(w, answer), want, `games/exam: ${JSON.stringify(w.de)} ← ${JSON.stringify(answer)}`);
};

test('normDe drops DW\'s separable-verb pipe', () => {
  assert.equal(ex.normDe('auf|stehen'), 'aufstehen');
  assert.equal(ex.normDe('jemanden an|rufen'), 'jemanden anrufen');
});
test('separable verb: «aufstehen» (what the audio says) is right, also with the pipe', () => {
  const w = word(/^auf\|stehen$/);
  both(w, 'aufstehen', true);
  both(w, 'auf|stehen', true);
  both(w, 'stehen', false);
});
test('separable verb with an object marker: «anrufen»', () => {
  const w = word(/an\|rufen$/);
  both(w, 'anrufen', true);
});
test('optional ending mein(e): «mein» and «meine» are right, «dein» is not', () => {
  const w = word(/^mein\(e\)$/);
  both(w, 'mein', true);
  both(w, 'meine', true);
  both(w, 'dein', false);
});
test('alternatives euer/eure and Lieber/Liebe …', () => {
  const a = word(/^euer\/eure$/);
  both(a, 'euer', true);
  both(a, 'eure', true);
  const b = word(/^Lieber\/Liebe/);
  both(b, 'Lieber', true);
  both(b, 'Liebe', true);
});
test('plural-only noun: «die Eltern» without DW\'s «(Plural)» note', () => {
  const w = word(/^die Eltern/);
  both(w, 'die Eltern', true);
  // session type exercises are lenient on a wrong article on purpose (ok + a note pointing to the right one)
  const r = ex.gradeAnswer(ex.makeExercise(w, 'type'), 'der Eltern');
  assert.ok(r.ok && /die/.test(r.note || ''), JSON.stringify(r));
});
test('object marker: «etwas sagen» accepts «sagen»', () => {
  const w = word(/^etwas sagen$/);
  both(w, 'sagen', true);
  both(w, 'etwas sagen', true);
});
test('stacked markers: «sich etwas teilen» / «(jemandem) etwas empfehlen» / «sich auf etwas freuen» accept the bare verb', () => {
  const a = word(/^sich etwas teilen$/);
  both(a, 'teilen', true);
  both(a, 'sich etwas teilen', true);
  both(a, 'sich teilen', false);
  const b = word(/^\(jemandem\) etwas empfehlen$/);
  both(b, 'empfehlen', true);
  both(b, 'etwas empfehlen', true);
  const c = word(/^sich auf etwas\/jemanden freuen$/);
  both(c, 'freuen', true);
  const d = word(/^sich verletzen$/);
  both(d, 'verletzen', true);
  assert.equal(d.k, 'verb', 'reflexive DW verbs are classified as verbs');
});
test('alternatives inside entries: «etwas/jemanden mit|nehmen», «(auf jemanden/etwas) warten», «rechts/links …», « / » phrases', () => {
  const a = word(/^etwas\/jemanden mit\|nehmen$/);
  both(a, 'etwas mitnehmen', true);
  both(a, 'jemanden mitnehmen', true);
  both(a, 'mitnehmen', true);
  const b = word(/^\(auf jemanden\/etwas\) warten$/);
  both(b, 'auf etwas warten', true);
  both(b, 'warten', true);
  const c = word(/^rechts\/links in eine Straße biegen$/);
  both(c, 'links in eine Straße biegen', true);
  both(c, 'in eine Straße biegen', false);
  const d = word(/^sein eigener Chef sein \/ ihre eigene Chefin sein$/);
  both(d, 'ihre eigene Chefin sein', true);
});
test('optional words in brackets: «in der Nähe (von)», «Lust (auf etwas) haben»', () => {
  const a = word(/^in der Nähe \(von\)$/);
  both(a, 'in der Nähe von', true);
  both(a, 'in der Nähe', true);
  const b = word(/^Lust \(auf etwas\) haben$/);
  both(b, 'Lust haben', true);
  both(b, 'Lust auf etwas haben', true);
});
test('gender forms listed with commas: «dieser, diese, dieses» → each form; «Entschuldigung, ...» is not a list', () => {
  const a = word(/^dieser, diese, dieses$/);
  both(a, 'diese', true);
  both(a, 'dieses', true);
  both(a, 'diesem', false);
  const b = word(/^eigener, eigene, eigenes$/);
  both(b, 'eigene', true);
});
test('reflexive verb with a prepositional object: «sich über etwas freuen» ← «sich freuen» (DW recording)', () => {
  both(word(/^sich über etwas freuen$/), 'sich freuen', true);
  both(word(/^sich auf etwas\/jemanden freuen$/), 'sich auf jemanden freuen', true);
  both(word(/^sich etwas teilen$/), 'sich teilen', false);     // a different verb: «sich teilen» = to split
  both(word(/^sich über etwas freuen$/), 'über etwas freuen', false);   // not German without «sich»
  both(word(/^etwas\/jemanden sehen$/), 'jemanden sehen', true);
  both(word(/^\(über jemanden\/etwas\) reden$/), 'über etwas reden', true);
});
test('optional article «(das) Deutsch»: the wrong article gets a note and no ✍️ credit', () => {
  const w = word(/^\(das\) Deutsch$/);
  const r = ex.gradeAnswer(ex.makeExercise(w, 'type'), 'der Deutsch');
  assert.ok(r.ok && r.wrongArticle && /das Deutsch/.test(r.note || ''), JSON.stringify(r));
  const ok = ex.gradeAnswer(ex.makeExercise(w, 'type'), 'das Deutsch');
  assert.ok(ok.ok && !ok.wrongArticle && !ok.note, JSON.stringify(ok));
  both(word(/^etwas sagen$/), 'der sagen', false);            // an article on an entry that never takes one
});
test('homographs DW tells apart with tashkeel are not synonyms: wie viel «كم» ≠ der Ärmel «كُمّ», das Haar ≠ sich fühlen', () => {
  const armel = word(/^der Ärmel/), wieviel = word(/^wie viel$/), haar = word(/^das Haar/), fuehlen = word(/^sich fühlen$/);
  assert.equal(typed(armel, 'der Ärmel'), true);
  assert.equal(typed(armel, 'wie viel'), false);
  assert.equal(typed(wieviel, 'der Ärmel'), false);
  assert.equal(typed(fuehlen, 'das Haar'), false);
  assert.equal(game(haar, 'fühlen'), false);
  assert.equal(eng.checkTyped(eng.expectedFor(armel, { withSynonyms: true }).accept, 'wie viel').ok, false);
  // real synonyms with the same DW gloss stay accepted: Papa / Vater
  assert.equal(typed(word(/^der Vater/), 'der Papa'), true);
});
test('DW recordings that say both forms: «euer, eure», «Lieber, Liebe», «(der) Fußball» → «der Fußball, die Fußbälle»', () => {
  both(word(/^euer\/eure$/), 'euer, eure', true);
  both(word(/^Lieber\/Liebe/), 'Lieber, Liebe', true);
  const fb = word(/^\(der\) Fußball$/);
  assert.equal(game(fb, 'der Fußball, die Fußbälle'), true);
});
const scramble = await import('../www/js/games/scramble.js');
test('scramble solution drops DW\'s separable pipe and markers: «etwas ein|kaufen» → «einkaufen»', () => {
  assert.equal(scramble.solutionOf(word(/^etwas ein\|kaufen$/)), 'einkaufen');
  assert.equal(scramble.solutionOf(word(/^auf\|stehen$/)), 'aufstehen');
  assert.equal(scramble.solutionOf(word(/^sich etwas teilen$/)), 'teilen');
});
test('the stricter DW data stays: «sein» and «feiern» are verbs, «Sachen zum Anziehen» has no «Plural» in the German', () => {
  assert.equal(word(/^sein$/).k, 'verb');
  assert.equal(word(/^feiern$/).k, 'verb');
  assert.ok(!DATA.words.some(w => w.k !== 'noun' && /\bPlural\b/.test(w.de)), 'a DW «Plural» note in a German entry');
  assert.ok(!DATA.words.some(w => /^[?.!…]/.test(w.sub || '')), 'an RTL-mangled DW note (sub)');
});
test('no RTL-mangled DW entries (unbalanced brackets, leading … ? !) and no double spaces', () => {
  const bad = DATA.words.filter(w => w.de.split('(').length !== w.de.split(')').length || /^[…?!)]/.test(w.de) || /\s{2}/.test(w.de));
  assert.equal(bad.length, 0, bad.map(w => w.de).join(' | '));
  const titles = DATA.lessons.filter(l => /^[…?!(]/.test(l.title) || l.title.split('(').length !== l.title.split(')').length);
  assert.equal(titles.length, 0, titles.map(l => l.n + ': ' + l.title).join(' | '));
});
test('no DW typo «ewas» left in the vocabulary', () => {
  assert.ok(!DATA.words.some(w => /^ewas\b/.test(w.de)), DATA.words.filter(w => /^ewas\b/.test(w.de)).map(w => w.de).join(', '));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
