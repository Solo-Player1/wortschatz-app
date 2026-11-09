// online/race.js — المحرّك المشترك لألعاب السرعة: المبارزة (قلوب)، شد الحبل، حرب التصريف، سباق اسمع واكتب.
// صاحب الغرفة بيبني خطة الأسئلة ويبعتها، والاتنين بيشوفوا نفس السؤال. كل واحد بيجاوب ويبعت نتيجته ووقته،
// والاتنين بيحسبوا مين كسب الجولة بنفس الطريقة (مفيش حاجة عند السيرفر).
import { buildRacePlan } from './qgen.js';

const Q_SECONDS = 12;          // وقت السؤال — لو ما جاوبتش بيتحسب غلط
const BIG = 1e9;

export function runRace(vs, { kind, mode, rounds }) {
  const hearts = mode === 'duel' ? 3 : 0;
  const ROPE = 6;
  const stMe = { hearts, rope: 0 };
  let plan = null, i = 0;
  const myA = {}, peerA = {};   // i -> {c, ms}
  if (hearts) renderHearts();

  vs.on('a', d => { peerA[d.i] = { c: !!d.c, ms: +d.ms }; tryResolve(d.i); });

  if (vs.isHost) { plan = buildRacePlan(kind, vs.pool, rounds); vs.send('plan', { plan }); start(); }
  else { vs.stage.innerHTML = '<div class="vs-q"><p class="vs-wait">بنبدأ…</p></div>'; vs.on('plan', d => { if (plan) return; plan = d.plan; start(); }); }

  // بعد رجوع الاتصال: نعيد إرسال الخطة (لو صاحبك ما وصلته) وإجابتي للجولة الحالية (لو اتبعتت وضاعت
  // لحظة القطع) عشان الجولة ماتعلّقش وتتحسب عند الاتنين.
  vs.onResync(() => {
    if (vs.isHost && plan) vs.send('plan', { plan });
    if (!plan) return;
    for (let k = Math.max(0, i - 2); k <= i; k++) {   // آخر كام إجابة تكفي لتصليح أي فرق جولة بسيط
      const q = plan[k];
      if (q && myA[q.i]) vs.send('a', { i: q.i, c: myA[q.i].c, ms: Math.round(myA[q.i].ms) });
    }
  });

  function start() { i = 0; next(); }

  function next() {
    if (vs.over) return;
    if (i >= plan.length || done()) return finish();
    vs.progress(i, plan.length);
    const q = plan[i];
    let answered = false;
    const t0 = performance.now();
    const qt = vs.timer(Q_SECONDS, () => answer(false, BIG));
    const answer = (correct, ms) => {
      if (answered) return; answered = true; qt.stop();
      myA[q.i] = { c: !!correct, ms: ms == null ? performance.now() - t0 : ms };
      vs.send('a', { i: q.i, c: myA[q.i].c, ms: Math.round(myA[q.i].ms) });
      vs.waiting(peerA[q.i] ? false : true);
      tryResolve(q.i);
    };
    render(q, answer);
  }

  function render(q, answer) {
    const w = q.wordId ? vs.DATA.byId.get(q.wordId) : null;
    if (q.type === 'typeword') {
      return vs.type({ promptHtml: `<p class="hint center">اسمع واكتب</p>`, audioWord: w, accept: q.accept, show: q.show, onSubmit: ok => answer(ok) });
    }
    if (q.type === 'article') {
      const promptHtml = `<p class="hint center">اختار الأداة</p><p class="gm-de-big"><bdi class="de">${vs.esc(q.de)}</bdi></p><p class="muted">${vs.esc(q.ar || '')}</p>`;
      return vs.choice({ promptHtml, cols: 3, options: q.options.map((o, k) => ({ html: `<bdi class="de">${o}</bdi>`, correct: k === q.correct })), onPick: ok => answer(ok) });
    }
    if (q.type === 'verb') {
      const promptHtml = `<p class="hint center">صرّف الفعل</p><p class="gm-de-big" dir="ltr"><bdi class="de">${vs.esc(q.person)} ___ <span class="muted">(${vs.esc(q.inf)})</span></bdi></p><p class="muted">${vs.esc(q.ar || '')}</p>`;
      return vs.choice({ promptHtml, cols: 2, options: q.options.map((o, k) => ({ html: `<bdi class="de">${o}</bdi>`, correct: k === q.correct })), onPick: ok => answer(ok) });
    }
    if (q.type === 'listen') {
      return vs.choice({ promptHtml: `<p class="hint center">اسمع واختار الكلمة</p>`, audioWord: w, cols: 2, options: q.options.map((o, k) => ({ html: `<bdi class="de">${o}</bdi>`, correct: k === q.correct })), onPick: ok => answer(ok) });
    }
    // meaning
    const promptHtml = `<p class="hint center">يعني إيه؟</p><p class="gm-de-big"><bdi class="de">${vs.esc(q.de)}</bdi></p>`;
    return vs.choice({ promptHtml, cols: 2, options: q.options.map((o, k) => ({ html: vs.esc(o), correct: k === q.correct })), onPick: ok => answer(ok) });
  }

  function tryResolve(idx) {
    const q = plan && plan[i]; if (!q || q.i !== idx) return;    // بس للسؤال الحالي
    if (!myA[idx] || !peerA[idx]) return;
    vs.waiting(false);
    const mine = myA[idx], theirs = peerA[idx];
    let winner = 0;                                       // 0 محدش، 1 أنا، -1 صاحبي
    if (mine.c && theirs.c) winner = mine.ms < theirs.ms ? 1 : theirs.ms < mine.ms ? -1 : 0;
    else if (mine.c) winner = 1; else if (theirs.c) winner = -1;

    if (mode === 'tug') { stMe.rope += winner; drawRope(); }
    else if (hearts) { if (!mine.c) stMe.hearts = Math.max(0, stMe.hearts - 1); renderHearts(); if (winner === 1) vs.addMe(); else if (winner === -1) vs.addPeer(); }
    else { if (winner === 1) vs.addMe(); else if (winner === -1) vs.addPeer(); }

    vs.flash(winner === 1, winner === 1 ? 'كسبت الجولة! 🔥' : winner === -1 ? 'صاحبك أسرع 😅' : mine.c ? 'تعادل' : 'غلط', 850);
    i++;
    vs.after(950, next);
  }

  function done() {
    if (mode === 'tug') return Math.abs(stMe.rope) >= ROPE;
    if (hearts) return stMe.hearts <= 0;
    return false;
  }

  function finish() {
    let win;
    if (mode === 'tug') win = stMe.rope === 0 ? null : stMe.rope > 0;
    else if (hearts && stMe.hearts <= 0) win = false;     // قلوبي خلصت
    else win = vs.score.me === vs.score.peer ? null : vs.score.me > vs.score.peer;
    vs.end({ win });
  }

  // ---------- عناصر بصرية (بتتحط بعد شريط التقدّم) ----------
  function renderHearts() {
    let b = vs.root.querySelector('.vs-hearts');
    if (!b) { b = vs.el('<div class="vs-hearts" style="text-align:center;font-size:22px;letter-spacing:3px;min-height:26px"></div>'); vs.root.querySelector('.vs-bar').after(b); }
    b.innerHTML = Array.from({ length: hearts }, (_, k) => (k < stMe.hearts ? '❤️' : '🖤')).join('');
  }
  function drawRope() {
    let r = vs.root.querySelector('.vs-rope');
    if (!r) { r = vs.el('<div class="vs-rope"><div class="vs-rope-mid"></div><span class="vs-rope-knot">🪢</span></div>'); vs.root.querySelector('.vs-bar').after(r); }
    const pct = 50 + (stMe.rope / ROPE) * 46;
    r.querySelector('.vs-rope-knot').style.left = `${Math.max(4, Math.min(96, pct))}%`;
  }
}
