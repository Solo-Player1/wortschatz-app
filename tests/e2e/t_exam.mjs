// Exam/drill QA: answer every exam question correctly (derived from the prompt) → lesson passed; then a failing run.
import { launch } from './cdp.mjs';
const LESSON = +(process.argv[2] || 3);
const p = await launch({ port: 9391 });
// headless Edge has no working speech output: a device-like TTS that finishes after 150 ms (askTiles waits for the sentence)
await p.addInit(`(() => {
  const ss = { speaking: false, pending: false, paused: false, getVoices: () => [], cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
    speak(u) { setTimeout(() => { if (u.onend) u.onend(); }, 150); } };
  Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__lastSrc = String(this.src || this.currentSrc || ''); return play.call(this); };
})();`);
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
await p.goto('http://127.0.0.1:8131/index.html#/home', 2000);
await p.evaluate(`localStorage.removeItem('ws:v1')`);
await p.goto('http://127.0.0.1:8131/index.html#/home', 2000);

// solver runs inside the page: finds the item by its Arabic prompt and answers it
const SOLVE = `async (mode) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { DATA, wordsOfLesson } = await import('./js/data.js');
  const { CONTENT, tilesOf } = await import('./js/content.js');
  const { expectedFor } = await import('./js/games/engine.js');
  const norm = s => String(s || '').replace(/\\s+/g, ' ').trim();
  let steps = 0, wrongs = 0;
  for (; steps < 300; steps++) {
    await sleep(120);
    if (document.querySelector('.gm-results, .ex-res')) return { done: true, steps, wrongs, text: document.querySelector('#view').innerText.slice(0, 160) };
    const next = document.querySelector('.gm-fb.show .gm-fb-next');
    if (next) { next.click(); continue; }
    if (document.querySelector('.gm-fb.show')) continue;
    const wantWrong = mode === 'fail';
    const ar = norm(document.querySelector('.gm-stage .gm-ar, .gm-stage .muted')?.textContent);
    const input = document.querySelector('.gm-stage .gm-input');
    if (input && !input.disabled) {
      const same = DATA.words.filter(x => norm(x.ar) === ar);
      if (same.length > 1 && document.querySelector('.gm-stage .gm-speaker')) { window.__lastSrc = ''; document.querySelector('.gm-stage .gm-speaker').click(); await sleep(30); }   // 🔊 replays THIS question's word
      const heard = window.__lastSrc || '';
      const w = (same.length > 1 && same.find(x => x.file && heard.includes(x.file))) || same[0];
      input.value = wantWrong ? 'xyz' : (w ? expectedFor(w).show : 'unknown');
      if (wantWrong) wrongs++;
      document.querySelector('.gm-stage .gm-submit').click(); continue;
    }
    const tiles = [...document.querySelectorAll('.gm-stage .gm-bank .gm-tile')];
    if (tiles.length && !tiles[0].disabled) {
      const clean = d => String(d).replace(/^\\([^)]*\\)\\s*/, '').replace(/\\s*(\\.\\.\\.|…)\\s*$/u, '');
      const bank = tiles.map(t => t.textContent.trim()).sort().join('|');
      const cands = [...CONTENT.sentences.filter(x => norm(x.ar) === ar).map(x => x.de), ...DATA.words.filter(x => norm(x.ar) === ar).map(x => clean(x.de))];
      const de = cands.find(c => c.split(' ').slice().sort().join('|') === bank) || cands[0] || '';
      const want = de.split(' ');
      const order = wantWrong ? want.slice().reverse() : want;
      for (const t of order) {
        const b = [...document.querySelectorAll('.gm-stage .gm-bank .gm-tile')].find(x => x.textContent.trim() === t);
        if (b) b.click();
      }
      if (wantWrong) wrongs++;
      await sleep(50);
      document.querySelector('.gm-stage .gm-submit')?.click(); continue;
    }
    const opts = [...document.querySelectorAll('.gm-stage .gm-choice:not(:disabled)')];
    if (opts.length) {
      const deP = norm(document.querySelector('.gm-stage .gm-de-big')?.textContent);
      let answer = null;
      const isWq = /استفهام/.test(document.querySelector('.gm-stage .hint')?.textContent || '');
      const sent = !isWq && CONTENT.sentences.find(x => x.cloze && norm(x.ar) === ar);
      const wq = isWq && CONTENT.wfragen.find(x => norm(x.ar) === ar);
      if (sent) answer = sent.cloze.word;
      else if (wq) answer = wq.answer;
      else {
        const v = CONTENT.verbs.find(x => deP.includes('(' + x.inf + ')'));
        const PERS = { 'ich': 'ich', 'du': 'du', 'er / sie / es': 'er', 'wir': 'wir', 'ihr': 'ihr', 'sie / Sie': 'sie' };
        if (v) { const key = Object.keys(PERS).find(k => deP.startsWith(k + ' ')); answer = v.forms[PERS[key]]; }
      }
      let b = opts.find(o => norm(o.textContent) === norm(answer));
      if (wantWrong) { b = opts.find(o => norm(o.textContent) !== norm(answer)); wrongs++; }
      (b || opts[0]).click(); continue;
    }
  }
  return { done: false, steps, stage: document.querySelector(".gm-stage")?.innerText.slice(0, 300), fb: document.querySelector(".gm-fb")?.className, inputDis: document.querySelector(".gm-input")?.disabled, val: document.querySelector(".gm-input")?.value, sc: document.querySelector(".gm-score b")?.textContent };
}`;

await p.hash(`#/exam/${LESSON}`, 1200);
const introOk = await p.evaluate(`!!document.querySelector('.gm-go')`);
check('exam intro rendered', introOk);
await p.shot(`shots/exam-intro-L${LESSON}.png`);
await p.evaluate(`document.querySelector('.gm-go').click()`);
await p.sleep(700);
await p.shot(`shots/exam-q1-L${LESSON}.png`);
const r1 = await p.evaluate(`(${SOLVE})('pass')`);
check('exam: all correct reaches results', r1.done, JSON.stringify(r1).slice(0, 300));
console.log('EXAM-MISTAKES:', await p.evaluate(`document.querySelector('.gm-mistakes')?.innerText || 'none'`));
const st1 = await p.evaluate(`JSON.parse(localStorage.getItem('ws:v1')).exams`);
check('exam: lesson recorded as passed', !!(st1 && st1[LESSON] && st1[LESSON].passed), JSON.stringify(st1));
await p.shot(`shots/exam-pass-L${LESSON}.png`);

await p.hash('#/home', 600);
await p.hash(`#/exam/${LESSON}`, 1200);
await p.evaluate(`document.querySelector('.gm-go').click()`);
await p.sleep(600);
const r2 = await p.evaluate(`(${SOLVE})('fail')`);
check('exam: 3 wrong → lose screen', r2.done && /الوحش كسب|تثبيت|لسه/.test(r2.text || ''), (r2.text || '').slice(0, 120));
await p.shot(`shots/exam-fail-L${LESSON}.png`);

await p.hash(`#/lesson/${LESSON}`, 1000);
const plan = await p.evaluate(`[...document.querySelectorAll('.plan-row')].map(r => (r.classList.contains('done') ? '✓' : '·') + r.querySelector('b').textContent.trim()).join(' | ')`);
check('lesson plan shows exam passed', /✓٤/.test(plan.replace(/\s/g, '')) || plan.includes('✓٤'), plan);
await p.shot(`shots/exam-lessonpage-L${LESSON}.png`);

await p.hash('#/drill/' + LESSON, 1000);
const drillIntro = await p.evaluate(`document.querySelector('.gm-pool-hint, .gm-intro .hint')?.textContent || ''`);
check('drill intro renders', !!drillIntro, drillIntro);
await p.evaluate(`document.querySelector('.gm-go')?.click()`);
await p.sleep(700);
await p.shot(`shots/drill-q1-L${LESSON}.png`);
const r3 = await p.evaluate(`(${SOLVE})('pass')`);
check('drill: solving all reaches results', r3.done, JSON.stringify(r3).slice(0, 200)); console.log('MISTAKES:', await p.evaluate(`document.querySelector('.gm-mistakes')?.innerText || 'none'`));
const star3 = await p.evaluate(`import('./js/mastery.js').then(m => { const s = m.lessonStatus(${LESSON}); return { star3: s.star3, done: s.itemsDone, need: s.itemsNeed, total: s.itemsTotal }; })`);
check('drill: star 3 earned', star3.star3, JSON.stringify(star3));
await p.shot(`shots/drill-done-L${LESSON}.png`);

const errs = p.errors.filter(e => !/githubusercontent|vibrate|games\/(articles|scramble|sentence|wfragen|verbs|numbers|alphabet|truefalse|memory|cloze|rain)\.js/.test(e));
check('zero console errors', errs.length === 0, errs.join(' | ').slice(0, 500));
await p.close();
console.log(results.join('\n'));
