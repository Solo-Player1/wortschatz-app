// Notification planning QA with a mocked LocalNotifications plugin.
import { launch } from './cdp.mjs';
const p = await launch({ port: 9401 });
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
await p.addInit(`(() => {
  const pending = new Map();
  window.__ln = { pending, scheduled: 0, perm: 'prompt', channels: [] };
  window.Capacitor = {
    isNativePlatform: () => true,
    convertFileSrc: u => u,
    Plugins: {
      LocalNotifications: {
        checkPermissions: async () => ({ display: window.__ln.perm }),
        requestPermissions: async () => { window.__ln.perm = 'granted'; return { display: 'granted' }; },
        getPending: async () => ({ notifications: [...pending.values()].map(n => ({ id: n.id })) }),
        cancel: async ({ notifications }) => { for (const n of notifications) pending.delete(n.id); },
        schedule: async ({ notifications }) => { for (const n of notifications) pending.set(n.id, n); window.__ln.scheduled += notifications.length; return { notifications }; },
        createChannel: async c => { window.__ln.channels.push(c.id); },
        addListener: () => ({ remove: async () => {} }),
      },
    },
  };
})();`);
await p.goto('http://127.0.0.1:8131/index.html#/home', 2500);
await p.evaluate(`localStorage.removeItem('ws:v1')`);
await p.goto('http://127.0.0.1:8131/index.html#/home', 3500);
let s = await p.evaluate(`({ n: window.__ln.pending.size, perm: window.__ln.perm })`);
// since 1.4 reminders are always on: the app asks for the permission by itself on the first open
check('first open: app asks for the permission by itself → reminders scheduled', s.perm === 'granted' && s.n >= 70, JSON.stringify(s));
await p.evaluate(`document.querySelector('#ncOn')?.click()`);
await p.sleep(800);
s = await p.evaluate(`(() => { const list = [...window.__ln.pending.values()]; const today = new Date().toDateString(); return { n: list.length, today: list.filter(x => new Date(x.schedule.at).toDateString() === today).length, hours: [...new Set(list.map(x => new Date(x.schedule.at).getHours()))].sort((a,b)=>a-b), sample: list[0] && { title: list[0].title, body: list[0].body, ch: list[0].channelId, icon: list[0].smallIcon, exact: list[0].isExactNotification }, card: !!document.querySelector('#notifyCard') }; })()`);
check('after enabling: hourly notifications for ~7 days between 10 and 22', s.n >= 70 && s.n <= 91 && s.hours[0] >= 10 && s.hours[s.hours.length - 1] <= 22, JSON.stringify({ n: s.n, today: s.today, hours: s.hours }));
check('notification content', !!(s.sample && s.sample.title && s.sample.body && s.sample.ch === 'study' && s.sample.icon === 'ic_stat_w' && s.sample.exact === false), JSON.stringify(s.sample));
check('enable card disappears', !s.card);
// 📅 the daily mission follows the study plan: today's quota of lesson exams (plan.js), not just one exam
const todayCount = `(() => { const list = [...window.__ln.pending.values()]; const today = new Date().toDateString(); return { n: list.length, today: list.filter(x => new Date(x.schedule.at).toDateString() === today).length }; })()`;
const quota = await p.evaluate(`import('./js/plan.js').then(m => m.planStatus().perDay)`);
const hasEveningSlot = new Date().getHours() < 21;     // a reminder later today exists only before ~21:00
await p.evaluate(`import('./js/progress.js').then(m => m.recordExam(1, { kind: 'exam', passed: true, score: 100 }))`);
await p.evaluate(`import('./js/notify.js').then(m => m.replan())`);
await p.sleep(400);
s = await p.evaluate(todayCount);
if (quota > 1 && hasEveningSlot) check(`plan asks ${quota} lessons → one exam does not silence today`, s.today > 0, JSON.stringify(s));
for (let n = 2; n <= quota; n++) await p.evaluate(`import('./js/progress.js').then(m => m.recordExam(${n}, { kind: 'exam', passed: true, score: 100 }))`);
await p.evaluate(`import('./js/notify.js').then(m => m.replan())`);
await p.sleep(400);
s = await p.evaluate(todayCount);
check(`quota met (${quota} exams) → no more notifications today, future days kept`, s.today === 0 && s.n >= 60, JSON.stringify(s));
// reminders off (settings.notify=false; the switch left the settings screen in 1.4 — always-on by default)
await p.evaluate(`import('./js/store.js').then(m => { m.store.state.settings.notify = false; m.store.save(); })`);
await p.evaluate(`import('./js/notify.js').then(m => m.replan())`);
await p.sleep(600);
s = await p.evaluate(`({ n: window.__ln.pending.size })`);
check('notify off → all cancelled', s.n === 0, JSON.stringify(s));
const errs = p.errors.filter(e => !/githubusercontent|vibrate|games\//.test(e));
check('zero console errors', errs.length === 0, errs.join(' | ').slice(0, 400));
await p.close();
console.log(results.join('\n'));
