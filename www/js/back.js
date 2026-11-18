// back.js — زرار الرجوع بتاع أندرويد: يرجع خطوة جوه التطبيق بدل ما يقفله (Capacitor App plugin «backButton»).
// الترتيب: فيديو بملء الشاشة يقفل ← نافذة مفتوحة تتقفل ← جلسة/لعبة/امتحان شغّال = نفس زرار ✕ بتاعه (بيسأل قبل ما يخرج)
// ← صفحة تانية = خطوة لورا (لصفحة «هادية»: الدرس/الألعاب/المراجع، مش لجلسة خلصت) ← الرئيسية = التطبيق يروح للخلفية.
import { plugin, isNative } from './native.js';

const ACTIVITY = /^#\/(session|game|exam|drill|match|vs)(\/|\?|$)/;
const HOME = /^#\/(home)?(\?|$)/;
const calm = [];                          // آخر الصفحات الهادية اللي اتفتحت (مش جلسة/لعبة/امتحان)
const route = () => location.hash || '#/home';

function remember() {
  const h = route();
  if (ACTIVITY.test(h)) return;
  // صفحة موجودة قبل كده في التاريخ (رجعت لها بالرجوع أو بزرار «→ …») → اللي بعدها يتشال، فالرجوع الجاي يكمّل لورا صح
  const i = calm.lastIndexOf(h);
  if (i >= 0) calm.length = i + 1; else calm.push(h);
  if (calm.length > 40) calm.shift();
}

// الصفحة «الأب» لو مفيش تاريخ (فتحت من تذكير مثلاً)
export function parentOf(h) {
  let m;
  if ((m = h.match(/^#\/video\/(\d+)/))) return `#/lesson/${m[1]}`;
  if ((m = h.match(/^#\/(exam|drill)\/(\d+)/))) return `#/lesson/${m[2]}`;
  if ((m = h.match(/^#\/session\?(?:.*&)?lesson=(\d+)/))) return `#/lesson/${m[1]}`;
  if (/^#\/lesson\//.test(h)) return '#/lessons';
  if (/^#\/ref\/topic[/?]/.test(h)) return '#/ref/topics';
  if (/^#\/ref\/./.test(h)) return '#/ref';
  if (/^#\/lib\//.test(h)) return '#/library';
  if (/^#\/read\/./.test(h)) return '#/read';
  if (/^#\/(game|match)\b/.test(h)) return '#/games';
  return '#/home';
}

// الصفحة اللي الرجوع يودّي عليها من الصفحة الحالية
export function backTarget(h = route()) {
  if (ACTIVITY.test(h)) {                  // من جلسة/لعبة/امتحان → الصفحة الهادية اللي كنت فيها قبلها
    for (let i = calm.length - 1; i >= 0; i--) if (calm[i] !== h) return calm[i];
    return parentOf(h);
  }
  for (let i = calm.length - 2; i >= 0; i--) {          // صفحة عادية → اللي قبلها (لو هي «أبوها» أو أقرب)
    if (calm[i] !== h) return calm[i] === parentOf(h) || HOME.test(calm[i]) ? calm[i] : parentOf(h);
  }
  return parentOf(h);
}

// بيرجّع إيه اللي حصل (للاختبارات): 'fullscreen' | 'modal' | 'local' | 'activity' | 'nav' | 'exit'
export function handleBack(exit = () => {}) {
  try {
    if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen(); return 'fullscreen'; }
    const modal = document.querySelector('.ss-modal');
    if (modal) {
      const stay = modal.querySelector('[data-act=cancelExit]');
      if (stay) stay.click(); else modal.remove();
      return 'modal';
    }
    // صفحة جواها خطوات (قطعة القراءة: الكلمات ← القطعة ← فهمك) بترجع خطوة جوّاها لو عملت preventDefault
    if (!window.dispatchEvent(new CustomEvent('app-back', { cancelable: true }))) return 'local';
    const h = route();
    if (ACTIVITY.test(h)) {
      // اللعبة/الجلسة لسه شغّالة → زرار ✕ بتاعها (بيسأل «تخرج؟» لو فيه إجابات)
      const x = [...document.querySelectorAll('#view .ss-close[data-act=close], #view .gm-close, #view .vs-close')].find(b => b.offsetParent);
      if (x) { x.click(); return 'activity'; }
    }
    // امتحان من المكتبة (iframe): شيل الـ iframe مش بيبعت beforeunload، فنسأل صفحة الامتحان نفسها قبل ما نمشي
    const frame = /^#\/lib\//.test(h) && document.querySelector('#view iframe');
    const fw = frame && frame.contentWindow;
    if (fw) {
      try {
        const dlg = fw.document.querySelector('dialog[open]');
        if (dlg) { dlg.close(); return 'modal'; }                     // «تسليم الامتحان» مفتوحة → تتقفل بس
        const ev = new fw.Event('beforeunload', { cancelable: true });
        fw.dispatchEvent(ev);
        if ((ev.defaultPrevented || ev.returnValue === false || (typeof ev.returnValue === 'string' && ev.returnValue))
          && !window.confirm('تخرج من الامتحان؟ الإجابات اللي حلّيتها هتضيع.')) return 'local';
      } catch (e) { /* الصفحة لسه بتحمّل أو PDF → رجوع عادي */ }
    }
    if (HOME.test(h)) { exit(); return 'exit'; }
    location.hash = backTarget(h);
    return 'nav';
  } catch (e) {
    console.warn('[back] failed', e);
    location.hash = '#/home';
    return 'nav';
  }
}

export function initBackButton() {
  remember();
  window.addEventListener('hashchange', remember);
  const App = plugin('App');
  if (!isNative() || !App || typeof App.addListener !== 'function') return false;
  // من غير listener أندرويد بيقفل التطبيق على طول (الشكوى)؛ مع listener إحنا اللي بنقرر
  App.addListener('backButton', () => handleBack(() => {
    try { (App.minimizeApp || App.exitApp).call(App); } catch (e) { /* ignore */ }
  }));
  return true;
}
