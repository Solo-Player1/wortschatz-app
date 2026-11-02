// exercises.js — توليد التمارين + تصحيح الإجابات (من غير DOM علشان يشتغل في node كمان)
import { DATA, displayDe, pluralOf, audioUrl, translitOf } from './data.js';
import { store } from './store.js';

export const TYPES = ['intro', 'mcq_de_ar', 'mcq_ar_de', 'listen', 'article', 'plural', 'type'];
export const ARTICLES = ['der', 'die', 'das'];

// ---------- أدوات صغيرة (نسخة محلية علشان ui.js محتاج window) ----------
export function shuffle(a) {
  const r = (a || []).slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ART_CLASS = { der: 'art-der', die: 'art-die', das: 'art-das' };

const isNoun = w => !!(w && w.k === 'noun' && w.art && w.sg);
const hasPlural = w => isNoun(w) && !!w.pl;
const hasAudio = w => !!(w && w.file);

// نفس مخرجات ui.deHtml بالظبط (أداة ملوّنة جوه <bdi class="de">)
export function deMarkup(w, { big = false } = {}) {
  if (!w) return '';
  const cls = big ? 'de de-big' : 'de';
  if (isNoun(w)) return `<bdi class="${cls}"><span class="art ${ART_CLASS[w.art] || ''}">${esc(w.art)}</span> ${esc(w.sg)}</bdi>`;
  const text = (w.de || '').replace(/^\((etwas|jemanden|jemandem)\)\s*/, '');
  return `<bdi class="${cls}">${esc(text)}</bdi>`;
}
// الاسم من غير أداته (لتمرين الأداة)
const bareNounMarkup = (w, big) => `<bdi class="${big ? 'de de-big' : 'de'}">${esc(w.sg)}</bdi>`;

// ---------- تطبيع النصوص للمقارنة ----------
// عربي: نشيل التشكيل والتطويل وعلامات الترقيم في الآخر
export function normAr(s) {
  return String(s == null ? '' : s)
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[\s!.؟?…،,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
// ألماني: حروف صغيرة، من غير ترقيم ولا أبوستروف ولا شرطة، مسافات مضبوطة
export function normDe(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘´`'\-]/g, '')
    .replace(/[.,!?…;:"„“”«»()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// طيّ الأوملاوت: ä→ae ö→oe ü→ue ß→ss
export const fold = s => String(s == null ? '' : s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

// ---------- معاني «قريبة» (عشان الإجابة الصح ما تطلعش ضمن الاختيارات الغلط) ----------
// المعنى العربي مقسوم لأجزاء: من غير تشكيل ولا (…)، وكل جزء = كلمات · أبي/بابا = أب، أمي/ماما = أم
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const AR_SAME = { 'ابي': 'اب', 'بابا': 'اب', 'امي': 'ام', 'ماما': 'ام' };
export function arParts(ar) {
  return String(ar || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .split(/[،,؛;/]|\s+أو\s+/)
    .map(s => s.replace(/[!.؟?…:"«»]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(s => s.split(' ').map(t => (t.length > 3 && t.startsWith('ال') ? t.slice(2) : t)).map(t => AR_SAME[t] || t));
}
// معنيين «قريبين» لو فيه جزء من واحد جوه جزء من التاني (هاتف / هاتف محمول، لا / لا، كلّا …)
const within = (a, b) => a.every(t => b.includes(t));
export function sameMeaning(ar1, ar2) {
  const A = arParts(ar1), B = arParts(ar2);
  return A.some(a => B.some(b => within(a, b) || within(b, a)));
}
// كلمات معناها واحد والعربي بتاعها مختلف خالص — بتتقبل في الكتابة وعمرها ما تبقى اختيار غلط
const SAME_DE = [['papa', 'vater'], ['mama', 'mutter'], ['keine ahnung', 'ich weiß es nicht'], ['hallo', 'hi', 'hey'], ['herzlich willkommen', 'willkommen']];
const coreDe = w => normDe(isNoun(w) ? w.sg : displayDe(w));
export function synonymPair(a, b) {
  if (!a || !b) return false;
  const x = coreDe(a), y = coreDe(b);
  return x !== y && SAME_DE.some(gr => gr.includes(x) && gr.includes(y));
}
// للمشتّتات واللوحات: نفس المعنى تقريبًا أو مترادفين
export const sameWord = (a, b) => !!(a && b) && (sameMeaning(a.ar, b.ar) || synonymPair(a, b));

const KIND_AR = { noun: 'اسم', verb: 'فعل', phrase: 'جملة', word: 'كلمة' };

// ---------- اختيار نوع التمرين حسب الصندوق ----------
export function pickType(word, state) {
  if (!word) return 'mcq_de_ar';
  const s = state || {};
  if (!(s.seen > 0)) return 'intro';
  const box = s.box | 0;
  const noun = isNoun(word);
  const others = () => {
    const pool = ['mcq_ar_de'];
    if (hasAudio(word)) pool.push('listen');
    if (noun) pool.push('article');
    if (hasPlural(word)) pool.push('plural');
    return pick(pool);
  };
  if (box <= 1) {
    if (noun && Math.random() < 0.3) return 'article';
    return Math.random() < 0.5 ? 'mcq_de_ar' : 'mcq_ar_de';
  }
  if (box <= 3) return others();
  const settings = (store.state && store.state.settings) || {};
  if (settings.typing !== false && Math.random() < 0.5) return 'type';
  return others();
}

// لو النوع مش مناسب للكلمة (جمع لاسم من غير جمع مثلاً) نرجّع نوع بديل
export function fallbackType(word, type) {
  if (!TYPES.includes(type)) return 'mcq_de_ar';
  if (type === 'plural' && !hasPlural(word)) return isNoun(word) ? 'article' : 'mcq_ar_de';
  if (type === 'article' && !isNoun(word)) return 'mcq_ar_de';
  if (type === 'listen' && !hasAudio(word)) return 'mcq_ar_de';
  return type;
}

// ---------- المشتّتات (الاختيارات الغلط) ----------
// نفس النوع ونفس الدرس أولاً، بعدين نفس النوع، بعدين نفس الدرس، بعدين أي كلمة
function pickDistractors(word, n, { text, key, skip }) {
  const used = new Set([key(text(word))]);
  const tiers = [[], [], [], []];
  const myLessons = new Set(word.lessons || []);
  for (const w of DATA.words) {
    if (!w || w.id === word.id) continue;
    const t = text(w);
    if (!t) continue;
    if (skip && skip(w, t)) continue;
    const sameKind = w.k === word.k;
    const sameLesson = (w.lessons || []).some(l => myLessons.has(l));
    tiers[sameKind && sameLesson ? 0 : sameKind ? 1 : sameLesson ? 2 : 3].push(w);
  }
  const out = [];
  for (const tier of tiers) {
    for (const w of shuffle(tier)) {
      const k = key(text(w));
      if (!k || used.has(k)) continue;
      used.add(k);
      out.push(w);
      if (out.length >= n) return out;
    }
  }
  return out;
}

const mcqOptions = (correctText, distractors, isDe, text) => shuffle([
  { text: correctText, isDe, correct: true },
  ...distractors.map(w => ({ text: text(w), isDe, correct: false })),
]);

// مشتّتات بالعربي (للسؤال: الكلمة الألمانية يعني إيه؟)
function arDistractors(word, n) {
  const myDe = normDe(displayDe(word));
  // نفس الكلمة الألمانية بمعنى تاني (sie = هي / هم) أو معنى قريب (أب / بابا، أبي) تبقى إجابة صح برضه → نستبعدها
  return pickDistractors(word, n, { text: w => w.ar, key: normAr, skip: w => normDe(displayDe(w)) === myDe || sameWord(w, word) });
}
// مشتّتات بالألماني (للسؤال: إيه الكلمة بالألماني؟ / اسمع)
function deDistractors(word, n) {
  // كلمة بنفس المعنى العربي (Hallo!/Hey! = مرحباً!، Papa / Vater) تبقى صح برضه → نستبعدها
  return pickDistractors(word, n, { text: displayDe, key: normDe, skip: w => sameWord(w, word) });
}

// ---------- جموع غلط (مولَّدة من أنماط، عمرها ما تساوي الجمع الحقيقي) ----------
function umlautize(sg) {
  // آخر حرف علّة صغير a/o/u (أو au) يتحوّل لأوملاوت — الحرف الكبير الأول بنسيبه
  const rest = sg.slice(1);
  let i = -1;
  for (let k = rest.length - 1; k >= 0; k--) if ('aou'.includes(rest[k])) { i = k; break; }
  if (i < 0) return null;
  let out;
  if (rest[i] === 'u' && i > 0 && rest[i - 1] === 'a') out = rest.slice(0, i - 1) + 'äu' + rest.slice(i + 1);   // Haus → Häus
  else out = rest.slice(0, i) + { a: 'ä', o: 'ö', u: 'ü' }[rest[i]] + rest.slice(i + 1);
  return sg[0] + out;
}

export function wrongPlurals(word, n = 2) {
  const sg = word.sg || '';
  const realKey = normDe(word.pl || '');
  const allReal = new Set(DATA.words.filter(hasPlural).map(w => normDe(w.pl)));
  const cands = [];
  const add = s => {
    if (!s) return;
    const t = 'die ' + s, k = normDe(t);
    if (!k || k === realKey || allReal.has(k) || cands.some(c => normDe(c) === k)) return;
    cands.push(t);
  };
  const um = umlautize(sg);
  const plusN = /n$/.test(sg) ? null : sg + 'n';     // مش هنعمل "Ladenn"
  const plusS = /s$/.test(sg) ? null : sg + 's';     // ولا "Passs"
  if (/in$/.test(sg) && realKey === normDe('die ' + sg + 'nen')) {       // Freundin → Freundinnen (الغلط الشائع: -inen)
    add(sg + 'en'); add(plusS); add(sg); add(sg + 'e');
  } else if (/e$/.test(sg)) {                                              // Familie → Familien
    add(plusN); add(plusS); add(sg); add(sg.slice(0, -1) + 'en'); add(sg + 'r');
  } else if (/um$/.test(sg)) {                                             // Museum → Museen
    add(sg.slice(0, -2) + 'en'); add(plusS); add(sg + 'e'); add(sg); add(sg + 'en');
  } else if (/[aoiuyé]$/.test(sg)) {                                       // Auto → Autos / Taxi → Taxis
    add(sg); add(sg + 'en'); add(plusN); add(sg + 'e'); add(plusS);
  } else if (/(er|el|en)$/.test(sg)) {                                     // Vater → Väter / Computer → Computer
    add(sg); add(plusN); add(plusS); add(sg + 'e'); add(sg + 'en'); add(um); add(um ? um + 'e' : null);
  } else {                                                                 // Tisch → Tische / Mann → Männer
    add(sg + 'e'); add(sg + 'en'); add(sg + 'er'); add(plusS); add(sg); add(um ? um + 'e' : null); add(um ? um + 'er' : null); add(plusN);
  }
  if (cands.length < n) for (const suf of ['e', 'en', 'er', 's', 'n', '', 'se', 'ns']) add(sg + suf);
  // نختار من أول 4 مرشّحين (الأقرب للطبيعي) بشكل عشوائي
  return shuffle(cands.slice(0, Math.max(n, 4))).slice(0, n);
}

// ---------- الإجابة المتوقّعة في تمرين الكتابة ----------
export function typeAnswer(word) {
  if (isNoun(word)) return { answer: word.sg, accept: [`${word.art} ${word.sg}`] };
  const de = String(word.de || '');
  const marker = (de.match(/^\(([^)]*)\)\s*/) || [])[1];                        // (etwas) / (das)
  const base = de.replace(/^\([^)]*\)\s*/, '').replace(/[\s.!?…,;:]+$/g, '').trim();
  const accept = [];
  if (marker) accept.push(`${marker} ${base}`);                                   // etwas lernen / das Deutsch
  const m = base.match(/^(?:(?:mit|bei|an|auf|für|über|von|zu)\s+)?(?:etwas|jemanden|jemandem|jemand|sich)(?:\/(?:etwas|jemanden|jemandem))?\s+(.+)$/i);
  if (m && m[1]) accept.push(m[1]);                                               // etwas suchen → suchen
  return { answer: base, accept };
}

// ---------- بناء التمرين ----------
export function makeExercise(word, type = 'mcq_de_ar') {
  if (typeof word === 'string') word = DATA.byId.get(word);
  if (!word) throw new Error('makeExercise: unknown word');
  type = fallbackType(word, type);
  const ex = { type, id: word.id, word, prompt: {} };
  switch (type) {
    case 'intro':
      ex.prompt = { de: deMarkup(word, { big: true }), ar: word.ar, audio: audioUrl(word), translit: translitOf(word), hint: KIND_AR[word.k] || '' };
      break;
    case 'mcq_de_ar':
      ex.prompt = { de: deMarkup(word, { big: true }), audio: audioUrl(word), translit: translitOf(word), hint: 'يعني إيه؟' };
      ex.options = mcqOptions(word.ar, arDistractors(word, 3), false, w => w.ar);
      break;
    case 'mcq_ar_de':
      ex.prompt = { ar: word.ar, hint: 'إيه الكلمة بالألماني؟' };
      ex.options = mcqOptions(displayDe(word), deDistractors(word, 3), true, displayDe);
      break;
    case 'listen':
      ex.prompt = { audio: audioUrl(word), hint: 'اسمع واختار اللي سمعته' };
      ex.options = mcqOptions(displayDe(word), deDistractors(word, 3), true, displayDe);
      break;
    case 'article':
      ex.prompt = { de: bareNounMarkup(word, true), ar: word.ar, hint: 'der ولا die ولا das؟' };
      ex.options = ARTICLES.map(a => ({ text: a, isDe: true, correct: a === word.art }));   // ترتيب ثابت زي الزراير الملوّنة
      break;
    case 'plural':
      ex.prompt = { de: deMarkup(word, { big: true }), ar: word.ar, hint: 'إيه الجمع؟' };
      ex.options = mcqOptions(pluralOf(word), wrongPlurals(word, 2), true, s => s);
      break;
    case 'type': {
      const { answer, accept } = typeAnswer(word);
      ex.prompt = { ar: word.ar, hint: isNoun(word) ? 'اكتب الاسم بالألماني بأداته (der / die / das)' : 'اكتبها بالألماني' };
      ex.answer = answer;
      // كلمة تانية ليها نفس المعنى بالعربي (Hallo / Hi، Papa / Vater) = إجابة صح برضه
      const key = normAr(word.ar);
      for (const x of DATA.words) {
        if (x.id === word.id || (normAr(x.ar) !== key && !synonymPair(x, word))) continue;
        const t = typeAnswer(x);
        accept.push(t.answer, ...t.accept);
      }
      ex.accept = accept;
      break;
    }
  }
  return ex;
}

// ---------- التصحيح ----------
function gradeTyped(ex, answer) {
  const w = ex.word || {};
  const correctText = isNoun(w) ? `${w.art} ${w.sg}` : (ex.answer || '');
  const typed = normDe(answer);
  if (!typed) return { ok: false, correctText };
  const targets = [ex.answer].concat(ex.accept || []).map(normDe).filter(Boolean);
  // الأول نجرّب زي ما كتب، وبعدين من غير الأداة لو كتبها
  const m = typed.match(/^(der|die|das)\s+(.+)$/);
  const variants = m ? [typed, m[2]] : [typed];
  let hit = null;
  for (const v of variants) if (targets.includes(v)) { hit = v; break; }
  let note;
  if (!hit) {
    const foldedTargets = targets.map(fold);
    for (const v of variants) if (foldedTargets.includes(fold(v))) { hit = v; break; }
    if (!hit) return { ok: false, correctText };
    note = `الكتابة الصح: ${correctText}`;
  }
  // اسم اتكتب بأداة غلط → صح بس ننبّهه · من غير أداة → صح بس مش بيتحسب في ✍️ (لازم الأداة)
  if (isNoun(w) && m && hit === m[2] && m[1] !== w.art) note = `خد بالك: الأداة الصح «${w.art}» → ${correctText}`;
  else if (isNoun(w) && !m) note = note ? `${note} — واكتب الأداة كمان عشان تتحسب في ✍️` : `صح — بس اكتب الأداة كمان: ${correctText} (عشان تتحسب في ✍️)`;
  return note ? { ok: true, correctText, note } : { ok: true, correctText };
}

export function gradeAnswer(ex, answer) {
  if (!ex) return { ok: false, correctText: '' };
  if (ex.type === 'type') return gradeTyped(ex, answer);
  if (ex.type === 'intro') return { ok: true, correctText: displayDe(ex.word) };
  const opts = ex.options || [];
  const correct = opts.find(o => o.correct);
  const correctText = correct ? correct.text : '';
  let chosen = null;
  if (typeof answer === 'number') chosen = Number.isInteger(answer) ? opts[answer] : null;
  else if (answer && typeof answer === 'object') chosen = opts.find(o => o === answer) || opts.find(o => o.text === answer.text) || null;
  else if (typeof answer === 'string') {
    const isDe = correct ? correct.isDe : true;
    const norm = isDe ? normDe : normAr;
    chosen = opts.find(o => o.text === answer) || opts.find(o => norm(o.text) === norm(answer)) || null;
    if (!chosen && /^\d+$/.test(answer.trim())) chosen = opts[+answer] || null;    // رقم الاختيار كنص
  }
  return { ok: !!(chosen && chosen.correct), correctText };
}

// ---------- لعبة التوصيل ----------
// 6 أزواج (ألماني/عربي) من غير تكرار في المعنى ولا في الكلمة، العمودين مخلوطين
export function makeMatch(words, n = 6) {
  const chosen = [], usedDe = new Set(), usedAr = new Set();
  const tryAdd = w => {
    if (!w || chosen.length >= n) return;
    const d = normDe(displayDe(w)), a = normAr(w.ar);
    if (!d || !a || usedDe.has(d) || usedAr.has(a) || chosen.some(c => sameWord(c, w))) return;
    usedDe.add(d); usedAr.add(a); chosen.push(w);
  };
  for (const w of shuffle(words || [])) tryAdd(typeof w === 'string' ? DATA.byId.get(w) : w);
  if (chosen.length < n) for (const w of shuffle(DATA.words)) tryAdd(w);       // نكمّل من كل الكلمات
  const pairs = chosen.map(w => ({ id: w.id, de: displayDe(w), ar: w.ar }));
  return {
    pairs,
    left: shuffle(pairs.map(p => ({ id: p.id, text: p.de, isDe: true }))),     // الألماني
    right: shuffle(pairs.map(p => ({ id: p.id, text: p.ar, isDe: false }))),   // العربي
  };
}
