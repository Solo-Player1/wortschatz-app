// Flow QA: full study sessions over simulated days, match game, stats, theme, 360 width.
import { launch } from './cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8131/index.html';
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const noise = e => /raw\.githubusercontent|tv-download\.dw\.com|_capacitor_file_|navigator.vibrate/i.test(e);

// fake clock: day offset kept in localStorage so reloads keep the simulated date
const CLOCK = `(() => {
  const off = +(new URLSearchParams(location.search).get('qaoff') || 0) * 86400000;
  const RD = Date;
  class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } }
  window.Date = FD;
})();`;

// play one session: answer with a policy, return final summary text
const PLAY = `async (policy) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let steps = 0, wrongs = 0;
  for (; steps < 400; steps++) {
    await sleep(60);
    const q = s => document.querySelector(s);
    if (q('[data-act=again]')) return { done: true, steps, wrongs, text: q('.ss-wrap')?.innerText.slice(0, 300) };
    if (q('.ss-fb.show [data-act=continue]')) { await sleep(150); q('.ss-fb.show [data-act=continue]').click(); continue; }
    const know = q('.ss-stage [data-act=know]');
    if (know && know.offsetParent) { know.click(); continue; }
    if (q('.ss-stage [data-act=flip]')) { q('.ss-stage [data-act=flip]').click(); await sleep(350); continue; }
    const opts = [...document.querySelectorAll('.ss-stage [data-act=opt]:not([disabled])')];
    if (opts.length) {
      // policy 'mixed': every 4th answer pick the 2nd option (often wrong), else 1st
      const i = policy === 'mixed' && steps % 4 === 3 ? 1 : 0;
      opts[Math.min(i, opts.length - 1)].click(); continue;
    }
    if (q('[data-act=giveup]')) { wrongs++; q('[data-act=giveup]').click(); continue; }
  }
  return { done: false, steps, wrongs, html: [...document.querySelectorAll("#view [data-act]")].map(b => b.dataset.act + (b.disabled ? "(dis)" : "") + (b.offsetParent ? "" : "(hidden)")).join(",") + " :: " + (document.querySelector(".ss-stage")?.innerText || "").slice(0, 200) };
}`;

const p = await launch({ port: 9351 });
await p.addInit(CLOCK);
await p.goto(BASE + '#/home', 1800);
await p.evaluate(`localStorage.clear(); localStorage.setItem('qa:dayOffset','0')`);
await p.goto(BASE + '#/home', 1500);

let streakSeen = [];
for (let day = 0; day < 4; day++) {
  if (day > 0) { await p.goto(BASE.replace('index.html', 'index.html?qaoff=' + (day === 3 ? 5 : day)) + '#/home', 1500); }
  await p.hash('#/session', 900);
  const r = await p.evaluate(`(${PLAY})('mixed')`);
  check(`day ${day}: session finishes`, r.done, r.done ? `steps=${r.steps}` : (r.html || ''));
  if (day === 0) await p.shot(path.join(OUT, 'flow-results.png'));
  const st = await p.evaluate(`JSON.parse(localStorage.getItem('ws:v1'))`);
  const seen = Object.keys(st.progress || {}).length;
  streakSeen.push(st.streak.current);
  check(`day ${day}: progress grows (${seen} words seen), xp=${st.xp}`, seen > 0 && st.xp > 0);
}
check('streak 1,2,3 then reset after gap', JSON.stringify(streakSeen) === '[1,2,3,1]', JSON.stringify(streakSeen));

// lesson session + match game
await p.hash('#/session?lesson=5', 900);
const rl = await p.evaluate(`(${PLAY})('good')`);
check('lesson 5 session finishes', rl.done, rl.html || '');
await p.hash('#/match?lesson=2', 900);
const mg = await p.evaluate(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let k = 0; k < 20; k++) {
    const de = [...document.querySelectorAll('.mg-btn[data-side=de]:not(.ok):not(.gone)')];
    if (!de.length) break;
    const id = de[0].dataset.id;
    de[0].click(); await sleep(80);
    const ar = document.querySelector('.mg-btn[data-side=ar][data-id="' + CSS.escape(id) + '"]'); if (ar) ar.click();
    await sleep(500);
  }
  await sleep(800);
  return { again: !!document.querySelector('[data-act=again]'), text: document.querySelector('#view').innerText.slice(0, 200) };
})()`);
check('match game completes', mg.again, mg.text);
await p.shot(path.join(OUT, 'flow-match-done.png'));

// stats + lessons render with data, no overflow at 360
await p.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
for (const r of ['#/home', '#/lessons', '#/lesson/1', '#/stats', '#/settings', '#/video/1', '#/session']) {
  await p.hash(r, 900);
  const ow = await p.evaluate(`document.documentElement.scrollWidth - innerWidth`);
  const errCard = await p.evaluate(`!!document.querySelector('#view')?.innerText.includes('حصلت مشكلة')`);
  check(`360px ${r}: no overflow, no error card`, ow <= 0 && !errCard, `ow=${ow}`);
}
await p.hash('#/stats', 900);
await p.shot(path.join(OUT, 'flow-stats-360.png'));
const errs = p.errors.filter(e => !noise(e));
check('zero console errors (flow)', errs.length === 0, errs.join(' | ').slice(0, 800));
await p.close();
console.log(results.join('\n'));
console.log(results.some(r => r.startsWith('FAIL')) ? 'SOME FAILED' : 'ALL PASS');
