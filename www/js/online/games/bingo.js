// online/games/bingo.js — بنجو الأرقام: كل واحد عنده كارت أرقام مختلف. صاحب الغرفة بينادي رقم كل كام
// ثانية بصوت ألماني، وانتوا تعلّموا على كارتكم. أول واحد يكمّل صف (أفقي/رأسي/قطري) يكسب.
import { buildBingo } from '../qgen.js';

const COLS = 3, N = 9, CALL_MS = 3200;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export const meta = { id: 'bingo', title: 'بنجو الأرقام', icon: '🔢' };

export function start(vs) {
  let card = null, calls = null, word = n => String(n), guestCard = null;
  const called = new Set(), marks = new Set();
  let callT = null, callIdx = 0, over = false, won = false;

  vs.on('setup', d => { if (!card) { card = d.card; render(); } });
  vs.on('call', d => announce(d.n));
  vs.on('claim', () => { if (vs.isHost && !won) winner('guest'); });     // المضيف بيحكم
  vs.on('win', d => finish(d.who));
  // بعد رجوع الاتصال: الضيف بيلحق أي أرقام اتنادت وهو مقطوع
  vs.on('synccalls', d => { (d.nums || []).forEach(n => called.add(n)); refreshCallable(); });
  // المضيف يعيد إرسال الكارت + كل الأرقام اللي اتنادت
  vs.onResync(() => { if (vs.isHost) { if (guestCard) vs.send('setup', { card: guestCard }); vs.send('synccalls', { nums: [...called] }); } });

  if (vs.isHost) {
    const b = buildBingo(vs.pool, N);
    card = b.hostCard; calls = b.calls; word = b.word; guestCard = b.guestCard;
    vs.send('setup', { card: b.guestCard });
    render();
    // النداء
    callT = vs.every(CALL_MS, () => {
      if (over) return;
      if (callIdx >= calls.length) { endByMarks(); return; }
      const n = calls[callIdx++];
      vs.send('call', { n });
      announce(n);
    });
  } else {
    vs.stage.innerHTML = '<div class="vs-q"><p class="vs-wait">بنبدأ…</p></div>';
  }

  function announce(n) {
    called.add(n);
    const call = vs.root.querySelector('.vs-call');
    if (call) call.innerHTML = `<bdi class="de">${word(n)}</bdi><div class="muted" dir="ltr" style="font-size:20px">${n}</div>`;
    vs.say(String(word(n)));
    refreshCallable();
  }

  function refreshCallable() {
    if (!card) return;
    vs.stage.querySelectorAll('.vs-bingo-cell').forEach((c, k) => c.classList.toggle('callable', called.has(card[k]) && !marks.has(k)));
  }

  function render() {
    if (!card) { vs.stage.innerHTML = '<div class="vs-q"><p class="vs-wait">بنبدأ…</p></div>'; return; }
    vs.stage.innerHTML = '';
    const box = vs.el(`<div class="vs-bingo">
      <div class="vs-call muted">${vs.isHost ? 'بننادي الأرقام…' : 'استنى النداء…'}</div>
      <div class="vs-bingo-grid" style="grid-template-columns:repeat(${COLS},1fr)"></div>
      <p class="hint center">دوس على الرقم اللي اتنادى. اكمل صف وتكسب!</p></div>`);
    const grid = box.querySelector('.vs-bingo-grid');
    card.forEach((n, k) => {
      const c = vs.el(`<button type="button" class="vs-bingo-cell${marks.has(k) ? ' on' : ''}" data-k="${k}"><bdi class="de">${n}</bdi></button>`);
      c.addEventListener('click', () => mark(k, c));
      grid.appendChild(c);
    });
    vs.stage.appendChild(box);
  }

  function mark(k, c) {
    if (over || marks.has(k)) return;
    if (!called.has(card[k])) { c.classList.remove('miss'); void c.offsetWidth; c.classList.add('miss'); return; }
    marks.add(k); c.classList.add('on'); c.classList.remove('callable');
    if (hasLine()) claim();
  }
  const hasLine = () => LINES.some(l => l.every(i => marks.has(i)));

  function claim() {
    if (won) return;
    if (vs.isHost) winner('host');
    else vs.send('claim', {});
  }

  function winner(who) {
    if (won) return; won = true; over = true;
    if (callT) vs.clear(callT);
    vs.send('win', { who });
    finish(who);
  }

  function endByMarks() {
    if (won) return; over = true;
    // مفيش بنجو → الأكتر تعليمات يكسب (المضيف بيحكم). نبعت عدد علاماتنا للطرف التاني؟ بنكتفي بالمضيف.
    winner(marks.size >= N / 2 ? 'host' : 'tie');
  }

  function finish(who) {
    over = true; if (callT) vs.clear(callT);
    const win = who === 'tie' ? null : (who === 'host') === vs.isHost;
    vs.end({ win });
  }

  if (!vs.isHost) render();
}
