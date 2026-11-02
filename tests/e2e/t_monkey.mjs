// Monkey test: every game, light + dark, 360 + 390 — start, play randomly until the results screen, no errors/overflow.
import { launch } from './cdp.mjs';
const GAMES = (process.argv[2] || 'listen-write,articles,scramble,sentence,wfragen,verbs,numbers,alphabet,truefalse,memory,cloze,rain').split(',');
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
const MONKEY = `async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => el && el.offsetParent !== null && !el.disabled;
  let steps = 0, maxOw = 0;
  for (; steps < 400; steps++) {
    await sleep(steps % 10 === 0 ? 250 : 90);
    maxOw = Math.max(maxOw, document.documentElement.scrollWidth - innerWidth);
    if (document.querySelector('.gm-results, .ex-res')) return { done: true, steps, maxOw };
    const nxt = document.querySelector('.gm-fb.show .gm-fb-next');
    if (nxt) { nxt.click(); continue; }
    const st = document.querySelector('.gm-stage');
    if (!st) return { done: false, steps, why: 'no stage', html: document.querySelector('#view').innerHTML.slice(0, 300) };
    const input = [...st.querySelectorAll('input')].find(vis);
    if (input) { input.value = Math.random() < 0.5 ? 'test' : '12'; const b = [...st.querySelectorAll('.gm-submit, button')].filter(vis).find(b => /تحقق|check|✓/i.test(b.textContent)) || st.querySelector('.gm-submit'); if (b) b.click(); else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); continue; }
    const bank = [...st.querySelectorAll('.gm-bank .gm-tile, [class*=tile]:not(:disabled)')].filter(vis);
    if (bank.length) { bank[Math.floor(Math.random() * bank.length)].click(); const sub = st.querySelector('.gm-submit:not(:disabled)'); if (sub) sub.click(); continue; }
    const btns = [...st.querySelectorAll('button, [role=button]')].filter(vis).filter(b => !/🔊|💡|👁/.test(b.textContent));
    if (btns.length) { btns[Math.floor(Math.random() * btns.length)].click(); continue; }
  }
  return { done: false, steps, maxOw, why: 'timeout', stage: document.querySelector('.gm-stage')?.innerText.slice(0, 200) };
}`;
for (const [dark, width] of [[false, 390], [true, 360]]) {
  const p = await launch({ port: dark ? 9412 : 9411, dark, width });
  await p.goto('http://127.0.0.1:8131/index.html#/home', 2500);
  for (const id of GAMES) {
    await p.hash('#/home', 300);
    await p.hash(`#/game/${id}`, 1300);
    const intro = await p.evaluate(`({ go: !!document.querySelector('.gm-go'), dis: !!document.querySelector('.gm-go')?.disabled, hint: document.querySelector('.gm-pool-hint')?.textContent || '' })`);
    if (!intro.go) { check(`${id} [${dark ? 'dark' : 'light'} ${width}] intro`, false, 'no start button'); continue; }
    if (intro.dis) {   // درس صغير: نجرّب «كل الدروس»
      await p.evaluate(`document.querySelector('.gm-pool-seg button[data-k=all]')?.click()`);
      await p.sleep(200);
    }
    await p.evaluate(`document.querySelector('.gm-go').click()`);
    await p.sleep(800);
    await p.shot(`shots/mk-${id}-${dark ? 'dark' : 'light'}-${width}.png`);
    const r = await p.evaluate(`(${MONKEY})()`);
    check(`${id} [${dark ? 'dark' : 'light'} ${width}] reaches results`, r.done, JSON.stringify(r).slice(0, 220));
    check(`${id} [${dark ? 'dark' : 'light'} ${width}] no horizontal overflow`, (r.maxOw | 0) <= 0, 'maxOw=' + r.maxOw);
    await p.shot(`shots/mk-${id}-${dark ? 'dark' : 'light'}-${width}-res.png`);
  }
  const errs = p.errors.filter(e => !/githubusercontent|vibrate|tv-download/.test(e));
  check(`[${dark ? 'dark' : 'light'} ${width}] zero console errors`, errs.length === 0, errs.slice(0, 6).join(' | ').slice(0, 900));
  await p.close();
}
console.log(results.join('\n'));
console.log(results.some(r => r.startsWith('FAIL')) ? 'SOME FAILED' : 'ALL PASS');
