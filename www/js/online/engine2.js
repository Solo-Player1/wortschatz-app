// online/engine2.js — السياق المشترك لألعاب «العب مع صاحبك»: شريط فوق فيه اسمك واسم صاحبك والنقط وحالة
// الاتصال، منطقة اللعب، فيدباك، شاشة النتيجة بزرار «ماتش تاني»، وأوفرلاي «صاحبك خرج». كل لعبة بتستخدم
// net عشان تبعت وتستقبل، والبيانات بتتبني هنا على التليفون.
import { el, esc, toast, confetti, mixHtml } from '../ui.js';
import { injectCss, sfx, checkTyped, expectedFor, wordHtml } from '../games/engine.js';
import { normDe, shuffle } from '../exercises.js';
import { play as playWord, stop as stopWord } from '../audio.js';
import { speak, stopSpeak } from '../tts.js';
import { DATA, displayDe } from '../data.js';
import { store } from '../store.js';

const UMLAUTS = ['ä', 'ö', 'ü', 'ß'];

export function makeVs(root, { meta, net, isHost, meName, peerName, pool, onExit }) {
  injectCss('vs', CSS);
  document.body.classList.add('immersive');
  root.innerHTML = '';
  const st = { me: 0, peer: 0, over: false, round: 0 };
  const cleanups = [], timers = new Set();

  const wrap = el(`<div class="vs-wrap" data-game="${esc(meta.id)}">
    <div class="vs-top">
      <button type="button" class="btn btn-icon vs-close" aria-label="خروج">✕</button>
      <div class="vs-score vs-me"><b class="n">0</b><small>${esc(meName || 'أنا')}</small></div>
      <div class="vs-mid"><span class="vs-ico" aria-hidden="true">${meta.icon || '⚔️'}</span><span class="vs-dot" title="الاتصال"></span></div>
      <div class="vs-score vs-peer"><b class="n">0</b><small>${esc(peerName || 'صاحبي')}</small></div>
    </div>
    <div class="vs-bar" hidden><i style="width:0%"></i></div>
    <div class="vs-stage"></div>
    <div class="vs-fb" role="status" aria-live="polite"></div>
  </div>`);
  root.appendChild(wrap);
  const $ = s => wrap.querySelector(s);
  const stage = $('.vs-stage'), fbEl = $('.vs-fb'), dot = $('.vs-dot');
  const meEl = $('.vs-me .n'), peerEl = $('.vs-peer .n'), barEl = $('.vs-bar');

  const setStatus = s => { dot.dataset.s = s; };
  setStatus(net.ready ? 'online' : 'connecting');

  const vs = {
    meta, net, isHost, stage, root, pool,
    meName: meName || 'أنا', peerName: peerName || 'صاحبي',
    el, esc, toast, shuffle, wordHtml, checkTyped, expectedFor, sfx, mixHtml, DATA, normDe,
    get score() { return { me: st.me, peer: st.peer }; },
    get over() { return st.over; },

    // ---------- اتصال اللعبة ----------
    send(k, extra) { net.send({ k, ...extra }); },
    on(k, fn) { const off = net.on('game', d => { if (d && d.k === k) fn(d); }); cleanups.push(off); return off; },

    // ---------- نقط ----------
    setScores(me, peer) { st.me = me; st.peer = peer; meEl.textContent = me; peerEl.textContent = peer; },
    addMe(n = 1) { vs.setScores(st.me + n, st.peer); },
    addPeer(n = 1) { vs.setScores(st.me, st.peer + n); },

    // ---------- شريط تقدّم / تايمر ----------
    progress(done, total) { barEl.hidden = false; barEl.classList.remove('vs-timer'); barEl.firstElementChild.style.width = `${total ? Math.round(100 * done / total) : 0}%`; },
    timer(seconds, onEnd) {
      barEl.hidden = false; barEl.classList.add('vs-timer');
      const fill = barEl.firstElementChild; const ms = seconds * 1000; const start = performance.now();
      fill.style.transition = 'none'; fill.style.width = '100%'; void fill.offsetWidth; fill.style.transition = '';
      let stopped = false;
      const t = vs.every(100, () => { if (stopped) return; const left = Math.max(0, 1 - (performance.now() - start) / ms); fill.style.width = `${Math.round(left * 100)}%`; barEl.classList.toggle('low', left < 0.3); if (left <= 0) { stopped = true; vs.clear(t); onEnd && onEnd(); } });
      return { stop() { stopped = true; vs.clear(t); } };
    },

    // ---------- أدوات ----------
    after(ms, fn) { const t = setTimeout(() => { timers.delete(t); if (!st.over) fn(); }, ms); timers.add(t); return t; },
    every(ms, fn) { const t = setInterval(() => { if (!st.over) fn(); }, ms); timers.add(t); return t; },
    clear(t) { clearTimeout(t); clearInterval(t); timers.delete(t); },
    onCleanup(fn) { cleanups.push(fn); },
    say(x) { if (!x) return Promise.resolve(false); if (typeof x === 'object' && x.file) { stopSpeak(); return playWord(x); } stopWord(); return speak(typeof x === 'object' ? displayDe(x) : x); },
    stopAudio() { stopWord(); stopSpeak(); },

    // ---------- سؤال اختيار ----------
    choice({ promptHtml, options, audioWord, cols = 2, onPick }) {
      stage.innerHTML = '';
      const q = el(`<div class="vs-q">${audioWord ? '<button type="button" class="gm-speaker sm vs-say" aria-label="اسمع">🔊</button>' : ''}<div class="gm-prompt">${promptHtml || ''}</div>
        <div class="gm-choices cols-${cols}">${options.map((o, i) => `<button type="button" class="gm-choice" data-i="${i}">${o.html}</button>`).join('')}</div>
        <p class="vs-wait" hidden></p></div>`);
      stage.appendChild(q);
      if (audioWord) { const s = q.querySelector('.vs-say'); s.addEventListener('click', () => vs.say(audioWord)); vs.after(250, () => vs.say(audioWord)); }
      let locked = false;
      q.addEventListener('click', e => {
        const b = e.target.closest('.gm-choice'); if (!b || locked) return; locked = true;
        const i = +b.dataset.i;
        q.querySelectorAll('.gm-choice').forEach((x, k) => { x.disabled = true; if (options[k].correct) x.classList.add('right'); });
        if (!options[i].correct) b.classList.add('wrong');
        onPick(options[i].correct, i, q);
      });
      return q;
    },

    // ---------- سؤال كتابة ----------
    type({ promptHtml, audioWord, accept, show, onSubmit }) {
      stage.innerHTML = '';
      const q = el(`<div class="vs-q">${audioWord ? '<button type="button" class="gm-speaker vs-say" aria-label="اسمع تاني">🔊</button>' : ''}<div class="gm-prompt">${promptHtml || ''}</div>
        <div class="gm-type"><input class="input gm-input" type="text" dir="ltr" lang="de" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="اكتب بالألماني…">
        <div class="gm-umlauts">${UMLAUTS.map(c => `<button type="button" data-ch="${c}">${c}</button>`).join('')}</div>
        <button type="button" class="btn btn-primary btn-big gm-submit">تحقق</button></div>
        <p class="vs-wait" hidden></p></div>`);
      stage.appendChild(q);
      const input = q.querySelector('input');
      if (audioWord) { const s = q.querySelector('.vs-say'); s.addEventListener('click', () => vs.say(audioWord)); vs.after(250, () => vs.say(audioWord)); }
      q.addEventListener('pointerdown', e => { if (e.target.closest('.gm-umlauts button')) e.preventDefault(); });
      q.addEventListener('click', e => { const b = e.target.closest('.gm-umlauts button'); if (!b) return; const s = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? s; input.value = input.value.slice(0, s) + b.dataset.ch + input.value.slice(en); input.setSelectionRange(s + 1, s + 1); input.focus(); });
      let done = false;
      const submit = () => { if (done || input.disabled) return; const v = input.value.trim(); if (!v) { input.focus(); return; } done = true; input.disabled = true; q.querySelectorAll('.gm-umlauts button,.gm-submit').forEach(b => b.disabled = true); const r = checkTyped(accept, v); onSubmit(r.ok, v, q, r); };
      q.querySelector('.gm-submit').addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
      return q;
    },

    // «استنى صاحبك…» تحت السؤال
    waiting(on, text = 'استنى صاحبك…') { const w = stage.querySelector('.vs-wait'); if (w) { w.hidden = !on; w.textContent = text; } },

    // فيدباك سريع
    flash(ok, html, ms = 900) { fbEl.className = `vs-fb show ${ok ? 'ok' : 'bad'}`; fbEl.innerHTML = `<div>${mixHtml(html)}</div>`; vs.after(ms, () => { fbEl.className = 'vs-fb'; }); },

    // ---------- النتيجة ----------
    end({ win, me = st.me, peer = st.peer, coop = false, msg }) {
      if (st.over) return; st.over = true;
      for (const t of timers) { clearTimeout(t); clearInterval(t); } timers.clear();
      vs.stopAudio();
      recordVs(meta.id, { win, me, peer, coop });
      const title = coop ? (win ? 'كسبتوا سوا! 🎉' : 'المرة الجاية تكسبوا 💪') : win === true ? `كسبت! 🏆` : win === false ? 'صاحبك كسب المرة دي' : 'تعادل!';
      document.body.classList.remove('immersive');
      root.innerHTML = '';
      const card = el(`<section class="vs-results">
        <div class="card vs-res-card ${win === true || (coop && win) ? 'win' : coop ? 'lose' : win === false ? 'lose' : ''}">
          <div class="vs-res-ico">${coop ? (win ? '🤝' : '🧩') : win === true ? '🏆' : win === false ? '😅' : '🤝'}</div>
          <h1>${esc(title)}</h1>
          ${msg ? `<p class="hint">${esc(msg)}</p>` : ''}
          <div class="vs-res-scores"><div><b>${me}</b><span>${esc(vs.meName)}</span></div><div class="vs-res-x">—</div><div><b>${peer}</b><span>${esc(vs.peerName)}</span></div></div>
        </div>
        <div class="vs-res-actions">
          ${isHost ? '<button type="button" class="btn btn-primary btn-big" data-act="rematch">ماتش تاني</button>' : '<p class="hint center" data-slot="waitRematch">صاحبك ممكن يبدأ ماتش تاني…</p>'}
          <a class="btn" href="#/vs">غرفة جديدة</a>
          <a class="btn btn-ghost" href="#/games">خلاص كفاية</a>
        </div>
      </section>`);
      root.appendChild(card);
      if (win === true || (coop && win)) { sfx.win && sfx.win(); try { confetti(); } catch (e) { /* ignore */ } } else if (sfx.lose) sfx.lose();
      card.addEventListener('click', e => { if (e.target.closest('[data-act="rematch"]')) { vs.send('rematch', {}); if (onExit) onExit('rematch'); } });
      // الطرف التاني طلب ماتش تاني
      cleanups.push(net.on('game', d => { if (d && d.k === 'rematch' && onExit) onExit('rematch'); }));
    },

    destroy() {
      st.over = true;
      for (const t of timers) { clearTimeout(t); clearInterval(t); } timers.clear();
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (e) { /* ignore */ } }
      vs.stopAudio();
      document.body.classList.remove('immersive');
    },
  };

  // حالة الاتصال + خروج الطرف التاني
  cleanups.push(net.on('status', s => { setStatus(s); if ((s === 'dropped' || s === 'closed') && !st.over) peerGone('مفيش اتصال'); }));
  cleanups.push(net.on('peerLeft', () => { if (!st.over) peerGone(); }));
  function peerGone(reason) {
    st.over = true;
    for (const t of timers) { clearTimeout(t); clearInterval(t); } timers.clear();
    const ov = el(`<div class="vs-over"><div class="card"><div class="big">👋</div><h2>${esc(reason || 'صاحبك خرج من اللعبة')}</h2><a class="btn btn-primary btn-big" href="#/vs">غرفة جديدة</a><a class="btn btn-ghost" href="#/games">الألعاب</a></div></div>`);
    root.appendChild(ov);
  }

  vs.close = () => { if (confirm('تخرج من اللعبة؟')) { try { net.bye(); } catch (e) { /* ignore */ } if (onExit) onExit('quit'); } };
  $('.vs-close').addEventListener('click', vs.close);
  return vs;
}

// نتايج اللعب مع صاحبك (في النسخة الاحتياطية)
function recordVs(gameId, { win, coop }) {
  const v = (store.state.vs ||= { wins: 0, losses: 0, ties: 0, played: 0, best: {} });
  v.played = (v.played | 0) + 1;
  if (coop ? win : win === true) v.wins = (v.wins | 0) + 1;
  else if (win === false) v.losses = (v.losses | 0) + 1;
  else if (win == null) v.ties = (v.ties | 0) + 1;
  store.save();
}

const CSS = `
.vs-wrap { display: flex; flex-direction: column; min-height: calc(100dvh - var(--safe-t) - var(--safe-b)); gap: 10px; }
.vs-top { position: sticky; top: 0; z-index: 5; display: grid; grid-template-columns: auto 1fr auto 1fr; align-items: center; gap: 8px; padding: 10px 6px; background: var(--surface); border-bottom: 1px solid var(--line); }
.vs-close { flex: none; }
.vs-score { text-align: center; min-width: 0; }
.vs-score .n { display: block; font: 800 26px/1 var(--font-de); color: var(--blue); }
.vs-score small { display: block; color: var(--ink-2); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vs-peer .n { color: var(--warn-text); }
.vs-mid { display: grid; justify-items: center; gap: 3px; }
.vs-ico { font-size: 22px; line-height: 1; }
.vs-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); }
.vs-dot[data-s="online"] { background: var(--good); } .vs-dot[data-s="connecting"] { background: var(--warn); }
.vs-dot[data-s="dropped"], .vs-dot[data-s="error"], .vs-dot[data-s="closed"] { background: var(--bad); }
.vs-bar { height: 8px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.vs-bar > i { display: block; height: 100%; background: var(--blue); border-radius: inherit; }
.vs-bar.vs-timer > i { transition: width .1s linear; } .vs-bar.low > i { background: var(--bad); }
.vs-stage { flex: 1; }
.vs-q { display: grid; gap: 14px; padding: 8px 0; }
.vs-wait { text-align: center; color: var(--ink-2); font-weight: 700; margin: 0; }
.vs-fb { position: sticky; bottom: 0; text-align: center; font-weight: 800; padding: 0; max-height: 0; overflow: hidden; transition: max-height .15s; }
.vs-fb.show { max-height: 60px; padding: 10px; }
.vs-fb.ok { color: var(--good-text); } .vs-fb.bad { color: var(--bad-text); }
.vs-results { display: grid; gap: 10px; }
.vs-res-card { text-align: center; } .vs-res-card.win { border-color: var(--good); } .vs-res-card.lose { border-color: var(--line); }
.vs-res-ico { font-size: 54px; }
.vs-res-scores { display: flex; align-items: center; justify-content: center; gap: 18px; margin-top: 8px; }
.vs-res-scores b { display: block; font: 800 40px/1 var(--font-de); color: var(--blue); }
.vs-res-scores .vs-peer, .vs-res-scores div:last-child b { color: var(--warn-text); }
.vs-res-x { color: var(--muted); font-size: 24px; }
.vs-res-actions { display: grid; gap: 10px; }
.vs-over { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(2px); }
.vs-over .card { text-align: center; max-width: 340px; display: grid; gap: 12px; }
.vs-over .big { font-size: 54px; }
.vs-rope { position: relative; height: 54px; margin: 10px 0; border-radius: 12px; background: var(--surface-2); overflow: hidden; }
.vs-rope-knot { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 30px; transition: left .25s ease; }
.vs-rope-mid { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: var(--line-strong); }
.vs-bingo { display: grid; gap: 8px; }
.vs-bingo-grid { display: grid; gap: 6px; }
.vs-bingo-cell { aspect-ratio: 1; display: grid; place-items: center; border-radius: 10px; border: 2px solid var(--line-strong); background: var(--surface); font: 800 clamp(16px,5vw,24px)/1 var(--font-de); cursor: pointer; }
.vs-bingo-cell.on { background: var(--good-tint); border-color: var(--good); color: var(--good-text); }
.vs-bingo-cell.miss { animation: gm-shake .3s; }
.vs-call { text-align: center; font: 800 34px/1.2 var(--font-de); padding: 10px; }
`;
