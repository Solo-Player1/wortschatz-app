// New features of 1.8: Android back button (mocked Capacitor App plugin), 📖 reading passages + Gemini grading (mocked
// API), the Gemini key in settings (device-only, not in backups), 🧩 grammar topics (pages + quiz game).
// Needs: python tests/e2e/serve.py 8131   ·   run: node tests/e2e/t_features.mjs
import { launch } from './cdp.mjs';
const BASE = 'http://127.0.0.1:8131/index.html';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
const noise = e => /githubusercontent|vibrate|tv-download|static\.dw\.com|_capacitor_file_/.test(e);

// a native-looking page: Capacitor with an App plugin that records the backButton listener, and a fake Gemini API
const INIT = `(() => {
  window.__back = { handler: null, minimized: 0 };
  window.Capacitor = { isNativePlatform: () => true, convertFileSrc: u => u, Plugins: {
    App: { addListener: (ev, fn) => { if (ev === 'backButton') window.__back.handler = fn; return Promise.resolve({ remove() {} }); },
           minimizeApp: () => { window.__back.minimized++; return Promise.resolve(); }, exitApp: () => Promise.resolve() },
  } };
  window.__gem = { mode: 'ok', calls: [] };
  const realFetch = window.fetch.bind(window);
  window.fetch = (u, o) => {
    if (String(u).includes('generativelanguage.googleapis.com')) {
      window.__gem.calls.push({ url: String(u), key: (o && o.headers && o.headers['x-goog-api-key']) || '', body: o && o.body ? JSON.parse(o.body) : null });
      if (window.__gem.mode === 'badkey') return Promise.resolve(new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 }));
      const text = window.__gem.mode === 'ok' ? JSON.stringify({ score: 72, understood: ['اسمها لينا ومن ألمانيا'], missed: [{ de: 'und Englisch', ar: 'وإنجليزي كمان' }],
        wrong: [{ de: 'Ich wohne in München.', learner: 'ساكنة في برلين', correct: 'ساكنة في ميونخ' }], feedback: 'شاطر! خد بالك من أسماء المدن.' }) : 'OK';
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], modelVersion: 'gemini-mock' }), { status: 200 }));
    }
    return realFetch(u, o);
  };
})();`;

const p = await launch({ port: 9488, width: 390 });
await p.addInit(INIT);
await p.goto(`${BASE}#/home`, 2500);
await p.evaluate(`localStorage.removeItem('ws:v1'); localStorage.removeItem('ws:gemini')`);
await p.goto(`${BASE}#/home`, 3000);
const back = async () => { const r = await p.evaluate(`(async () => { window.__back.handler(); await new Promise(r => setTimeout(r, 450)); return location.hash; })()`); return r; };

// ---------- back button ----------
check('back: the App backButton listener is registered on a native device', await p.evaluate(`typeof window.__back.handler === 'function'`));
await p.hash('#/lessons', 500); await p.hash('#/lesson/16', 700);
let h = await back();
check('back from a lesson page → the lessons map', h === '#/lessons', h);
h = await back();
check('back from the lessons map → home', h === '#/home', h);
await back();
check('back on home → app goes to the background (not closed, no navigation)', await p.evaluate(`window.__back.minimized === 1 && location.hash === '#/home'`));
await p.hash('#/lesson/16', 600); await p.hash('#/video/16', 900);
h = await back();
check('back from the episode → its lesson', h === '#/lesson/16', h);
await p.hash('#/ref', 400); await p.hash('#/ref/verbs', 700);
h = await back();
check('back from a reference page → the references', h === '#/ref', h);
await p.hash('#/lesson/16', 600); await p.hash('#/game/cloze?lesson=16', 1500);
await p.evaluate(`document.querySelector('.gm-go') && document.querySelector('.gm-go').click()`); await p.sleep(900);
h = await back();
const quitShown = await p.evaluate(`!!document.querySelector('.gm-results')`);
check('back during a game = its ✕ (game ends with «خرجت»), not a page jump', h.startsWith('#/game/cloze') && quitShown, h);
h = await back();
check('back from the game results → the page you came from (lesson 16)', h === '#/lesson/16', h);

// ---------- 📖 reading + Gemini ----------
await p.hash('#/read', 1500);
const list = await p.evaluate(`({ items: document.querySelectorAll('.rd-item').length, keyChip: !!document.querySelector('.rd-head a.chip.warn') })`);
check('reading list: 20 passages, «add a Gemini key» hint when there is none', list.items === 20 && list.keyChip, JSON.stringify(list));
await p.hash('#/read/p01', 1500);
const quiz = await p.evaluate(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const j = await (await fetch('data/passages.json')).json();
  const P = j.passages[0];
  document.querySelector('#rdQuiz').click(); await sleep(200);
  let wrongOnce = false, n = 0;
  for (; n < 40 && document.querySelector('.rd-quiz'); n++) {
    const de = document.querySelector('.rd-quiz h2 bdi').textContent.trim();
    const w = P.newWords.find(x => x.de === de);
    const btns = [...document.querySelectorAll('.rd-opt')];
    let b = btns.find(x => x.textContent.trim() === w.ar);
    if (!wrongOnce) { b = btns.find(x => x.textContent.trim() !== w.ar); wrongOnce = true; }      // one mistake → that word comes back
    b.click(); await sleep(1500);
  }
  return { asked: n, words: P.newWords.length, ready: !!document.querySelector('#rdGo'), saved: JSON.parse(localStorage.getItem('ws:v1')).reading.p01.words };
})()`);
check('reading: the word quiz repeats a wrong word and ends only when all are right', quiz.ready && quiz.asked === quiz.words + 1 && quiz.saved === true, JSON.stringify(quiz));
await p.evaluate(`document.querySelector('#rdGo').click()`); await p.sleep(400);
const text = await p.evaluate(`({ paras: document.querySelectorAll('.rd-text p').length, marks: document.querySelectorAll('.rd-text mark').length })`);
check('reading: the passage shows its paragraphs with the new words marked', text.paras >= 2 && text.marks >= 3, JSON.stringify(text));
await p.evaluate(`document.querySelector('#rdWrite').click()`); await p.sleep(400);
const noKey = await p.evaluate(`({ check: document.querySelector('#rdCheck').hidden, self: !!document.querySelector('#rdSelf') })`);
check('reading: without a key → no Gemini button, «compare myself» instead', noKey.check && noKey.self, JSON.stringify(noKey));

// ---------- settings: the key ----------
await p.hash('#/settings', 1500);
const saved = await p.evaluate(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const inp = document.querySelector('#geminiKey'); inp.value = 'TEST-KEY-123'; document.querySelector('#geminiSave').click(); await sleep(700);
  const { store } = await import('./js/store.js');
  return { state: document.querySelector('#geminiState').textContent, stored: localStorage.getItem('ws:gemini'), backup: store.exportJSON().includes('TEST-KEY-123'), sentKey: window.__gem.calls.at(-1).key, cleared: inp.value };
})()`);
check('settings: the key is tested, saved on the device only and kept out of the backup', /شغّال/.test(saved.state) && saved.stored === 'TEST-KEY-123' && !saved.backup && saved.sentKey === 'TEST-KEY-123' && saved.cleared === '', JSON.stringify(saved));

// ---------- grading with the (mocked) API ----------
await p.hash('#/read/p01', 1500);
const graded = await p.evaluate(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#rdSkip').click(); await sleep(300);
  document.querySelector('#rdWrite').click(); await sleep(300);
  const ta = document.querySelector('#rdAnswer'); const btn = document.querySelector('#rdCheck');
  const disabledShort = (ta.value = 'قصير', ta.dispatchEvent(new Event('input')), btn.disabled);
  ta.value = 'لينا من ألمانيا وساكنة في برلين، وصاحبتها سارة.'; ta.dispatchEvent(new Event('input'));
  btn.click(); await sleep(900);
  const st = JSON.parse(localStorage.getItem('ws:v1'));
  const call = window.__gem.calls.at(-1);
  return { pct: (document.querySelector('.rd-pct') || {}).textContent, wrong: document.querySelectorAll('.rd-list li').length, ref: !!document.querySelector('.rd-ref'),
    best: st.reading.p01.best, xp: st.xp, disabledShort, prompt: call.body.contents[0].parts[0].text.includes('Ich wohne in München') && call.body.contents[0].parts[0].text.includes('ساكنة في برلين'),
    schema: !!call.body.generationConfig.responseSchema };
})()`);
check('reading: Gemini grade → score, what you got / missed / got wrong, the reference behind a toggle; best + XP saved', graded.pct === '72%' && graded.wrong >= 3 && graded.ref && graded.best === 72 && graded.xp >= 20, JSON.stringify(graded));
check('reading: the request carries the passage, the reference and the answer, asks for JSON; too-short answers can\'t be sent', graded.prompt && graded.schema && graded.disabledShort, JSON.stringify(graded));
await p.evaluate(`window.__gem.mode = 'badkey'`);
const bad = await p.evaluate(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#rdAgain').click(); await sleep(300);
  document.querySelector('#rdCheck').click(); await sleep(900);
  return { msg: document.querySelector('#rdBody').innerText.slice(0, 120), retry: !!document.querySelector('#rdRetry') };
})()`);
check('reading: a bad key gives a clear Egyptian message + retry / compare-myself', /مفتاح Gemini مش شغّال/.test(bad.msg) && bad.retry, JSON.stringify(bad));

// back inside a passage: your understanding → the text → the words → the list (what you typed stays)
await p.hash('#/read', 400); await p.hash('#/read/p01', 1200);
const steps = await p.evaluate(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const backNow = async () => { window.__back.handler(); await sleep(400); };
  document.querySelector('#rdSkip').click(); await sleep(300);
  document.querySelector('#rdWrite').click(); await sleep(300);
  document.querySelector('#rdAnswer').value = 'نص كتبته'; document.querySelector('#rdAnswer').dispatchEvent(new Event('input'));
  await backNow(); const a = { hash: location.hash, text: !!document.querySelector('.rd-text-card') };
  document.querySelector('#rdWrite').click(); await sleep(300); const kept = document.querySelector('#rdAnswer').value;
  await backNow(); await backNow(); const b = { hash: location.hash, words: !!document.querySelector('#rdQuiz') };
  await backNow(); return { a, kept, b, end: location.hash };
})()`);
check('back inside a passage steps back (write → text → words → list) and keeps what you typed',
  steps.a.hash === '#/read/p01' && steps.a.text && steps.kept === 'نص كتبته' && steps.b.words && steps.end === '#/read', JSON.stringify(steps));

// review 1.8 regressions: a passage left in the middle must not swallow later back presses; back while Gemini is grading
// returns to «فهمك» with the text; after coming back from a child page, back keeps going up (not to a page never opened)
await p.hash('#/read/p02', 1200);
await p.evaluate(`(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); const { store } = await import('./js/store.js'); store.state.reading.p02 = { words: true }; store.save(); })()`);
await p.hash('#/read', 300); await p.hash('#/read/p02', 1000);
await p.evaluate(`(async () => { document.querySelector('#rdSkip').click(); await new Promise(r => setTimeout(r, 300)); })()`);   // step 2, then leave by the tab bar
await p.hash('#/home', 600);
const minBefore = await p.evaluate(`window.__back.minimized`);
await back();
check('a passage left at step 2 no longer swallows back presses on other pages (home → minimize on the 1st press)', await p.evaluate(`window.__back.minimized`) === minBefore + 1);
await p.evaluate(`window.__gem.mode = 'ok'; window.__gem.delay = 1500`);
await p.evaluate(`(() => { const rf = window.fetch; window.fetch = (u, o) => String(u).includes('generativelanguage') && window.__gem.delay ? new Promise(r => setTimeout(() => r(rf(u, o)), window.__gem.delay)) : rf(u, o); })()`);
await p.hash('#/read/p01', 1200);
const g2 = await p.evaluate(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#rdSkip').click(); await sleep(250);
  document.querySelector('#rdWrite').click(); await sleep(250);
  const ta = document.querySelector('#rdAnswer'); ta.value = 'لينا من ألمانيا وساكنة في ميونخ مع صاحبتها.'; ta.dispatchEvent(new Event('input'));
  document.querySelector('#rdCheck').click(); await sleep(200);
  const waiting = !!document.querySelector('.rd-wait');
  window.__back.handler(); await sleep(300);
  const backTo = { write: !!document.querySelector('#rdAnswer'), kept: (document.querySelector('#rdAnswer') || {}).value, hash: location.hash };
  await sleep(1800);                                                       // the late reply must not replace the write step
  return { waiting, backTo, stillWrite: !!document.querySelector('#rdAnswer') && !document.querySelector('.rd-pct') };
})()`);
check('back while Gemini is grading → «فهمك» with the text kept, and the late reply is ignored', g2.waiting && g2.backTo.write && /ميونخ/.test(g2.backTo.kept || '') && g2.backTo.hash === '#/read/p01' && g2.stillWrite, JSON.stringify(g2));
await p.evaluate(`window.__gem.delay = 0`);
await p.hash('#/home', 400); await p.hash('#/ref/topics', 600); await p.hash('#/ref/topic?id=articles', 600);
h = await back();
const h2 = await back();
check('back after a child page keeps going up: topic → topics → home (never a page you didn\'t open)', h === '#/ref/topics' && h2 === '#/home', `${h} → ${h2}`);

// ---------- 🧩 grammar topics ----------
await p.hash('#/ref/topics', 1200);
const tops = await p.evaluate(`(async () => { const { CONTENT } = await import('./js/content.js'); return { n: CONTENT.topics.length, cards: document.querySelectorAll('.rf-topic').length, ids: CONTENT.topics.map(t => t.id) }; })()`);
check('topics: the 8 grammar topics are listed', tops.n === 8 && tops.cards === 8, JSON.stringify(tops));
const bad2 = [];
for (const id of tops.ids) {
  await p.hash(`#/ref/topic?id=${id}`, 500);
  const r = await p.evaluate(`({ secs: document.querySelectorAll('.rf-topic-body .rf-point').length, play: !!document.querySelector('a[href="#/game/grammar?topic=${id}"]'),
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
  if (r.secs < 3 || !r.play || r.over > 1) bad2.push(`${id}: ${JSON.stringify(r)}`);
}
check('topics: every topic page renders (≥ 3 sections, quiz button, no sideways overflow)', tops.n === 8 && !bad2.length, bad2.join(' | '));
await p.hash('#/game/grammar?topic=articles', 1500);
const game = await p.evaluate(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const go = document.querySelector('.gm-go');
  if (!go || go.disabled) return { error: 'no start button / not enough items' };
  go.click(); await sleep(700);
  const de = document.querySelector('.gm-gr-de') && document.querySelector('.gm-gr-de').textContent;
  const n = document.querySelectorAll('.gm-choice').length;
  document.querySelector('.gm-choice').click(); await sleep(400);
  return { de, n, fb: !!document.querySelector('.gm-fb.show') };
})()`);
check('topics: the grammar quiz starts for one topic (sentence with a blank, 3–4 options, feedback)', game.de && game.de.includes(' ') === false && game.n >= 3 && game.fb, JSON.stringify(game));
const days = await p.evaluate(`(async () => {
  const { store, todayIndex } = await import('./js/store.js'); const { DATA } = await import('./js/data.js');
  const saved = JSON.stringify(store.state.exams); store.state.exams = {}; for (const l of DATA.lessons) store.state.exams[l.n] = { passed: todayIndex() - 1 };
  const m = await import('./js/games/grammar.js'); const items = m.itemsFor({ topic: 'daysmonths' });
  store.state.exams = JSON.parse(saved); store.save();
  const gen = items.filter(q => q.gen);
  return { gen: gen.length, bad: items.filter(q => q.opts.some(o => typeof o !== 'string') || new Set(q.opts).size !== q.opts.length || !q.opts.includes(q.answer)).length,
    wrap: gen.some(q => q.q === 'Nach Sonntag kommt ___.' && q.answer === 'Montag') && gen.some(q => q.q === 'Nach Dezember kommt ___.' && q.answer === 'Januar') };
})()`);
check('days/months: generated items have word options (no «[object Object]») and wrap around (Sonntag → Montag, Dezember → Januar)', days.gen === 19 && days.bad === 0 && days.wrap, JSON.stringify(days));

const errs = p.errors.filter(e => !noise(e));
check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await p.close();
for (const x of results) console.log(x);
const fails = results.filter(x => x.startsWith('FAIL')).length;
console.log(`t_features: ${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
