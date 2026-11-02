// tts.js — نطق الجمل والأرقام والحروف بصوت ألماني
// في الأبلكيشن: plugin «Tts» المحلي (محرّك الكلام بتاع أندرويد). في المتصفح: speechSynthesis. لو مفيش → بيرجّع false
import { plugin } from './native.js';

const WATCHDOG_MS = 12000;
let webVoice;          // undefined = لسه ما دوّرناش، null = مفيش صوت ألماني

function pickWebVoice() {
  if (webVoice !== undefined) return webVoice;
  try {
    const vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (!vs.length) return null;           // الأصوات بتتحمّل بعدين — نجرّب المرة الجاية
    webVoice = vs.find(v => /^de(-|_|$)/i.test(v.lang) && /google|natural|online/i.test(v.name))
      || vs.find(v => /^de(-|_|$)/i.test(v.lang)) || null;
  } catch (e) { webVoice = null; }
  return webVoice;
}
try { if (window.speechSynthesis) window.speechSynthesis.addEventListener('voiceschanged', () => { webVoice = undefined; pickWebVoice(); }); } catch (e) { /* ignore */ }

export function stopSpeak() {
  const T = plugin('Tts');
  if (T && T.stop) T.stop().catch(() => {});
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}

// بيرجّع Promise<boolean> — true لو اتنطق
export async function speak(text, { rate = 0.9 } = {}) {
  text = String(text || '').trim();
  if (!text) return false;
  const T = plugin('Tts');
  if (T && typeof T.speak === 'function') {
    try { await T.speak({ text, lang: 'de-DE', rate }); return true; }
    catch (e) { console.warn('[tts] native speak failed:', e && e.message || e); }
  }
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;
  return new Promise(resolve => {
    let done = false;
    const finish = ok => { if (!done) { done = true; clearTimeout(timer); resolve(ok); } };
    const timer = setTimeout(() => finish(false), WATCHDOG_MS);
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.rate = rate;
      const v = pickWebVoice();
      if (v) u.voice = v;
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      window.speechSynthesis.speak(u);
    } catch (e) { finish(false); }
  });
}

// حالة الصوت: { engine: 'native'|'web'|'none', german: true|false|null }
export async function ttsStatus() {
  const T = plugin('Tts');
  if (T && typeof T.status === 'function') {
    try { const s = await T.status({ lang: 'de-DE' }); return { engine: 'native', german: !!s.available, engineName: s.engine || '' }; }
    catch (e) { return { engine: 'native', german: null }; }
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) return { engine: 'web', german: !!pickWebVoice() };
  return { engine: 'none', german: false };
}

// يفتح شاشة تنزيل الصوت الألماني في أندرويد
export async function installGermanVoice() {
  const T = plugin('Tts');
  if (T && typeof T.install === 'function') { try { await T.install(); return true; } catch (e) { return false; } }
  return false;
}
