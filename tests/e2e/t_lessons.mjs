// Every lesson 1–76 renders (title, words with translit, sentences, grammar, video slot, no overflow, no errors),
// plus the reference pages that grew with the full A1 course: verbs (scope + search), question words, grammar.
// Needs: python tests/e2e/serve.py 8131   ·   run: node tests/e2e/t_lessons.mjs
import { launch } from './cdp.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8131/index.html';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
const noise = e => /githubusercontent|vibrate|tv-download|static\.dw\.com|_capacitor_file_/.test(e);

for (const [width, dark] of [[390, false], [360, true]]) {
  const p = await launch({ port: dark ? 9487 : 9486, width, dark });
  const tag = `${width}${dark ? ' dark' : ''}`;
  await p.goto(`${BASE}#/home`, 2500);
  await p.evaluate(`localStorage.removeItem('ws:v1')`);
  await p.goto(`${BASE}#/home`, 2500);

  // ---------- every lesson page ----------
  const ns = await p.evaluate(`(async () => (await import('./js/data.js')).DATA.lessons.map(l => l.n))()`);
  check(`[${tag}] 76 lessons in the data`, ns.length === 76 && ns[0] === 1 && ns[75] === 76, `got ${ns.length}: ${ns[0]}…${ns.at(-1)}`);
  const bad = [];
  for (const n of ns) {
    await p.hash(`#/lesson/${n}`, 250);
    const r = await p.evaluate(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      // the video slot becomes a teaser card once videos.json is loaded (async on the first lesson)
      for (let i = 0; i < 20 && !document.querySelector('#view a.vd-teaser[href="#/video/${n}"]'); i++) await sleep(150);
      const { DATA, wordsOfLesson } = await import('./js/data.js');
      const { sentencesOf, grammarOf } = await import('./js/content.js');
      const v = document.querySelector('#view');
      const words = wordsOfLesson(${n});
      return {
        title: (v.querySelector('.lesson-title') || {}).innerText || '',
        dataTitle: (DATA.lessons.find(l => l.n === ${n}) || {}).title || '',
        rows: v.querySelectorAll('.word-row').length, words: words.length,
        translit: v.querySelectorAll('.word-row .word-tr').length,
        sents: sentencesOf(${n}).length, gram: grammarOf(${n}).length,
        gramCard: !!v.querySelector('.lesson-gram'), sentCard: !!v.querySelector('.lesson-sents'),
        videoSlot: !!v.querySelector('a.vd-teaser[href="#/video/${n}"]'),
        // open the grammar + sentences cards like a learner would: wide grammar tables must not push the page sideways
        overflow: (v.querySelectorAll('details').forEach(d => { d.open = true; }), document.documentElement.scrollWidth - document.documentElement.clientWidth),
        // a table must fit its card; it may only scroll inside its own .rf-tscroll box — and today none needs to
        wideTables: [...v.querySelectorAll('.rf-gtable')].filter(t => { const box = t.closest('.rf-tscroll') || t; const c = t.closest('.card').getBoundingClientRect(), b = box.getBoundingClientRect(); return b.left < c.left - 0.5 || b.right > c.right + 0.5 || box.scrollWidth > box.clientWidth + 1; }).length,
      };
    })()`);
    const why = [];
    if (!r.title.trim() || r.title.trim() !== r.dataTitle.trim()) why.push(`title «${r.title}»`);
    if (/^[…?!(]/.test(r.dataTitle) || r.dataTitle.split('(').length !== r.dataTitle.split(')').length) why.push(`mangled title «${r.dataTitle}»`);
    if (!r.words || r.rows !== r.words) why.push(`word rows ${r.rows}/${r.words}`);
    if (r.translit < r.words) why.push(`translit ${r.translit}/${r.words}`);
    if (r.sents < 12) why.push(`sentences ${r.sents}`);
    if (r.gram < 3) why.push(`grammar points ${r.gram}`);
    if (!r.gramCard || !r.sentCard) why.push('grammar/sentence card missing');
    if (!r.videoSlot) why.push('no episode teaser');
    if (r.overflow > 1) why.push(`horizontal overflow ${r.overflow}px (cards opened)`);
    if (r.wideTables) why.push(`${r.wideTables} grammar table(s) wider than the card`);
    if (why.length) bad.push(`L${n}: ${why.join(', ')}`);
  }
  check(`[${tag}] every lesson page renders fully (title, words + translit, ≥12 sentences, ≥3 grammar points, no overflow)`, !bad.length, bad.slice(0, 6).join(' | '));

  // ---------- video page of a new lesson ----------
  await p.hash('#/video/40', 1200);
  const vd = await p.evaluate(`(() => { const v = document.querySelector('video.vd-video'); return { has: !!v, poster: v ? v.getAttribute('poster') || '' : '' }; })()`);
  check(`[${tag}] episode page of lesson 40 has the player + poster`, vd.has && /L40/.test(vd.poster), JSON.stringify(vd));

  // ---------- verbs reference: scope + search ----------
  await p.hash('#/ref/verbs', 900);
  const v0 = await p.evaluate(`(async () => {
    const { CONTENT } = await import('./js/content.js');
    const lesson1 = CONTENT.verbs.filter(v => +v.lesson <= 1).length;
    return { total: CONTENT.verbs.length, lesson1, cards: document.querySelectorAll('.rf-verb').length, scope: !!document.querySelector('#vScope'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  })()`);
  check(`[${tag}] verbs: fresh profile sees only lesson-1 verbs by default`, v0.scope && v0.cards === v0.lesson1 && v0.total > 200, JSON.stringify(v0));
  check(`[${tag}] verbs page: no horizontal overflow`, v0.overflow <= 1, `${v0.overflow}px`);
  const v1 = await p.evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#vScope button[data-all="1"]').click(); await sleep(150);
    const all = document.querySelectorAll('.rf-verb').length;
    const inp = document.querySelector('#vSearch');
    // the page waits 140 ms after the last keystroke before redrawing (debounce) — read the list well after that
    const search = async q => { inp.value = q; inp.dispatchEvent(new Event('input')); await sleep(450); return [...document.querySelectorAll('.rf-verb h2 .de')].map(e => e.textContent); };
    const fahrt = await search('fahrt');           // ä folded: fährt → fahren, wegfahren …
    const faehrt = await search('faehrt');         // the ae spelling the typing grader accepts
    const multi = await search('ich stehe auf');   // pronoun dropped, «stehe … auf» matched across the …
    const arPrefixed = await search('بدفع');        // Egyptian 1st person → «يدفع»
    const dwGloss = await search('ذهب');            // DW's MSA gloss of gehen (the card says «يروح»)
    const ar = await search('يدفع');
    const none = await search('qqqq');
    const emptyMsg = !!document.querySelector('#vList .empty');
    await search('');
    return { all, fahrt, faehrt, multi, arPrefixed, dwGloss, ar, none, emptyMsg, back: document.querySelectorAll('.rf-verb').length };
  })()`);
  check(`[${tag}] verbs: «faehrt» / «ich stehe auf» / «بدفع» / DW gloss «ذهب» find fahren / aufstehen / zahlen / gehen`,
    v1.faehrt.includes('fahren') && v1.multi.includes('aufstehen') && v1.arPrefixed.some(x => /zahlen/.test(x)) && v1.dwGloss.includes('gehen'),
    JSON.stringify({ faehrt: v1.faehrt, multi: v1.multi, arPrefixed: v1.arPrefixed, dwGloss: v1.dwGloss }));
  check(`[${tag}] verbs: «كل الأفعال» shows all of them`, v1.all === v0.total, `${v1.all}/${v0.total}`);
  check(`[${tag}] verbs: search «fahrt» finds fahren (umlaut-insensitive)`, v1.fahrt.includes('fahren'), v1.fahrt.join(','));
  check(`[${tag}] verbs: Arabic search «يدفع» finds bezahlen/zahlen`, v1.ar.some(x => /zahlen/.test(x)), v1.ar.join(','));
  check(`[${tag}] verbs: no match → empty message; cleared search → list back`, !v1.none.length && v1.emptyMsg && v1.back === v0.total, JSON.stringify({ none: v1.none.length, empty: v1.emptyMsg, back: v1.back }));
  if (!dark) await p.shot(path.join(OUT, 'ref_verbs_390.png'));

  // ---------- question words + grammar reference ----------
  await p.hash('#/ref/wwords', 700);
  const ww = await p.evaluate(`(async () => { const { CONTENT } = await import('./js/content.js'); return { n: CONTENT.wwords.length, cards: document.querySelectorAll('.rf-w').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
  check(`[${tag}] question words: all ${ww.n} cards, no overflow`, ww.n > 12 && ww.cards === ww.n && ww.overflow <= 1, JSON.stringify(ww));
  await p.hash('#/ref/grammar', 900);
  const gr = await p.evaluate(`(() => ({ n: document.querySelectorAll('details.rf-g').length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))()`);
  check(`[${tag}] grammar reference: a section for each of the 76 lessons`, gr.n === 76 && gr.overflow <= 1, JSON.stringify(gr));

  const errs = p.errors.filter(e => !noise(e));
  check(`[${tag}] no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.close();
}

for (const x of results) console.log(x);
const fails = results.filter(x => x.startsWith('FAIL')).length;
console.log(`t_lessons: ${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
