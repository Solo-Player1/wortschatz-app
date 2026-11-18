// 📅 Plan QA: home plan card + daily mission follow the quota, settings date/switch, overdue state, 390 light / 360 dark,
// no errors. Clock-independent: the plan target is seeded relative to today.
// Needs: python tests/e2e/serve.py 8131   ·   run: node tests/e2e/t_plan.mjs
import { launch } from './cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8131/index.html';
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const noise = e => /raw\.githubusercontent|tv-download\.dw\.com|_capacitor_file_|navigator.vibrate|static\.dw\.com/i.test(e);

// in-page helpers (local-midnight day index like store.js)
const H = `const __idx = d => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000 + 0.1);
  const __ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const __plus = n => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };`;
// seed: lessons 1–15 passed two days ago, plan target = today + 42 (only if the profile is empty)
const SEED = `(() => { ${H}
  if (localStorage.getItem('ws:v1')) return;
  const t = __idx(new Date());
  const exams = {}; for (let n = 1; n <= 15; n++) exams[n] = { passed: t - 2, best: 10, tries: 1 };
  localStorage.setItem('ws:v1', JSON.stringify({ version: 1, settings: { name: 'عبدالله', introSeen: true, notifyCardHidden: true, planTarget: __ymd(__plus(42)) }, exams }));
})();`;
const TODAY_IDX = `(() => { ${H} return __idx(new Date()); })()`;
const DM = n => `(() => { ${H} const d = __plus(${n}); return d.getDate() + '/' + (d.getMonth() + 1); })()`;

async function run({ width, dark, tag, port }) {
  const b = await launch({ width, height: 844, port, dark });
  await b.addInit(SEED);
  await b.goto(BASE, 2500);
  await b.hash('#/home', 1200);
  const total = await b.evaluate(`fetch('data/lessons.json').then(r => r.json()).then(j => j.lessons.filter(l => l.words.length).length)`);
  const expect = Math.ceil((total - 15) / 43);                       // target = today + 42 → 43 days incl. today
  const targetDM = await b.evaluate(DM(42)), a2DM = await b.evaluate(DM(43));
  const home = await b.evaluate(`(() => { const c = document.querySelector('.plan-card'); return c ? { num: c.querySelector('.plan-num')?.textContent, h2: c.querySelector('h2')?.textContent, text: c.innerText, done: c.classList.contains('done') } : null; })()`);
  check(`${tag} plan card on home`, !!home && home.h2.includes(targetDM), home ? home.h2 : 'missing');
  check(`${tag} quota = ceil(${total - 15} left / 43 days) = ${expect}`, home && +home.num === expect, home && home.num);
  check(`${tag} card: 15/${total} lessons in A1, A2 starts the day after the target`, home && home.text.includes(`15 من ${total} درس في A1`) && home.text.includes(a2DM), home && home.text.replace(/\s+/g, ' ').slice(0, 170));
  const ms = await b.evaluate(`document.querySelector('.mission .ms-title')?.textContent || ''`);
  check(`${tag} mission follows the plan`, expect === 1 ? /الدرس 16/.test(ms) : (/مطلوب النهارده/.test(ms) && /الدرس 16/.test(ms)), ms);
  const overflow = await b.evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  check(`${tag} no horizontal overflow`, overflow <= 1, `+${overflow}px`);
  await b.shot(path.join(OUT, `plan_home_${tag}.png`));

  // pass today's quota → card + mission done
  await b.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('ws:v1')); const t = ${TODAY_IDX};
    for (let n = 16; n < 16 + ${expect}; n++) s.exams[n] = { passed: t, best: 10, tries: 1 };
    localStorage.setItem('ws:v1', JSON.stringify(s)); location.reload(); })()`, { awaitPromise: false });
  await b.sleep(2500);
  await b.hash('#/settings', 600);
  await b.hash('#/home', 1200);
  const after = await b.evaluate(`({ done: document.querySelector('.plan-card')?.classList.contains('done'), chip: document.querySelector('.plan-card .chip')?.textContent, mission: document.querySelector('.mission')?.classList.contains('done') })`);
  check(`${tag} quota met → plan card done`, after.done === true, after.chip);
  check(`${tag} quota met → mission done`, after.mission === true);
  await b.shot(path.join(OUT, `plan_done_${tag}.png`));

  // settings: section + change the date
  await b.hash('#/settings', 1000);
  const seeded = await b.evaluate(`JSON.parse(localStorage.getItem('ws:v1')).settings.planTarget`);
  const st = await b.evaluate(`({ val: document.querySelector('#planDate')?.value, note: document.querySelector('#planNote')?.textContent, sw: !!document.querySelector('.switch input[data-key=planOn]') })`);
  check(`${tag} settings has plan switch + date (= saved target)`, st.sw && st.val === seeded, JSON.stringify(st));
  await b.evaluate(`(() => { const i = document.querySelector('#planDate'); i.value = '2027-06-30'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.sleep(400);
  const saved = await b.evaluate(`JSON.parse(localStorage.getItem('ws:v1')).settings.planTarget`);
  const note = await b.evaluate(`document.querySelector('#planNote')?.textContent || ''`);
  check(`${tag} date change saved`, saved === '2027-06-30', saved);
  check(`${tag} note updated (A2 from 1/7)`, note.includes('1/7'), note);
  await b.shot(path.join(OUT, `plan_settings_${tag}.png`));
  await b.hash('#/home', 1000);
  const h2 = await b.evaluate(`document.querySelector('.plan-card h2')?.textContent || ''`);
  check(`${tag} home card shows the new date`, h2.includes('30/6'), h2);

  // target date passed → no impossible quota: card asks for a new date, mission = one lesson
  await b.evaluate(`(() => { ${H} const s = JSON.parse(localStorage.getItem('ws:v1')); s.settings.planTarget = __ymd(__plus(-3));
    for (let n = 16; n <= 30; n++) delete s.exams[n]; localStorage.setItem('ws:v1', JSON.stringify(s)); location.reload(); })()`, { awaitPromise: false });
  await b.sleep(2500);
  await b.hash('#/settings', 500);
  await b.hash('#/home', 1200);
  const od = await b.evaluate(`({ chip: document.querySelector('.plan-card .chip')?.textContent, link: !!document.querySelector('.plan-card a[href="#/settings"]'), num: !!document.querySelector('.plan-card .plan-num'), ms: document.querySelector('.mission .ms-title')?.textContent || '' })`);
  check(`${tag} overdue → card asks for a new date (no quota number)`, od.chip === 'التاريخ عدّى' && od.link && !od.num, JSON.stringify(od));
  check(`${tag} overdue → mission back to one lesson`, /خلّص الدرس 16 النهارده/.test(od.ms), od.ms);
  await b.shot(path.join(OUT, `plan_overdue_${tag}.png`));

  // switch off → card hidden
  await b.hash('#/settings', 800);
  await b.evaluate(`(() => { const i = document.querySelector('.switch input[data-key=planOn]'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.hash('#/home', 1000);
  const off = await b.evaluate(`({ card: !!document.querySelector('.plan-card') })`);
  check(`${tag} plan off → no card`, off.card === false);

  const errs = b.errors.filter(e => !noise(e));
  check(`${tag} no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
}

await run({ width: 390, dark: false, tag: '390light', port: 9476 });   // 9471/9472 belong to t_fixes2
await run({ width: 360, dark: true, tag: '360dark', port: 9477 });
for (const r of results) console.log(r);
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`t_plan: ${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
