// online/games/build.js — «ابنوا الجملة سوا» (تعاون): نفس البلاطات على لوحة واحدة مشتركة. أي واحد فيكم
// يحط أو يشيل بلاطة، والتاني بيشوفها على طول. لما الجملة تظبط الاتنين بياخدوا الجولة. صاحب الغرفة هو
// اللي بيمسك اللوحة (عشان الترتيب يبقى واحد عند الاتنين)، والتاني بيبعتله الضغطات.
import { tilesOf } from '../../content.js';
import { matchedSentence } from '../../games/rounds.js';
import { poolWords } from '../qgen.js';
import { sentencesOf, sentencesUpTo } from '../../content.js';
import { poolMaxLesson } from '../qgen.js';

const ROUNDS = 5;

export const meta = { id: 'build', title: 'ابنوا الجملة سوا', icon: '🧩', coop: true };

export function start(vs) {
  let round = null, placed = [], solvedCount = 0, idx = 0;

  // استقبال
  vs.on('round', d => { round = d.round; placed = []; render(); });
  vs.on('board', d => { placed = d.placed; render(d.wrong); });
  vs.on('solved', d => { solvedCount = d.n; flashSolved(); });
  vs.on('intent', d => { if (vs.isHost) applyIntent(d.op, d.t); });   // الضيف بيبعت نيّة، المضيف بيطبّق
  vs.on('endco', d => vs.end({ win: d.win, coop: true, me: d.n, peer: d.n, msg: `كوّنتوا ${d.n} من ${ROUNDS} جملة` }));

  // بعد رجوع الاتصال: المضيف يعيد إرسال الجولة واللوحة الحالية (عشان صاحبك يلحق أي تغيير فات عليه).
  vs.onResync(() => { if (vs.isHost && round) { vs.send('round', { round }); vs.send('board', { placed }); vs.send('solved', { n: solvedCount }); } });

  if (vs.isHost) {
    const maxL = poolMaxLesson(vs.pool);
    const pool = (vs.pool && vs.pool.kind === 'lesson' ? sentencesOf(vs.pool.lesson) : sentencesUpTo(maxL)).filter(s => tilesOf(s).length >= 2);
    const list = vs.shuffle(pool).slice(0, ROUNDS);
    if (list.length < 1) { vs.end({ win: false, coop: true, msg: 'مفيش جمل كفاية' }); return; }
    startRound();
    function startRound() {
      if (idx >= list.length) { vs.send('endco', { win: true, n: solvedCount }); vs.end({ win: true, coop: true, me: solvedCount, peer: solvedCount, msg: `كوّنتوا ${solvedCount} من ${ROUNDS} جملة` }); return; }
      const s = list[idx];
      const tiles = vs.shuffle(tilesOf(s).map((t, i) => ({ t, i })));
      // نتأكد مش مترتبة صح من الأول
      if (tiles.length >= 2 && tiles.every((x, k) => x.i === k)) tiles.push(tiles.shift());
      round = { sId: s.id, de: s.de, ar: s.ar, alts: s.alts || [], tiles: tiles.map(x => x.t), order: tiles.map(x => x.i) };
      placed = [];
      vs.send('round', { round });
      render();
    }
    vs._startRound = startRound;
    vs._advance = () => { idx++; startRound(); };
    vs._list = list;
    // المضيف بيطبّق ضغطاته محليًا
    vs._apply = applyIntent;
  }

  function applyIntent(op, t) {
    if (!round) return;
    if (op === 'place') { if (!placed.includes(t) && placed.length < round.tiles.length) placed.push(t); }
    else { const k = placed.indexOf(t); if (k >= 0) placed.splice(k, 1); }
    vs.send('board', { placed });
    render();
    if (placed.length === round.tiles.length) check();
  }

  function check() {
    const built = placed.map(k => round.tiles[k]);
    const hit = matchedSentence({ de: round.de, alts: round.alts }, built);
    if (hit) {
      solvedCount++;
      vs.send('solved', { n: solvedCount });
      flashSolved(hit);
      vs.after(1100, () => vs._advance());
    } else {
      vs.send('board', { placed, wrong: true });
      render(true);
      vs.after(1000, () => { placed = []; vs.send('board', { placed }); render(); });
    }
  }

  function tap(op, t) {
    if (vs.isHost) applyIntent(op, t);
    else vs.send('intent', { op, t });
  }

  function render(wrong) {
    if (!round) { vs.stage.innerHTML = '<div class="vs-q"><p class="vs-wait">بنبدأ…</p></div>'; return; }
    const inAns = new Set(placed);
    vs.stage.innerHTML = '';
    const box = vs.el(`<div class="vs-q">
      <p class="hint center">رتّبوا الكلمات سوا وكوّنوا الجملة — نفس اللوحة عند الاتنين</p>
      <p class="gm-ar">${vs.esc(round.ar || '')}</p>
      <div class="gm-tiles"><div class="gm-answer${wrong ? ' bad' : ''}${placed.length ? '' : ' empty'}"></div>
      <div class="gm-bank"></div></div>
      <p class="muted small center">كوّنتوا ${solvedCount} من ${ROUNDS}</p></div>`);
    const ans = box.querySelector('.gm-answer'), bank = box.querySelector('.gm-bank');
    placed.forEach(k => ans.appendChild(tile(k, 'ans')));
    round.tiles.forEach((t, k) => { if (!inAns.has(k)) bank.appendChild(tile(k, 'bank')); });
    vs.stage.appendChild(box);
    function tile(k, where) {
      const b = vs.el(`<button type="button" class="gm-tile"><bdi class="de">${vs.esc(round.tiles[k])}</bdi></button>`);
      b.addEventListener('click', () => tap(where === 'bank' ? 'place' : 'take', k));
      return b;
    }
  }

  function flashSolved() {
    const ans = vs.stage.querySelector('.gm-answer');
    if (ans) ans.classList.add('ok');
    vs.flash(true, 'جملة مظبوطة! 👏', 1000);
    if (round) vs.say(round.de);
  }

  if (!vs.isHost) render();
}
