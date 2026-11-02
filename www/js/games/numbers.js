// 🔢 الأرقام — اسمع واكتب الرقم، اختار الكلمة الألمانية الصح، اقرا الكلمة واكتب الرقم، واكتب الرقم بالحروف. كل غلطة = قلب.
// المدى على قد الدرس (g.maxLesson): قبل الدرس 9 → 0–20 · الدروس 9–11 → 0–100 · من الدرس 12 → 0–1000 (+ حوالي 20٪ آلاف)
// الصوت الألماني (TTS) ممكن يبقى مش موجود: زرار 👁 بيعرض الكلمة بنص النقط، ولو عرفنا إن الصوت مش شغال
// بنعرض الكلمة لوحدها (نقط كاملة) وأسئلة السمع اللي جاية بتتحوّل لأسئلة قراية.
import { injectCss } from './engine.js';
import { typeBox, choiceGrid } from './rounds.js';
import { deNumber, numberForms } from '../content.js';
import { normDe, fold, shuffle } from '../exercises.js';

export const meta = {
  id: 'numbers',
  title: 'الأرقام',
  icon: '🔢',
  short: 'اسمع الرقم واكتبه — وخد بالك من 23 و 32',
  desc: 'أرقام على قد الدرس اللي وصلته: تسمع وتكتب، تختار الكلمة الصح، وتكتب الرقم بالحروف — كل غلطة بقلب!',
  how: [
    '🔊 اسمع الرقم واكتبه بالأرقام — مش سامع؟ 👁 بيوريك الكلمة بنص النقط',
    'اختار الكلمة الألمانية الصح — خد بالك من الأرقام المقلوبة زي 23 و 32',
    'الأرقام بتكبر مع الدروس: لحد 20، ومن الدرس 9 لحد 100، ومن الدرس 12 لحد 1000 وأكتر',
  ],
  hearts: 3,
  minItems: 1,
  unit: 'رقم',
  count: () => 50,
};

const ROUNDS = 15;
// listen = اسمع واكتب الرقم · choose = الرقم ← اختار الكلمة · read = الكلمة ← اكتب الرقم · write = الرقم ← اكتب الكلمة (لحد 100 بس)
const PLAN = ['listen', 'listen', 'listen', 'listen', 'choose', 'choose', 'choose', 'choose', 'read', 'read', 'read', 'read', 'write', 'write', 'write'];

const CSS = `
.gm-numbers-q { display: grid; gap: 8px; justify-items: center; }
.gm-numbers-q .hint { margin: 0; }
.gm-numbers-tag { display: inline-flex; align-items: center; gap: 6px; padding: 3px 12px; border-radius: 999px; background: var(--blue-tint); color: var(--blue); font-size: 13px; font-weight: 700; }
.gm-numbers-digits { font: 800 60px/1.1 var(--font-de); color: var(--ink); direction: ltr; unicode-bidi: isolate; letter-spacing: .02em; }
.gm-numbers-word { margin: 0; max-width: 100%; }
.gm-numbers-word .de { font-size: 26px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.gm-numbers-word.big .de { font-size: 28px; }
.gm-numbers-word.soft .de { color: var(--blue); }
.gm-numbers-note { margin: 0; color: var(--warn-text); font-weight: 600; font-size: 14px; }
.gm-numbers-ok { margin: 0; padding: 6px 12px; border-radius: 12px; background: var(--good-tint); color: var(--good-text); font-weight: 700; font-size: 15px; }
.gm-numbers-choices .gm-choice .de { font-size: 18px; line-height: 1.35; }
`;

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// أرقام عربي (٠١٢) أو فارسي (۰۱۲) → 012، ومن غير مسافات/نقط/فواصل (1.000 = 1 000 = 1000)
const latin = s => String(s == null ? '' : s)
  .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660))
  .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x6F0));
const digitsOf = s => latin(s).replace(/[\s.,'\u2019_\u066B\u066C]/g, '');
// الكلمة بأماكن كسر سطر بعد tausend / hundert / und (الأرقام الطويلة ما تتكسرش من النص)
const breakable = (esc, word) => esc(word).replace(/(tausend|hundert|und)(?=.)/g, '$1<wbr>');

// ترتيب أنواع الأسئلة: مخلوط، أول سؤال مش الأصعب، ومفيش نوع 3 مرات ورا بعض
function planTypes() {
  const t = shuffle(PLAN);
  if (t[0] === 'write') { const j = t.findIndex(x => x !== 'write'); [t[0], t[j]] = [t[j], t[0]]; }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 2; i < t.length; i++) {
      if (t[i] !== t[i - 1] || t[i] !== t[i - 2]) continue;
      const j = t.findIndex((x, k) => k > i && x !== t[i]);
      if (j > 0) [t[i], t[j]] = [t[j], t[i]];
    }
  }
  return t;
}

// رقم عشوائي على قد المستوى — write دايمًا ≤ 100، big = سؤال من الآلاف (3 أسئلة = 20٪ من اللعبة من الدرس 12)
function pickRaw(tier, type, big) {
  const r = Math.random();
  if (tier === 20) return r < 0.5 ? randInt(11, 20) : randInt(0, 10);           // 11–19 أصعب → بياخدوا نص الأسئلة
  if (tier === 100 || type === 'write') {
    if (r < 0.12) return randInt(0, 12);
    if (r < 0.3) return randInt(13, 19);
    return r < 0.96 ? randInt(21, 99) : 100;
  }
  if (big) {
    const n = randInt(1000, 9999), s = Math.random();
    return s < 0.3 ? Math.floor(n / 100) * 100 : s < 0.5 ? Math.floor(n / 10) * 10 : n;
  }
  if (r < 0.75) { const n = randInt(100, 999); return Math.random() < 0.3 ? Math.floor(n / 10) * 10 : n; }
  return randInt(13, 99);
}
function pickNumber(tier, type, used, big) {
  for (let k = 0; k < 80; k++) {
    const n = pickRaw(tier, type, big);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return pickRaw(tier, type, big);
}

// اختيارات غلط «خبيثة»: 23↔32 · 17↔70 (zehn/zig) · 3↔13↔30 · zwölf↔zwanzig · 300↔3000 · 2400↔4200 · ±1 · ±10
function distractorNums(n, tier) {
  const tricky = [], near = [];
  const add = (arr, m) => { if (Number.isInteger(m) && m >= 0 && m <= 9999 && m !== n && !arr.includes(m)) arr.push(m); };
  const r = n % 100, base = n - r, o = r % 10, t = Math.floor(r / 10);
  if (r >= 21 && o && o !== t) add(tricky, base + o * 10 + t);
  if (r >= 13 && r <= 19) add(tricky, base + o * 10);
  if (r >= 30 && !o) add(tricky, base + t + 10);
  if (r >= 1 && r <= 9) { add(tricky, base + r + 10); if (r >= 2) add(tricky, base + r * 10); }
  if (r === 20) add(tricky, base + 12);
  if (r === 12) add(tricky, base + 20);
  if (r === 11) add(tricky, base + 1);
  if (n >= 100) {
    const h = Math.floor(n / 100) % 10, th = Math.floor(n / 1000);
    if (n < 1000 && !r) add(tricky, n * 10);
    if (th && !(n % 1000)) add(tricky, n / 10);
    if (th && h && th !== h) add(tricky, h * 1000 + th * 100 + r);
    add(near, n + 100); add(near, n - 100);
  }
  add(near, n + 1); add(near, n - 1); add(near, n + 10); add(near, n - 10);
  const out = [], seen = new Set([deNumber(n)]);
  const take = m => { const w = deNumber(m); if (out.length < 3 && !seen.has(w)) { seen.add(w); out.push(m); } };
  shuffle(tricky).forEach(take);
  shuffle(near).forEach(take);
  const hi = tier === 20 ? 20 : tier === 100 ? 100 : Math.max(999, n);
  for (let k = 0; out.length < 3 && k < 60; k++) take(randInt(0, hi));
  return out;
}

// كتابة الرقم بالحروف: الصح بالظبط، أو «تقريبًا» لو الغلط أوملاوت/ß أو مسافات (الرقم بيتكتب كلمة واحدة)
function checkWord(g, n, typed) {
  const forms = numberForms(n);
  const LETTERS = 'صح تقريبًا — خد بالك من الحروف (ä ö ü ß) في الكتابة الصح ☝️';
  const r = g.checkTyped(forms, typed);
  if (r.ok) return { ok: true, almost: r.almost, note: LETTERS };
  const t = normDe(typed).replace(/\s+/g, '');
  const tv = [t, fold(t)];
  for (const f of forms) {
    const s = normDe(f);
    if (s === t) return { ok: true, almost: true, note: 'صح — بس الرقم بيتكتب كلمة واحدة من غير مسافات ☝️' };
    const fv = [s, fold(s), s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')];
    if (tv.some(x => fv.includes(x))) return { ok: true, almost: true, note: LETTERS };
  }
  return { ok: false, almost: false, note: '' };
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
        .then(() => (my === gen && g.alive ? g.say(text, { rate: 0.85 }) : null))
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
  injectCss('numbers', CSS);
  const ml = +g.maxLesson() || 1;
  const tier = ml >= 12 ? 1000 : ml >= 9 ? 100 : 20;
  const types = planTypes();
  // من الدرس 12: 3 أسئلة (مش «اكتب بالحروف») أرقامها آلاف
  const bigAt = new Set(tier === 1000 ? shuffle(types.map((t, k) => (t === 'write' ? -1 : k)).filter(k => k >= 0)).slice(0, 3) : []);
  const used = new Set();
  const voice = makeVoice(g);
  const esc = g.esc;
  const wordP = (word, cls = '', hidden = false) => `<p class="gm-numbers-word ${cls}"${hidden ? ' hidden' : ''}><bdi class="de">${breakable(esc, word)}</bdi></p>`;
  const digitsDiv = n => `<div class="gm-numbers-digits">${n}</div>`;
  const answerHtml = n => `<bdi class="de">${n}</bdi> = <bdi class="de">${breakable(esc, deNumber(n))}</bdi>`;   // <wbr> عشان «siebentausend…» ما تطلعش برّه الشاشة

  // سؤال بيتكتب: digits = الإجابة رقم (لوحة أرقام)، غير كده الرقم بالحروف الألماني
  function askTyped({ n, head, digits, points, listen = false }) {
    return new Promise(resolve => {
      const word = deNumber(n);
      let helped = false, answered = false;
      g.stage.innerHTML = '';
      const q = g.el(`<div class="gm-q gm-numbers-q">${head}</div>`);
      g.stage.appendChild(q);
      const wordEl = q.querySelector('.gm-numbers-word'), helpBtn = q.querySelector('.gm-hint-btn'), note = q.querySelector('.gm-numbers-note');
      const reveal = free => {
        if (wordEl) wordEl.hidden = false;
        if (helpBtn) helpBtn.hidden = true;
        if (!free && !answered) helped = true;
      };
      if (helpBtn) helpBtn.addEventListener('click', () => reveal(false));
      const speak = () => voice.say(word, () => {
        if (answered || !listen) return;
        reveal(true);                                     // مش ذنبه إن الصوت مش شغال → نقط كاملة
        if (note) { note.textContent = '🔇 الصوت الألماني مش شغال هنا — اقرا الكلمة واكتب الرقم'; note.hidden = false; }
      });
      const spk = q.querySelector('.gm-speaker');
      if (spk) spk.addEventListener('click', speak);
      const tb = typeBox(g, {
        placeholder: digits ? 'اكتب الرقم… مثلاً 23' : 'اكتب الرقم بالحروف…',
        umlauts: !digits,
        inputMode: digits ? 'numeric' : 'text',
        onSubmit: async v => {
          let ok, almost = false, okNote = '';
          if (digits) {
            const d = digitsOf(v);
            if (!/^\d+$/.test(d)) { g.toast('اكتب الرقم بالأرقام (زي 23)'); tb.focus(); return; }
            ok = +d === n;
          } else {
            const r = checkWord(g, n, v);
            ok = r.ok; almost = r.almost; okNote = r.note;
          }
          answered = true;
          voice.cancel();
          tb.disable();
          reveal(true);
          if (!listen || !ok) voice.say(word);              // يسمع النطق الصح بعد الإجابة
          let go;
          if (ok) {
            if (almost) q.appendChild(g.el(`<p class="gm-numbers-ok">${esc(okNote)}</p>`));   // الكلمة الصح ظاهرة فوقها
            // «تقريبًا» بيفضل ظاهر أطول عشان يلحق يقرا الكتابة الصح
            go = await g.correct({ points: helped ? Math.round(points / 2) : points, msg: almost ? 'صح تقريبًا 👌' : undefined, ms: almost ? 1900 : undefined });
          } else {
            go = await g.wrong({ correctHtml: answerHtml(n), label: `كتبت: ${v}` });
          }
          resolve(go);
        },
      });
      g.stage.appendChild(tb.el);
      tb.focus();
      if (listen) g.after(300, speak);
    });
  }

  function askChoose(n) {
    return new Promise(resolve => {
      const word = deNumber(n);
      const opts = shuffle([n, ...distractorNums(n, tier)]).map(m => ({ m, correct: m === n, html: `<bdi class="de">${breakable(esc, deNumber(m))}</bdi>` }));
      const long = opts.some(o => deNumber(o.m).length > 13);
      g.stage.innerHTML = '';
      g.stage.appendChild(g.el(`<div class="gm-q gm-numbers-q">
        <span class="gm-numbers-tag">🔤 اختار الكلمة</span>
        <p class="hint">الرقم ده بيتقال إزاي بالألماني؟</p>
        ${digitsDiv(n)}
      </div>`));
      g.stage.appendChild(choiceGrid(g, opts, async o => {
        voice.say(word);
        const go = o.correct
          ? await g.correct({ points: 10 })
          : await g.wrong({ correctHtml: answerHtml(n), label: `اخترت ${o.m}` });
        resolve(go);
      }, { cols: long ? 1 : 2, cls: 'gm-numbers-choices' }));
    });
  }

  const ROUND = {
    listen: n => askTyped({
      n, digits: true, points: 10, listen: true,
      head: `<span class="gm-numbers-tag">🎧 اسمع واكتب</span>
        <button type="button" class="gm-speaker" aria-label="اسمع تاني">🔊</button>
        <p class="hint">اكتب الرقم اللي سمعته بالأرقام</p>
        ${wordP(deNumber(n), 'soft', true)}
        <p class="gm-numbers-note" hidden></p>
        <button type="button" class="btn btn-ghost gm-hint-btn">👁 مش سامع؟ اعرض الكلمة</button>`,
    }),
    read: n => askTyped({
      n, digits: true, points: 10,
      head: `<span class="gm-numbers-tag">👀 اقرا واكتب الرقم</span>
        <p class="hint">الكلمة دي رقم كام؟ اكتبه بالأرقام</p>
        ${wordP(deNumber(n), 'big')}`,
    }),
    write: n => askTyped({
      n, digits: false, points: 15,
      head: `<span class="gm-numbers-tag">✍️ اكتب بالحروف</span>
        <p class="hint">اكتب الرقم ده بالألماني (بالحروف)</p>
        ${digitsDiv(n)}
        ${wordP(deNumber(n), 'soft', true)}`,
    }),
    choose: askChoose,
  };

  let i = 0;
  const next = async () => {
    if (!g.alive) return;
    if (i >= ROUNDS) { g.end({ win: true }); return; }
    const big = bigAt.has(i);
    let type = types[i++];
    if (type === 'listen' && voice.broken) type = Math.random() < 0.5 ? 'read' : 'choose';   // الصوت مش شغال
    const n = pickNumber(tier, type, used, big);
    if (type === 'write' && n > 100) type = 'choose';
    g.setProgress(i - 1, ROUNDS);
    const go = await ROUND[type](n);
    if (go) next();
  };
  next();
}
