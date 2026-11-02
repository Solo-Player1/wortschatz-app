// audio.js — تشغيل صوت DW (عنصر Audio واحد مشترك، عمره ما بيرمي خطأ)
import { audioUrl } from './data.js';
import { store } from './store.js';

let audioEl = null;
let active = null;          // { resolve, cleanup } للتشغيل الجاري
const WATCHDOG_MS = 15000;  // لو الملف علّق مش بنستنى للأبد

function getEl() {
  if (audioEl) return audioEl;
  if (typeof Audio === 'undefined') return null;   // في node مفيش Audio
  try {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  } catch (e) { audioEl = null; }
  return audioEl;
}

const toUrl = x => (typeof x === 'string' ? x : audioUrl(x));

// يوقف الصوت الحالي ويحلّ وعده (بـ false)
export function stop() {
  const cur = active;
  active = null;
  if (cur) { cur.cleanup(); cur.resolve(false); }
  if (audioEl) { try { audioEl.pause(); } catch (e) { /* مش مهم */ } }
}

// يشغّل كلمة أو رابط؛ بيرجع Promise بتتحل لما الصوت يخلص (true) أو يفشل/يتوقف (false)
export function play(wordOrUrl) {
  const url = toUrl(wordOrUrl);
  const a = getEl();
  if (!url || !a) return Promise.resolve(false);
  stop();
  return new Promise(resolve => {
    let timer = null;
    const cleanup = () => {
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
      if (timer) { clearTimeout(timer); timer = null; }
    };
    const done = ok => {
      if (active && active.resolve === resolve) active = null;
      cleanup();
      resolve(ok);
    };
    const onEnded = () => done(true);
    const onError = () => done(false);
    active = { resolve, cleanup };
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);
    timer = setTimeout(() => done(false), WATCHDOG_MS);
    try {
      a.src = url;
      a.currentTime = 0;
    } catch (e) { /* بنكمّل وبنسيب play يقرّر */ }
    let p;
    try { p = a.play(); } catch (e) { done(false); return; }
    // سياسة autoplay في المتصفح ممكن ترفض → نسكت
    if (p && typeof p.catch === 'function') p.catch(err => { console.warn('[audio] play rejected:', err && err.name); done(false); });
  });
}

// يشغّل بس لو الإعداد autoplay مفتوح
export function autoplay(wordOrUrl) {
  const settings = (store.state && store.state.settings) || {};
  if (settings.autoplay === false) return Promise.resolve(false);
  return play(wordOrUrl);
}

export const isPlaying = () => !!active;

// تسخين الكاش لملفات الجلسة (اختياري، بيتجاهل أي خطأ)
export function preload(words, max = 40) {
  if (typeof fetch !== 'function' || !Array.isArray(words)) return;
  const urls = words.map(toUrl).filter(Boolean).slice(0, max);
  const warm = u => {
    try { return fetch(u, { cache: 'force-cache' }).then(r => r.blob()).catch(() => null); }
    catch (e) { return Promise.resolve(null); }
  };
  let chain = Promise.resolve();
  for (const u of urls) chain = chain.then(() => warm(u));
  chain.catch(() => null);
}
