// native.js — غلاف Capacitor: الموديول الوحيد اللي يلمس window.Capacitor
// في المتصفح العادي window.Capacitor مش موجود → كل الدوال بترجّع null/false من غير ما ترمي خطأ
const cap = () => (typeof window !== 'undefined' && window.Capacitor) || null;

// هل إحنا جوه أبلكيشن الأندرويد؟
export function isNative() {
  try {
    const c = cap();
    return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
  } catch (e) { return false; }
}

// plugin('Filesystem') | plugin('FileTransfer') | plugin('Share') | plugin('SystemBars') → object | null
export function plugin(name) {
  try {
    const c = cap();
    return (c && c.Plugins && c.Plugins[name]) || null;
  } catch (e) { return null; }
}

// file:// uri → رابط يقدر الـ WebView يحمّله (https://localhost/_capacitor_file_/…)
export function fileSrc(uri) {
  try {
    const c = cap();
    if (c && typeof c.convertFileSrc === 'function') return c.convertFileSrc(uri);
  } catch (e) { /* fall through */ }
  return uri;
}

// فتح رابط خارجي: في الأبلكيشن Capacitor بيحوّل _system للمتصفح، في الويب تاب جديد
export function openExternal(url) {
  if (!url) return false;
  try {
    if (isNative()) window.open(url, '_system');
    else window.open(url, '_blank', 'noopener');
    return true;
  } catch (e) {
    console.warn('[native] openExternal failed:', e);
    return false;
  }
}

async function shareVia(opts, webOpts) {
  const Share = plugin('Share');
  if (Share && typeof Share.share === 'function') {
    try { await Share.share(opts); return true; }
    catch (e) {
      if (e && /cancel/i.test(String(e.message || e))) return false;   // المستخدم قفل نافذة المشاركة
      console.warn('[native] Share.share failed:', e);
    }
  }
  try {
    if (navigator.share && webOpts) { await navigator.share(webOpts); return true; }
  } catch (e) {
    if (!(e && e.name === 'AbortError')) console.warn('[native] navigator.share failed:', e);
  }
  return false;
}

// مشاركة نص — true لو اتبعت، false لو مفيش مشاركة متاحة أو المستخدم لغى
export function shareText(title, text) {
  return shareVia({ title, text, dialogTitle: title }, { title, text });
}

// مشاركة ملف بالـ uri بتاعه (file://…) — في الويب مفيش بديل فبنرجّع false
export function shareFile(title, fileUri) {
  if (!fileUri) return Promise.resolve(false);
  return shareVia({ title, files: [fileUri], dialogTitle: title }, null);
}
