// notify.js — 🔔 التذكير كل ساعة لو مهمة النهارده لسه ما خلصتش
// مفيش كود بيشتغل في الخلفية: كل ما الأبلكيشن يتفتح أو يتقفل بنلغي التذكيرات القديمة ونجدول الجديدة
// (النهارده لو المهمة لسه + الأيام الجاية). أي تذكير بيتشال أول ما المهمة تخلص.
import { isNative, plugin } from './native.js';
import { store } from './store.js';
import { lessonOf } from './data.js';
import { mission, allPassed } from './mastery.js';

const ID_BASE = 7000;          // تذكيراتنا 7000..7999
const DAYS_AHEAD = 7;
const CHANNEL = 'study';
let busy = false, again = false, listening = false;

const clampHour = h => Math.min(23, Math.max(0, Math.round(+h || 0)));
export function notifyCfg() {
  const s = (store.state.settings ||= {});
  const start = clampHour(s.notifyStart ?? 10);
  const end = Math.max(start, clampHour(s.notifyEnd ?? 22));
  return { on: s.notify !== false, start, end };
}
export const notifySupported = () => isNative() && !!plugin('LocalNotifications');

// 'granted' | 'denied' | 'prompt' | 'unsupported'
export async function notifyPermission() {
  if (!notifySupported()) return 'unsupported';
  try {
    const p = await plugin('LocalNotifications').checkPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
  } catch (e) { return 'unsupported'; }
}
export async function requestNotifyPermission({ enable = true } = {}) {
  if (!notifySupported()) return false;
  try {
    const p = await plugin('LocalNotifications').requestPermissions();
    const ok = p.display === 'granted';
    if (ok && enable) { (store.state.settings ||= {}).notify = true; store.save(); }
    if (ok) replan();
    return ok;
  } catch (e) { console.warn('[notify] permission request failed', e); return false; }
}

// ---------- نص التذكير ----------
function pick(list, seed) { return list[Math.abs(seed) % list.length]; }
function messageFor(dayOffset, hour, m) {
  const st = store.state;
  const streak = (st.streak && st.streak.current) | 0;
  const n = m.lesson;
  const l = lessonOf(n);
  const lt = l ? `الدرس ${n} (\u2068${l.title}\u2069)` : `الدرس ${n}`;     // FSI…PDI: «Hallo!» ما تتقلبش «!Hallo»
  const seed = dayOffset * 31 + hour;
  if (dayOffset === 0) {
    const list = [];
    if (m.review) {
      // كل الدروس خلصت: المهمة = المراجعة المستحقة + ١٠ إجابات — الرسالة على قد اللي فاضل فعلًا
      if (m.due > 0) list.push([`🧠 ${m.due} كلمة مستنية المراجعة`, 'المراجعة في وقتها هي اللي بتخلّي الكلام ثابت — ٥ دقايق بس.']);
      if (m.answers < m.goal) list.push(['🎮 لعبة صغيرة؟', `فاضلك ${m.goal - m.answers} إجابة على مهمة النهارده.`]);
      else if (m.due > 0) list.push(['🧠 فاضل المراجعة بس', `راجع الـ ${m.due} كلمة المستحقة وتخلص مهمة النهارده.`]);
      if (streak > 0) list.push([`🔥 الستريك ${streak} يوم`, 'حافظ عليه — مراجعة سريعة وخلاص.']);
      list.push(['🇩🇪 الدروس خلصت — دلوقتي التثبيت', '٥ دقايق مراجعة أو لعبة بيخلّوا الكلام ما يتنسيش.']);
      return pick(list, seed);
    }
    if (m.mode === 'goal') list.push(['🎯 هدف النهارده لسه', `فاضلك ${Math.max(0, m.goal - m.answers)} إجابة وتخلص — يلا ٥ دقايق!`]);
    // درس نجح خلاص ومستني التاج (بعد الـ15 امتحان) ما نقولش عليه «لسه ما خلصتش»
    else if (m.step) list.push([m.status && m.status.passed ? `👑 تاج ${lt} مستنيك` : `📚 لسه ما خلصتش ${lt}`, `${m.step.icon} ${m.step.label} — ${m.step.hint}. يلا ١٠ دقايق بس!`]);
    if (m.step && m.step.key === 'exam') list.push(['🏁 الوحش مستنيك!', `امتحان الدرس ${n} جاهز — ورّيه مين البطل.`]);
    if (streak > 0) list.push([`🔥 الستريك ${streak} يوم`, 'متضيّعهوش! خش خلّص مهمة النهارده.']);
    if (m.due > 0) list.push([`🧠 ${m.due} كلمة مستنية المراجعة`, 'المراجعة دلوقتي أسهل بكتير من بكره.']);
    list.push(['🎮 دماغك محتاجة لعبة', `العب «اسمع واكتب» ٣ دقايق على ${lt}.`]);
    if (!(m.status && m.status.passed)) list.push(['👀 صاحبك ممكن يكون سبقك', 'خش ذاكر وشوف مين هيخلّص الدرس الأول.']);
    return pick(list, seed);
  }
  if (allPassed()) return pick([
    ['🧠 وقت المراجعة', 'الكلمات المستحقة النهارده + لعبة صغيرة — وتخلص.'],
    ['🔥 حافظ على الستريك', 'يوم من غير مذاكرة بيصفّر الستريك — متسيبوش.'],
    ['🎮 لعبة ٣ دقايق؟', 'العب على «اللي ذاكرته» — ده اللي بيثبّت الـ١٥ درس.'],
    ['🇩🇪 خطوة لألمانيا', 'المراجعة كل يوم هي اللي بتخلّي الكلام ثابت. يلا!'],
  ], seed);
  return pick([
    ['📚 وقت الألماني!', 'خش خلّص درس النهارده — شوية كلمات وجملتين ولعبة.'],
    ['🔥 حافظ على الستريك', 'يوم من غير مذاكرة بيصفّر الستريك — متسيبوش.'],
    ['🎧 ٥ دقايق بس', 'اسمع واكتب كام كلمة — ابدأ وهتكمّل لوحدك.'],
    ['🏁 قرّب من الامتحان', 'كل نجمة بتقرّبك إن الدرس يبقى خلصان ✓'],
    ['🇩🇪 خطوة لألمانيا', 'كل درس بتخلّصه بيقرّبك من الهدف. يلا!'],
  ], seed);
}

function buildSchedule() {
  const c = notifyCfg();
  const m = mission();
  const now = Date.now();
  const base = new Date();
  // الأبلكيشن مفتوح قدامه: التذكير اللي جاي في خلال ساعة ما يطلعش فوق الامتحان/الجلسة (أول ما يخرج بنجدول تاني)
  const quiet = (typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60 : 5) * 60 * 1000;
  const list = [];
  for (let d = 0; d < DAYS_AHEAD; d++) {
    if (d === 0 && m.done) continue;
    for (let h = c.start; h <= c.end; h++) {
      const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d, h, 0, 0, 0);
      if (at.getTime() <= now + quiet) continue;
      const [title, body] = messageFor(d, h, m);
      list.push({
        id: ID_BASE + d * 24 + h,
        title, body,
        schedule: { at, allowWhileIdle: true },
        channelId: CHANNEL,
        smallIcon: 'ic_stat_w',
        iconColor: '#2a78d6',
        autoCancel: true,
        isExactNotification: false,
        group: 'study',
        extra: { route: '#/home' },
      });
    }
  }
  return list;
}

async function ensureSetup(LN) {
  try { await LN.createChannel({ id: CHANNEL, name: 'تذكير المذاكرة', description: 'تذكير كل ساعة لو مهمة النهارده لسه', importance: 4, visibility: 1, vibration: true }); }
  catch (e) { /* القناة موجودة أو أندرويد قديم */ }
  if (!listening) {
    listening = true;
    try {
      LN.addListener('localNotificationActionPerformed', ev => {
        const r = ev && ev.notification && ev.notification.extra && ev.notification.extra.route;
        if (!r || typeof r !== 'string' || !r.startsWith('#/')) return;
        // في نص امتحان / جلسة / لعبة (body.immersive) → ما نقطعهوش، يكمّل اللي كان فيه
        if (document.body.classList.contains('immersive')) return;
        // نفس الصفحة (الرئيسية متسابة من امبارح) → نرسمها من جديد بدل ما الضغطة تضيع
        if (location.hash === r) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else location.hash = r;
      });
    } catch (e) { /* ignore */ }
  }
}

// لما الأبلكيشن يتفتح: نشيل التذكيرات اللي اتعرضت خلاص من الإشعارات (ما تتراكمش)
export async function clearShown() {
  if (!notifySupported()) return;
  const LN = plugin('LocalNotifications');
  try { if (typeof LN.removeAllDeliveredNotifications === 'function') await LN.removeAllDeliveredNotifications(); }
  catch (e) { /* مش مهم */ }
}

// يلغي تذكيراتنا ويجدول من جديد حسب حالة النهارده
export async function replan() {
  if (!notifySupported()) return { scheduled: 0, reason: 'unsupported' };
  if (busy) { again = true; return { scheduled: 0, reason: 'busy' }; }
  busy = true;
  let scheduled = 0, reason = 'ok';
  try {
    const LN = plugin('LocalNotifications');
    const pend = await LN.getPending().catch(() => ({ notifications: [] }));
    const ours = (pend.notifications || []).filter(x => x.id >= ID_BASE && x.id < ID_BASE + 999).map(x => ({ id: x.id }));
    if (ours.length) await LN.cancel({ notifications: ours });
    const c = notifyCfg();
    if (!c.on) reason = 'off';
    else if ((await notifyPermission()) !== 'granted') reason = 'no-permission';
    else {
      await ensureSetup(LN);
      const list = buildSchedule();
      if (list.length) await LN.schedule({ notifications: list });
      scheduled = list.length;
    }
  } catch (e) {
    console.warn('[notify] replan failed:', e && e.message || e);
    reason = 'error';
  } finally {
    busy = false;
    if (again) { again = false; setTimeout(replan, 50); }
  }
  return { scheduled, reason };
}

// تذكير تجريبي بعد ٥ ثواني (من الإعدادات)
export async function testNotification() {
  if (!notifySupported()) return false;
  if ((await notifyPermission()) !== 'granted' && !(await requestNotifyPermission({ enable: false }))) return false;
  try {
    const LN = plugin('LocalNotifications');
    await ensureSetup(LN);
    await LN.schedule({ notifications: [{ id: ID_BASE + 999, title: '🔔 التذكير شغّال', body: 'كده هتوصلك رسالة كل ساعة لو مهمة النهارده لسه ما خلصتش.', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: CHANNEL, smallIcon: 'ic_stat_w', iconColor: '#2a78d6', autoCancel: true, isExactNotification: false }] });
    return true;
  } catch (e) { console.warn('[notify] test failed', e); return false; }
}
