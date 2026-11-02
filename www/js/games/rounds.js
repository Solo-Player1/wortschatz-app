// games/rounds.js — أنواع أسئلة جاهزة تستخدمها الألعاب والامتحان: كتابة، اختيار، ترتيب بلاطات الجملة
// كل دالة ask* بترسم السؤال جوه g.stage، تصحّح، تنادي g.correct / g.wrong، وترجّع Promise<boolean> (true = كمّل)
import { normDe } from '../exercises.js';
import { tilesOf } from '../content.js';

const UMLAUTS = ['ä', 'ö', 'ü', 'ß'];
const pts = p => (typeof p === 'function' ? p() : p);   // النقط ممكن تكون رقم أو دالة (مثلاً نص النقط لو استخدم مساعدة)
const stripPunct = s => String(s).replace(/[.,!?;:…"„“”«»]+/g, '');

// ---------- صندوق الكتابة (بأزرار الأوملاوت) ----------
export function typeBox(g, { placeholder = 'اكتب بالألماني…', onSubmit, submitLabel = 'تحقق', umlauts = true, inputMode = 'text' } = {}) {
  const box = g.el(`<div class="gm-type">
    <input class="input gm-input" type="text" dir="ltr" lang="de" inputmode="${inputMode}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${g.esc(placeholder)}">
    ${umlauts ? `<div class="gm-umlauts">${UMLAUTS.map(c => `<button type="button" data-ch="${c}" aria-label="${c}">${c}</button>`).join('')}</div>` : ''}
    <button type="button" class="btn btn-primary btn-big gm-submit">${g.esc(submitLabel)}</button>
  </div>`);
  const input = box.querySelector('input');
  const submit = () => { if (input.disabled) return; const v = input.value; if (!v.trim()) { input.focus(); return; } onSubmit && onSubmit(v); };
  box.querySelector('.gm-submit').addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  box.addEventListener('pointerdown', e => { if (e.target.closest('.gm-umlauts button')) e.preventDefault(); });
  box.addEventListener('click', e => {
    const b = e.target.closest('.gm-umlauts button');
    if (!b) return;
    const s = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, s) + b.dataset.ch + input.value.slice(en);
    input.setSelectionRange(s + 1, s + 1);
    input.focus();
  });
  return {
    el: box, input,
    focus() { setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60); },
    clear() { input.value = ''; },
    disable() { input.disabled = true; box.querySelectorAll('button').forEach(b => { b.disabled = true; }); },
  };
}

// ---------- أزرار اختيار ----------
// options: [{ html, value, correct }] → onPick(option, button)
export function choiceGrid(g, options, onPick, { cols = 2, cls = '' } = {}) {
  const grid = g.el(`<div class="gm-choices cols-${cols} ${cls}">${options.map((o, i) => `<button type="button" class="gm-choice" data-i="${i}">${o.html}</button>`).join('')}</div>`);
  let locked = false;
  grid.addEventListener('click', e => {
    const b = e.target.closest('.gm-choice');
    if (!b || locked) return;
    locked = true;
    const o = options[+b.dataset.i];
    grid.querySelectorAll('.gm-choice').forEach((x, i) => {
      x.disabled = true;
      if (options[i].correct) x.classList.add('right');
    });
    if (!o.correct) b.classList.add('wrong');
    onPick && onPick(o, b);
  });
  return grid;
}

// ---------- بلاطات الجملة ----------
// tiles: الكلمات بالترتيب الصح. onCheck(builtTiles[]) بعد ما كل البلاطات تتحط وتدوس «تحقق»
export function tilesBoard(g, tiles, { onCheck, extra = [] } = {}) {
  const bank = g.shuffle(tiles.map((t, i) => ({ t, i })).concat(extra.map((t, k) => ({ t, i: 1000 + k }))));
  // نتأكد إن الخلط مش هو نفس الترتيب الصح
  if (bank.length >= 2 && bank.every((b, k) => b.i === k)) bank.push(bank.shift());
  const board = g.el(`<div class="gm-tiles">
    <div class="gm-answer" aria-label="الجملة"></div>
    <div class="gm-bank">${bank.map((b, k) => `<button type="button" class="gm-tile" data-k="${k}"><bdi class="de">${g.esc(b.t)}</bdi></button>`).join('')}</div>
    <button type="button" class="btn btn-primary btn-big gm-submit" disabled>تحقق</button>
  </div>`);
  const ans = board.querySelector('.gm-answer'), bankEl = board.querySelector('.gm-bank'), submit = board.querySelector('.gm-submit');
  const placed = [];
  let checked = false;          // بعد «تحقق» اللوحة بتتقفل (الجملة الصح بتترسم كـ<span> ما ينفعش تتلمس)
  const sync = () => { submit.disabled = placed.length !== tiles.length; ans.classList.toggle('empty', !placed.length); };
  board.addEventListener('click', e => {
    if (checked) return;
    const tile = e.target.closest('button.gm-tile');
    if (!tile || tile.disabled || tile.dataset.k == null) return;
    if (tile.parentElement === bankEl) {
      if (placed.length >= tiles.length) return;
      placed.push(+tile.dataset.k);
      ans.appendChild(tile);
    } else {
      placed.splice(placed.indexOf(+tile.dataset.k), 1);
      bankEl.appendChild(tile);
    }
    sync();
  });
  submit.addEventListener('click', () => {
    if (submit.disabled || checked) return;
    checked = true;
    submit.disabled = true;
    board.querySelectorAll('.gm-tile').forEach(t => { t.disabled = true; });
    onCheck && onCheck(placed.map(k => bank[k].t));
  });
  sync();
  return board;
}

// هل ترتيب البلاطات صح؟ (الجملة الأصلية أو أي ترتيب بديل في alts)
export function tilesMatch(sentence, built) {
  return !!matchedSentence(sentence, built);
}
// الجملة (الأصلية أو البديلة) اللي البلاطات طابقتها — عشان نعرضها بالحروف الكبيرة الصح
export function matchedSentence(sentence, built) {
  const norm = s => normDe(stripPunct(s));
  const got = norm(built.join(' '));
  return [sentence.de, ...(sentence.alts || [])].find(s => norm(s) === got) || null;
}

// ====================================================================
// أسئلة جاهزة
// ====================================================================
// كتابة: { promptHtml, expected: [نصوص مقبولة], show: الإجابة اللي تتعرض, wordId, itemId, audio (كلمة أو نص), points, autoplay }
export function askType(g, { promptHtml, expected, show, wordId, itemId, audio, points = 10, autoplay = true, hint, placeholder } = {}) {
  return new Promise(resolve => {
    g.stage.innerHTML = '';
    const q = g.el(`<div class="gm-q">
      ${audio ? '<button type="button" class="gm-speaker" aria-label="اسمع تاني">🔊</button>' : ''}
      <div class="gm-prompt">${promptHtml || ''}</div>
      ${hint ? `<p class="hint center">${g.esc(hint)}</p>` : ''}
    </div>`);
    g.stage.appendChild(q);
    const spk = q.querySelector('.gm-speaker');
    if (spk) spk.addEventListener('click', () => g.say(audio));
    let answered = false;
    const tb = typeBox(g, {
      placeholder,
      onSubmit: async v => {
        answered = true;
        tb.disable();
        const r = g.checkTyped(expected, v);
        let go;
        if (r.ok) go = await g.correct({ points: pts(points), wordId, typed: !!wordId, itemId, msg: r.almost ? `صح تقريبًا — الكتابة الصح: ${show}` : undefined });
        else go = await g.wrong({ wordId, typed: !!wordId, itemId, correctHtml: `<bdi class="de">${g.esc(show)}</bdi>`, label: `كتبت: ${v}` });
        resolve(go);
      },
    });
    g.stage.appendChild(tb.el);
    tb.focus();
    // التشغيل التلقائي بس لو السؤال لسه مستني إجابة (مايتسمعش صوت الكلمة اللي فاتت فوق السؤال الجاي)
    if (audio && autoplay) g.after(250, () => { if (!answered && q.isConnected) g.say(audio); });
  });
}

// اختيار: { promptHtml, options: [{ html, correct }], wordId, itemId, audio, points, cols, correctHtml }
export function askChoice(g, { promptHtml, options, wordId, itemId, audio, points = 10, cols = 2, correctHtml, autoplay = true } = {}) {
  return new Promise(resolve => {
    g.stage.innerHTML = '';
    const q = g.el(`<div class="gm-q">
      ${audio ? '<button type="button" class="gm-speaker" aria-label="اسمع تاني">🔊</button>' : ''}
      <div class="gm-prompt">${promptHtml || ''}</div>
    </div>`);
    g.stage.appendChild(q);
    const spk = q.querySelector('.gm-speaker');
    if (spk) spk.addEventListener('click', () => g.say(audio));
    const right = options.find(o => o.correct);
    let answered = false;
    g.stage.appendChild(choiceGrid(g, options, async o => {
      answered = true;
      const go = o.correct
        ? await g.correct({ points: pts(points), wordId, itemId })
        : await g.wrong({ wordId, itemId, correctHtml: correctHtml || (right ? right.html : '') });
      resolve(go);
    }, { cols }));
    if (audio && autoplay) g.after(250, () => { if (!answered && q.isConnected) g.say(audio); });
  });
}

// ترتيب جملة: { sentence (من content), promptHtml, points, extra (بلاطات زيادة للتمويه) }
export function askTiles(g, { sentence, promptHtml, points = 15, extra = [], speakAfter = true } = {}) {
  return new Promise(resolve => {
    g.stage.innerHTML = '';
    const tiles = tilesOf(sentence);
    g.stage.appendChild(g.el(`<div class="gm-q">
      <button type="button" class="gm-speaker sm" aria-label="اسمع الجملة">🔊</button>
      <div class="gm-prompt">${promptHtml || `<p class="gm-ar">${g.esc(sentence.ar)}</p><p class="hint center">رتّب الكلمات وكوّن الجملة بالألماني</p>`}</div>
    </div>`));
    g.stage.querySelector('.gm-speaker').addEventListener('click', () => g.say(sentence.de));
    g.stage.appendChild(tilesBoard(g, tiles, {
      extra,
      onCheck: async built => {
        const hit = matchedSentence(sentence, built);
        const ok = !!hit;
        if (ok) {
          // نعرض الجملة زي ما بتتكتب (Ich كابيتال في الأول، ich صغيرة في النص)
          const ans = g.stage.querySelector('.gm-answer');
          if (ans) ans.innerHTML = String(hit).split(' ').map(t => `<span class="gm-tile done"><bdi class="de">${g.esc(t)}</bdi></span>`).join('');
        }
        const spoken = speakAfter ? g.say(sentence.de) : null;
        let go;
        if (ok) {
          go = await g.correct({ points: pts(points), itemId: sentence.id, msg: 'جملة مظبوطة! 👏' });
          // نستنى الجملة تخلص (بحد أقصى ٣٫٥ ثانية) — السؤال الجاي بيشغّل صوته فبيقطعها.
          // لو دوس 🔊 وهو مستني، القراية الأولى بتتلغي وبتبدأ واحدة جديدة → نستنى الأخيرة (g.lastSpeech)
          if (go && spoken) {
            let capped = false, p = spoken;
            const cap = new Promise(r => setTimeout(() => { capped = true; r(); }, 3500));
            for (;;) { await Promise.race([p, cap]); if (capped || !g.lastSpeech || g.lastSpeech === p) break; p = g.lastSpeech; }
          }
        } else go = await g.wrong({ itemId: sentence.id, correctHtml: `<bdi class="de">${g.esc(sentence.de)}</bdi>`, label: sentence.ar });
        resolve(go && g.alive);
      },
    }));
  });
}
