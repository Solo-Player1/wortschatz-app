// review-3: the review mission (all exams passed) stays done when a mistake follows in the SAME game.
import { launch } from './cdp.mjs';
const URL = 'http://127.0.0.1:8131/index.html';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
const p = await launch({ port: 9475 });
await p.goto(URL + '#/home', 2500);
await p.evaluate(`localStorage.removeItem('ws:v1')`);
await p.goto(URL + '#/home', 3000);
await p.evaluate(`(async () => {
  const { store, todayIndex } = await import('./js/store.js');
  const { DATA } = await import('./js/data.js');
  const t = todayIndex();
  for (const l of DATA.lessons) store.state.exams[l.n] = { passed: t - 10, crown: t - 5, best: 100, tries: 1, crownTries: 1 };
  for (const w of DATA.words) store.state.progress[w.id] = { box: 4, due: t + 5, seen: 3, ok: 3, bad: 0, last: 1, typed: 1 };
  store.state.days = {};
  store.save();
})()`);
await p.hash('#/game/articles?lesson=2&autostart=1', 1500);
const r = await p.evaluate(`(async () => {
  const { DATA } = await import('./js/data.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const art = () => { const sg = document.querySelector('.gm-articles-word bdi')?.textContent.replace('?', '').trim(); const w = DATA.words.find(x => x.k === 'noun' && x.sg === sg); return w && w.art; };
  let right = 0, wrong = 0;
  for (let i = 0; i < 400 && right + wrong < 11; i++) {
    await sleep(150);
    const btns = [...document.querySelectorAll('.gm-articles-btn:not(:disabled)')];
    if (!btns.length) continue;
    const a = art();
    if (!a) continue;
    if (right < 10) { btns.find(b => b.dataset.art === a).click(); right++; }
    else { btns.find(b => b.dataset.art !== a).click(); wrong++; }
    await sleep(100);
  }
  await sleep(500);
  const { store, today } = await import('./js/store.js');
  const m = (await import('./js/mastery.js')).mission();
  const d = store.state.days[today()] || {};
  return { right, wrong, done: d.done, reviewDone: !!d.reviewDone, mission: { review: m.review, done: m.done, due: m.due } };
})()`);
check('10 right then 1 wrong in the same game → review mission stays done', r.right === 10 && r.wrong === 1 && r.reviewDone && r.mission.review && r.mission.done && r.mission.due >= 1, JSON.stringify(r));
const errs = p.errors.filter(e => !/githubusercontent|vibrate|_capacitor_file_/.test(e));
check('zero console errors', errs.length === 0, errs.join(' | ').slice(0, 400));
await p.close();
console.log(results.join('\n'));
console.log(results.every(x => x.startsWith('PASS')) ? 'ALL PASS' : 'SOME FAILED');
