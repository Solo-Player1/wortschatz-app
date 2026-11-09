// online/qgen.js — صاحب الغرفة بيبني الأسئلة من المحتوى المتحمّل، ويبعتها للطرف التاني عن طريق البوّابة،
// فالاتنين يشوفوا نفس الأسئلة بالظبط. البوّابة بتمرّر الداتا من غير ما تقراها.
import { DATA, wordsOfLesson, displayDe } from '../data.js';
import { isSeen } from '../srs.js';
import { studiedUpTo, sortedLessonNs } from '../mastery.js';
import { verbsOf, verbsUpTo, PERSONS, deNumber } from '../content.js';
import { normAr, normDe, sameWord, shuffle } from '../exercises.js';

const ARTS = ['der', 'die', 'das'];
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- حلّ المصدر (درس / اللي ذاكرته / كل الدروس) ----------
export function poolWords(pool, { kinds, needAudio = false, min = 8 } = {}) {
  const ok = w => w && (!kinds || kinds.includes(w.k)) && (!needAudio || !!w.file);
  let list;
  if (pool && pool.kind === 'lesson') {
    const n = +pool.lesson || 1;
    list = wordsOfLesson(n).filter(ok);
    const have = new Set(list.map(w => w.id));
    for (let k = n - 1; list.length < min && k >= 1; k--) for (const w of shuffle(wordsOfLesson(k).filter(x => ok(x) && !have.has(x.id)))) { if (list.length >= min) break; list.push(w); have.add(w.id); }
    for (let k = n + 1; list.length < min && k <= Math.max(...sortedLessonNs(), 1); k++) for (const w of shuffle(wordsOfLesson(k).filter(x => ok(x) && !have.has(x.id)))) { if (list.length >= min) break; list.push(w); have.add(w.id); }
  } else if (pool && pool.kind === 'learned') {
    list = DATA.words.filter(w => ok(w) && isSeen(w.id));
    if (list.length < min) list = poolWords({ kind: 'lesson', lesson: studiedUpTo() }, { kinds, needAudio, min });
  } else {
    list = DATA.words.filter(ok);
  }
  return list;
}

export function poolMaxLesson(pool) {
  return pool && pool.kind === 'lesson' ? (+pool.lesson || 1) : pool && pool.kind === 'learned' ? studiedUpTo() : Math.max(...sortedLessonNs(), 1);
}

// ---------- مشتّتات ----------
function arDistractors(word, n, from) {
  const used = new Set([normAr(word.ar)]);
  const out = [];
  for (const w of shuffle(from)) {
    if (w.id === word.id || sameWord(w, word)) continue;
    const k = normAr(w.ar); if (!k || used.has(k)) continue;
    used.add(k); out.push(w.ar); if (out.length >= n) break;
  }
  return out;
}
function deDistractors(word, n, from) {
  const used = new Set([normDe(displayDe(word))]);
  const out = [];
  for (const w of shuffle(from)) {
    if (w.id === word.id || sameWord(w, word)) continue;
    const k = normDe(displayDe(w)); if (!k || used.has(k)) continue;
    used.add(k); out.push(displayDe(w)); if (out.length >= n) break;
  }
  return out;
}

const mcq = (correct, distractors) => { const opts = shuffle([correct, ...distractors]); return { options: opts, correct: opts.indexOf(correct) }; };

// ---------- أنواع الأسئلة ----------
export function meaningQ(word, from) {               // كلمة ألماني → معناها بالعربي
  const { options, correct } = mcq(word.ar, arDistractors(word, 3, from));
  return { type: 'meaning', wordId: word.id, de: displayDe(word), options, correct };
}
export function listenChoiceQ(word, from) {          // اسمع → اختار الكلمة الألماني
  const { options, correct } = mcq(displayDe(word), deDistractors(word, 3, from));
  return { type: 'listen', wordId: word.id, options, correct };
}
export function articleQ(word) {                     // الاسم من غير أداة → der/die/das
  return { type: 'article', wordId: word.id, de: word.sg, ar: word.ar, options: ARTS.slice(), correct: ARTS.indexOf(word.art) };
}
export function typeWordQ(word) {                    // اسمع واكتب
  const e = expected(word);
  return { type: 'typeword', wordId: word.id, ar: word.ar, accept: e.accept, show: e.show };
}
export function verbQ(v) {                           // صرّف الفعل
  const p = pick(PERSONS);
  const right = v.forms[p.key];
  const wrong = shuffle([...new Set(Object.values(v.forms))].filter(f => f !== right)).slice(0, 3);
  const opts = shuffle([right, ...wrong]);
  return { type: 'verb', inf: v.inf, ar: v.ar, person: p.label, options: opts, correct: opts.indexOf(right) };
}

// نسخة مصغّرة من expectedFor (عشان ما نستوردش الإنجن كله هنا)
function expected(w) {
  if (w.k === 'noun' && w.art && w.sg) return { show: `${w.art} ${w.sg}`, accept: [`${w.art} ${w.sg}`, ...(w.pl ? [`${w.art} ${w.sg}, ${w.pl}`] : [])] };
  const de = String(displayDe(w) || '').replace(/^\((etwas|jemanden|jemandem|das)\)\s*/, '');
  return { show: de, accept: [de] };
}

// ---------- بناء خطة ماتش race (مبارزة/حبل/حرب/سماع) ----------
export function buildRacePlan(kind, pool, rounds) {
  const maxL = poolMaxLesson(pool);
  if (kind === 'war') {        // أدوات + تصريف أفعال
    const nouns = poolWords(pool, { kinds: ['noun'], min: 4 }).filter(w => w.sg && ARTS.includes(w.art));
    const verbs = (pool && pool.kind === 'lesson' ? verbsOf(pool.lesson) : verbsUpTo(maxL)).filter(v => v.forms && new Set(Object.values(v.forms)).size >= 2);
    const qs = [];
    for (let i = 0; i < rounds; i++) {
      const useVerb = verbs.length && (!nouns.length || Math.random() < 0.5);
      qs.push(useVerb ? verbQ(pick(verbs)) : articleQ(pick(nouns)));
    }
    return qs.map((q, i) => ({ ...q, i }));
  }
  if (kind === 'listen') {     // سباق اسمع واكتب
    const words = poolWords(pool, { kinds: ['noun', 'verb', 'word'], needAudio: true, min: 6 });
    return shuffle(words).slice(0, rounds).map((w, i) => ({ ...typeWordQ(w), i }));
  }
  // duel / tug: معاني متلخبطة (معنى + اسمع)
  const words = poolWords(pool, { kinds: ['noun', 'verb', 'word', 'phrase'], min: 6 });
  const from = words.length >= 4 ? words : DATA.words;
  return shuffle(words).slice(0, rounds).map((w, i) => {
    const q = (w.file && Math.random() < 0.4) ? listenChoiceQ(w, from) : meaningQ(w, from);
    return { ...q, i };
  });
}

// ---------- بنجو الأرقام ----------
export function buildBingo(pool, size = 9) {
  const ml = poolMaxLesson(pool);
  const hi = ml >= 12 ? 100 : ml >= 9 ? 100 : ml >= 5 ? 50 : 20;
  const all = [];
  for (let n = 0; n <= hi; n++) all.push(n);
  const cardOf = () => shuffle(all).slice(0, size).sort((a, b) => a - b);
  const a = cardOf(), b = cardOf();
  const union = [...new Set([...a, ...b])];
  const extra = shuffle(all.filter(n => !union.includes(n))).slice(0, 10);
  const calls = shuffle([...union, ...extra]);     // كل أرقام الكروت + كام رقم زيادة، متلخبطين
  return { hostCard: a, guestCard: b, calls, word: n => deNumber(n) };
}
