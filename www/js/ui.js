// أدوات صغيرة للواجهة
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// نص عربي جواه كلام ألماني: كل جملة ألماني بتتحط في <bdi> عشان علامة الاستفهام والترتيب ما يتلخبطوش
const LATIN_RUN = /[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9'’\-\/]*(?:[ ,.:;!?…]+[A-Za-zÄÖÜäöüß0-9'’\-\/]+)*[.!?…]*/g;
export function mixHtml(s) {
  s = String(s ?? '');
  let out = '', last = 0;
  for (const m of s.matchAll(LATIN_RUN)) {
    out += esc(s.slice(last, m.index)) + `<bdi class="de">${esc(m[0])}</bdi>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

let toastTimer = null;
export function toast(msg, ms = 1800) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 250); }, ms);
}

const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let currentPref = 'system';
export function applyTheme(pref = 'system') {
  currentPref = pref;
  const dark = pref === 'dark' || (pref === 'system' && mq && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#0f1419' : '#14315e';
}
if (mq) { try { mq.addEventListener('change', () => { if (currentPref === 'system') applyTheme('system'); }); } catch (e) {} }

export const articleClass = art => ({ der: 'art-der', die: 'art-die', das: 'art-das' })[art] || '';

// الكلمة الألمانية بأداتها الملوّنة
export function deHtml(w, { big = false } = {}) {
  if (!w) return '';
  const cls = big ? 'de de-big' : 'de';
  if (w.k === 'noun' && w.sg)
    return `<bdi class="${cls}"><span class="art ${articleClass(w.art)}">${esc(w.art)}</span> ${esc(w.sg)}</bdi>`;
  const text = (w.de || '').replace(/^\((etwas|jemanden|jemandem)\)\s*/, '');
  return `<bdi class="${cls}">${esc(text)}</bdi>`;
}

export function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
export const sample = (a, n) => shuffle(a).slice(0, n);

export function nWords(n) {
  n = +n || 0;
  if (n === 0) return 'ولا كلمة';
  if (n === 1) return 'كلمة واحدة';
  if (n === 2) return 'كلمتين';
  if (n <= 10) return `${n} كلمات`;
  return `${n} كلمة`;
}

export function vibrate(ms = 30) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

export function ring(pct, size = 96, label = '') {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `<div class="ring" style="--p:${p};--size:${size}px"><b>${label || p + '%'}</b></div>`;
}

export function confetti(root = document.body) {
  const box = el('<div class="confetti" aria-hidden="true"></div>');
  const colors = ['#2a78d6', '#dd0000', '#ffce00', '#0ca30c', '#ffffff'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * .4}s;animation-duration:${1.4 + Math.random()}s;transform:rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
  root.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}
