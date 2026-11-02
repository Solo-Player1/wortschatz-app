// 🔠 الحروف الألمانية — تسمع اسم الحرف وتختاره، تشوف الحرف وتختار نطقه بالعربي، و«اتهجّى»: تسمع كلمة حرف حرف وتكتبها.
// الحروف من content.json (alphabet.letters: {ch, name, say, word}) والتهجّي من alphabet.spelling ({word, spelled}).
// الصوت الألماني (TTS) ممكن يبقى مش موجود: 👁 / 💡 بيعرضوا المساعدة بنص النقط، ولو عرفنا إن الصوت مش شغال
// بنحوّل السؤال لقراية (النطق بالعربي ظاهر) بنقط كاملة.
import { injectCss } from './engine.js';
import { typeBox, choiceGrid } from './rounds.js';
import { normAr } from '../exercises.js';

const okLetter = L => !!(L && typeof L.ch === 'string' && L.ch.trim() && (L.name || L.say));

export const meta = {
  id: 'alphabet',
  title: 'الحروف الألمانية',
  icon: '🔠',
  short: 'اسمع الحرف واختاره، واتهجّى الكلام',
  desc: 'الحروف الألماني بنطقها: تسمع اسم الحرف وتختاره، تعرف بيتنطق إزاي، وتكتب كلام متهجّي حرف حرف — كل غلطة بقلب!',
  how: [
    '🔊 اسمع اسم الحرف واختار الحرف الصح (مش سامع؟ دوس 👁)',
    'شوف الحرف واختار نطقه بالعربي',
    '«اتهجّى»: هتسمع حروف ورا بعض — اكتب الكلمة (💡 بيوريك الحروف بنص النقط)',
  ],
  hearts: 3,
  source: 'none',          // الحروف مش مربوطة بدرس → من غير اختيار «تلعب على إيه؟»
  minItems: 4,
  unit: 'حرف',
  count: pool => (pool.letters() || []).filter(okLetter).length,
};

const ROUNDS = 15;
const MAX_SPELL = 5;
// حروف بتتلخبط مع بعض (في السمع أو عند اللي متعوّد على الإنجليزي)
const GROUPS = [
  ['E', 'I', 'Ä'], ['I', 'J', 'Y'], ['B', 'P', 'D', 'T'], ['G', 'K', 'Q'], ['V', 'F', 'W'], ['Ö', 'O', 'U'],
  ['Ü', 'U', 'I', 'Y'], ['C', 'Z', 'S', 'ß', 'X'], ['M', 'N'], ['A', 'H', 'R'], ['J', 'G', 'Y'], ['Ä', 'E', 'A'],
  ['K', 'C', 'Q'], ['L', 'R', 'E'], ['Ö', 'E'],
];

const CSS = `
.gm-alphabet-q { display: grid; gap: 8px; justify-items: center; }
.gm-alphabet-q .hint { margin: 0; }
.gm-alphabet-tag { display: inline-flex; align-items: center; gap: 6px; padding: 3px 12px; border-radius: 999px; background: var(--blue-tint); color: var(--blue); font-size: 13px; font-weight: 700; }
.gm-alphabet-big { font: 800 72px/1.1 var(--font-de); color: var(--blue); direction: ltr; unicode-bidi: isolate; letter-spacing: .04em; }
.gm-alphabet-say { margin: 0; font-size: 26px; }
.gm-alphabet-note { margin: 0; color: var(--warn-text); font-weight: 600; font-size: 14px; }
.gm-alphabet-letters .gm-choice { min-height: 64px; }
.gm-alphabet-letters .gm-choice .de { font-size: 28px; font-weight: 800; letter-spacing: .06em; }
.gm-alphabet-says .gm-choice { font-family: var(--font-head); font-size: 19px; }
.gm-alphabet-slots { display: flex; justify-content: center; gap: 5px; direction: ltr; width: 100%; margin: 4px 0; }
.gm-alphabet-slots i { flex: 0 1 36px; min-width: 18px; height: 42px; border-radius: 9px; border: 2px solid var(--line-strong); background: var(--surface-2); display: grid; place-items: center; font: 800 19px/1 var(--font-de); font-style: normal; color: var(--ink); transition: transform .12s, background-color .12s, border-color .12s; }
.gm-alphabet-slots i.gap { flex: 0 0 10px; min-width: 10px; border: none; background: none; }
.gm-alphabet-slots i.on { border-color: var(--blue); background: var(--blue-tint); transform: translateY(-4px); }
.gm-alphabet-slots.ok i:not(.gap) { border-color: var(--good); background: var(--good-tint); color: var(--good-text); }
.gm-alphabet-slots.bad i:not(.gap) { border-color: var(--bad); background: var(--bad-tint); color: var(--bad-text); }
.gm-alphabet-spelled { margin: 0; }
.gm-alphabet-spelled .de { font-size: 21px; font-weight: 700; color: var(--blue); }
.gm-alphabet-sayline { margin: 0; font-size: 21px; }
.gm-fb .gm-alphabet-ex { font-size: 14px; color: var(--ink-2); }
`;

// مفتاح الحرف: أول حرف كبير (ß زي ما هي — 'ß'.toUpperCase() = 'SS')
function keyOf(L) {
  const c = String((L && L.ch) || '').trim();
  if (!c) return '';
  if (/[ßẞ]/.test(c)) return 'ß';
  return c[0].toLocaleUpperCase('de');
}
const showOf = k => (k === 'ß' ? 'ß' : `${k} ${k.toLocaleLowerCase('de')}`);
// حروف مش ألماني (é في Café) تتقبل من غير العلامة
const stripForeign = s => String(s).replace(/[^\x00-\x7FäöüÄÖÜß]/g, c => c.normalize('NFD').replace(/[\u0300-\u036F]/g, ''));

// ترتيب الأسئلة: أول سؤال سهل، ومفيش نوع 3 مرات ورا بعض
function arrange(types, shuffle) {
  const t = shuffle(types);
  if (t[0] === 'spell') { const j = t.findIndex(x => x !== 'spell'); if (j > 0) [t[0], t[j]] = [t[j], t[0]]; }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 2; i < t.length; i++) {
      if (t[i] !== t[i - 1] || t[i] !== t[i - 2]) continue;
      const j = t.findIndex((x, k) => k > i && x !== t[i]);
      if (j > 0) [t[i], t[j]] = [t[j], t[i]];
    }
  }
  return t;
}

// صوت ألماني ممكن يفشل: بنعرف من غير ما نستنى (أي نطق أحدث بيلغي متابعة اللي قبله).
// قبل كل نطق: نوقف اللي شغال ونستنى 150ms — في Chrome/Edge لو speak() جت ورا cancel() على طول وهو بيتكلم
// الصوت بيعلّق خالص (ولا جملة بتبدأ تاني)؛ الوقفة الصغيرة دي بتمنع ده وبتصلّحه لو حصل
function makeVoice(g) {
  let gen = 0;
  const v = {
    broken: false,
    say(text, onFail) {
      const my = ++gen;
      g.stopAudio();
      return new Promise(res => g.after(150, res))
        .then(() => (my === gen && g.alive ? g.say(text, { rate: 0.8 }) : null))
        .catch(() => false)
        .then(ok => {
          if (ok === null) return false;                  // اتلغى قبل ما يبدأ
          if (ok) { v.broken = false; return true; }
          if (my === gen && g.alive) { v.broken = true; if (onFail) onFail(); }
          return false;
        });
    },
    cancel() { gen++; },
  };
  return v;
}

export function start(g) {
  injectCss('alphabet', CSS);
  const byKey = new Map();
  for (const L of (g.letters() || []).filter(okLetter)) { const k = keyOf(L); if (k && !byKey.has(k)) byKey.set(k, L); }
  const letters = [...byKey.values()];
  if (letters.length < 4) { g.end({ win: true }); return; }   // المحتوى لسه ما اتبناش

  const esc = g.esc;
  const voice = makeVoice(g);
  const wait = ms => new Promise(res => g.after(ms, res));
  const nameOf = L => String(L.name || keyOf(L));
  const sayOf = L => String(L.say || L.name || '');
  const letterHtml = L => `<bdi class="de">${esc(showOf(keyOf(L)))}</bdi>`;
  const exampleHtml = L => (L.word && L.word.de ? ` <span class="gm-alphabet-ex">· زي <bdi class="de">${esc(L.word.de)}</bdi>${L.word.ar ? ` (${esc(L.word.ar)})` : ''}</span>` : '');
  const letterFor = c => {
    if (!c || !c.trim()) return null;
    if (/[ßẞ]/.test(c)) return byKey.get('ß') || null;
    const k = c.toLocaleUpperCase('de');
    return byKey.get(k) || byKey.get(k.normalize('NFD').replace(/[\u0300-\u036F]/g, '')) || null;
  };

  // اختيارات غلط من الحروف اللي بتتلخبط معاه الأول — distinct = القيمة اللي لازم متتكررش (الحرف أو النطق)
  function confusables(L, n, distinct, okFn = () => true) {
    const k = keyOf(L);
    const near = new Set();
    for (const grp of GROUPS) if (grp.includes(k)) for (const x of grp) if (x !== k) near.add(x);
    const seen = new Set([distinct(L)]), out = [];
    const tryAdd = X => {
      if (!X || X === L || out.length >= n || !okFn(X)) return;
      const d = distinct(X);
      if (!d || seen.has(d)) return;
      seen.add(d);
      out.push(X);
    };
    for (const x of g.shuffle([...near])) tryAdd(byKey.get(x));
    for (const X of g.shuffle(letters)) tryAdd(X);
    return out;
  }

  // ---------- (أ) اسمع اسم الحرف → اختار الحرف ----------
  function hearRound(L) {
    return new Promise(resolve => {
      const read = voice.broken;                       // الصوت مش شغال → النطق ظاهر من الأول بنقط كاملة
      let helped = false, answered = false;
      g.stage.innerHTML = '';
      const q = g.el(`<div class="gm-q gm-alphabet-q">
        <span class="gm-alphabet-tag">${read ? '👀 اقرا النطق' : '🎧 اسمع الحرف'}</span>
        ${read ? '' : '<button type="button" class="gm-speaker" aria-label="اسمع تاني">🔊</button>'}
        <p class="hint">${read ? 'أنهي حرف بيتنطق كده؟' : 'سمعت أنهي حرف؟'}</p>
        <p class="gm-ar gm-alphabet-say"${read ? '' : ' hidden'}>«${esc(sayOf(L))}»</p>
        <p class="gm-alphabet-note" hidden></p>
        ${read ? '' : '<button type="button" class="btn btn-ghost gm-hint-btn">👁 مش سامع؟ اعرض النطق</button>'}
      </div>`);
      g.stage.appendChild(q);
      const sayEl = q.querySelector('.gm-alphabet-say'), helpBtn = q.querySelector('.gm-hint-btn'), note = q.querySelector('.gm-alphabet-note');
      const reveal = free => { sayEl.hidden = false; if (helpBtn) helpBtn.hidden = true; if (!free && !answered) helped = true; };
      if (helpBtn) helpBtn.addEventListener('click', () => reveal(false));
      const speak = () => voice.say(nameOf(L), () => {
        if (answered) return;
        reveal(true);
        note.textContent = '🔇 الصوت الألماني مش شغال هنا — اقرا النطق واختار الحرف';
        note.hidden = false;
      });
      const spk = q.querySelector('.gm-speaker');
      if (spk) spk.addEventListener('click', speak);
      const opts = g.shuffle([L, ...confusables(L, 3, keyOf)]).map(X => ({ X, correct: X === L, html: letterHtml(X) }));
      g.stage.appendChild(choiceGrid(g, opts, async o => {
        answered = true;
        voice.cancel();
        reveal(true);
        const go = o.correct
          ? await g.correct({ points: helped ? 5 : 10 })
          : await g.wrong({ correctHtml: `${letterHtml(L)} = «${esc(sayOf(L))}»${exampleHtml(L)}`, label: `اخترت ${showOf(keyOf(o.X))}` });
        resolve(go);
      }, { cols: 2, cls: 'gm-alphabet-letters' }));
      if (!read) g.after(300, speak);
    });
  }

  // ---------- (ب) الحرف ظاهر → اختار نطقه بالعربي ----------
  function seeRound(L) {
    return new Promise(resolve => {
      const sayKey = X => normAr(X.say || '');
      const opts = g.shuffle([L, ...confusables(L, 3, sayKey, X => !!X.say)]).map(X => ({ X, correct: X === L, html: esc(X.say) }));
      g.stage.innerHTML = '';
      g.stage.appendChild(g.el(`<div class="gm-q gm-alphabet-q">
        <span class="gm-alphabet-tag">👀 الحرف ده</span>
        <div class="gm-alphabet-big">${letterHtml(L)}</div>
        <p class="hint">بيتنطق إزاي؟</p>
      </div>`));
      g.stage.appendChild(choiceGrid(g, opts, async o => {
        voice.say(nameOf(L));                          // يسمع النطق الصح بعد ما يختار
        const go = o.correct
          ? await g.correct({ points: 10 })
          : await g.wrong({ correctHtml: `${letterHtml(L)} = «${esc(L.say)}»${exampleHtml(L)}`, label: `اخترت «${o.X.say}»` });
        resolve(go);
      }, { cols: 2, cls: 'gm-alphabet-says' }));
    });
  }

  // ---------- (ج) اتهجّى: الحروف بتتنطق واحد واحد → اكتب الكلمة ----------
  let spellSeq = 0;
  function spellRound(item) {
    return new Promise(resolve => {
      const word = String(item.word).trim();
      const chars = [...word];
      const known = chars.map(letterFor);
      const spelled = String(item.spelled || '').trim() || chars.map((c, k) => (known[k] ? nameOf(known[k]) : c)).join(' – ');
      const sayLine = chars.map((c, k) => (known[k] ? sayOf(known[k]) : c.trim() ? c : '/')).join(' · ');
      let read = voice.broken, helped = false, answered = false;
      g.stage.innerHTML = '';
      const q = g.el(`<div class="gm-q gm-alphabet-q">
        <span class="gm-alphabet-tag">🔡 اتهجّى</span>
        ${read ? '' : '<button type="button" class="gm-speaker" aria-label="اسمع الحروف تاني">🔊</button>'}
        <p class="hint">${read ? 'اقرا الحروف (من اليمين) واكتب الكلمة' : 'اسمع الحروف واكتب الكلمة'}</p>
        <div class="gm-alphabet-slots" aria-hidden="true">${chars.map(c => `<i${c.trim() ? '' : ' class="gap"'}></i>`).join('')}</div>
        <p class="gm-ar gm-alphabet-sayline"${read ? '' : ' hidden'}>${esc(sayLine)}</p>
        <p class="gm-alphabet-spelled" hidden><bdi class="de">${esc(spelled)}</bdi></p>
        <p class="gm-alphabet-note" hidden></p>
        ${read ? '' : '<button type="button" class="btn btn-ghost gm-hint-btn">💡 اعرض الحروف</button>'}
      </div>`);
      g.stage.appendChild(q);
      const slotsEl = q.querySelector('.gm-alphabet-slots'), slots = [...slotsEl.children];
      const helpBtn = q.querySelector('.gm-hint-btn'), note = q.querySelector('.gm-alphabet-note');
      const spelledEl = q.querySelector('.gm-alphabet-spelled'), sayLineEl = q.querySelector('.gm-alphabet-sayline');
      const light = k => slots.forEach((s, j) => s.classList.toggle('on', j === k));
      if (helpBtn) helpBtn.addEventListener('click', () => { if (answered) return; helped = true; helpBtn.hidden = true; spelledEl.hidden = false; });
      const toReading = () => {                        // الصوت طلع مش شغال وسط السؤال
        if (answered || read) return;
        read = true;
        spellSeq++;
        light(-1);
        sayLineEl.hidden = false;
        if (helpBtn) helpBtn.hidden = true;
        note.textContent = '🔇 الصوت الألماني مش شغال هنا — اقرا الحروف واكتب الكلمة';
        note.hidden = false;
      };
      const spellOut = async () => {
        const my = ++spellSeq;
        for (let k = 0; k < chars.length; k++) {
          if (my !== spellSeq || !g.alive || answered) return;
          light(k);
          const L = known[k];
          if (L) await Promise.race([voice.say(nameOf(L), toReading), wait(4000)]);   // أصوات أونلاين بطيئة (~2 ث)، بس لو علّق ما نستناش
          else await wait(chars[k].trim() ? 300 : 450);
          if (my !== spellSeq || !g.alive || answered) return;
          await wait(250);
        }
        if (my === spellSeq) light(-1);
      };
      const spk = q.querySelector('.gm-speaker');
      if (spk) spk.addEventListener('click', () => { if (!answered) spellOut(); });
      const tb = typeBox(g, {
        placeholder: 'اكتب الكلمة…',
        onSubmit: async v => {
          answered = true;
          spellSeq++;
          voice.cancel();
          tb.disable();
          light(-1);
          const r = g.checkTyped([word, stripForeign(word)], v);    // من غير فرق كابيتال/سمول
          chars.forEach((c, k) => { slots[k].textContent = c.trim() ? c : ''; });
          slotsEl.classList.add(r.ok ? 'ok' : 'bad');
          spelledEl.hidden = false;
          if (helpBtn) helpBtn.hidden = true;
          voice.say(word);
          const go = r.ok
            ? await g.correct({ points: helped ? 7 : 15, msg: r.almost ? `صح تقريبًا — الكتابة الصح: ${word}` : undefined, ms: r.almost ? 2000 : undefined })
            : await g.wrong({ correctHtml: `<bdi class="de">${esc(word)}</bdi> <span class="gm-alphabet-ex">(<bdi class="de">${esc(spelled)}</bdi>)</span>`, label: `كتبت: ${v}` });
          resolve(go);
        },
      });
      g.stage.appendChild(tb.el);
      tb.focus();
      if (!read) g.after(400, spellOut);
    });
  }

  // ---------- خطة اللعبة: 15 سؤال ----------
  const spellItems = g.shuffle((g.spelling() || []).filter(s => s && typeof s.word === 'string' && s.word.trim() && [...s.word.trim()].some(letterFor)));
  const nSpell = Math.min(MAX_SPELL, spellItems.length);
  const canSee = letters.filter(L => L.say).length >= 4;
  const nHear = canSee ? Math.ceil((ROUNDS - nSpell) / 2) : ROUNDS - nSpell;
  const nSee = ROUNDS - nSpell - nHear;
  const types = arrange([...Array(nHear).fill('hear'), ...Array(nSee).fill('see'), ...Array(nSpell).fill('spell')], g.shuffle);
  let bag = [];
  const nextLetter = needSay => {
    for (let tries = 0; tries < 2; tries++) {
      if (!bag.length) bag = g.shuffle(letters);
      const k = bag.findIndex(L => !needSay || L.say);
      if (k >= 0) return bag.splice(k, 1)[0];
      bag = [];
    }
    return letters.find(L => !needSay || L.say) || letters[0];
  };

  let i = 0, s = 0;
  const next = async () => {
    if (!g.alive) return;
    if (i >= types.length) { g.end({ win: true }); return; }
    const type = types[i++];
    g.setProgress(i - 1, types.length);
    const go = type === 'spell' ? await spellRound(spellItems[s++])
      : type === 'see' ? await seeRound(nextLetter(true))
      : await hearRound(nextLetter(false));
    if (go) next();
  };
  next();
}
