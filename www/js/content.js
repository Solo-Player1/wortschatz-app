// content.js — محتوى الجمل وأدوات الاستفهام والأفعال والشرح والحروف (data/content.json)
// بيتولّد بـ tools/build_content.py من فولدر content/. لو الملف مش موجود كل الدوال بترجّع قوايم فاضية
export const CONTENT = {
  ready: false, version: 0,
  sentences: [], byId: new Map(),
  wfragen: [], grammar: {}, verbs: [], wwords: [],
  alphabet: { letters: [], spelling: [] },
};

let loading = null;
export function loadContent() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const r = await fetch('data/content.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('content.json ' + r.status);
      const j = await r.json();
      CONTENT.version = j.version || 0;
      CONTENT.sentences = (j.sentences || []).filter(s => s && s.id && s.de);
      CONTENT.wfragen = (j.wfragen || []).filter(q => q && q.id && q.q);
      CONTENT.grammar = j.grammar || {};
      CONTENT.verbs = (j.verbs || []).filter(v => v && v.inf && v.forms);
      CONTENT.wwords = j.wwords || [];
      CONTENT.alphabet = j.alphabet || { letters: [], spelling: [] };
      CONTENT.byId = new Map();
      for (const s of CONTENT.sentences) CONTENT.byId.set(s.id, s);
      for (const q of CONTENT.wfragen) CONTENT.byId.set(q.id, q);
    } catch (e) {
      console.warn('[content] could not load content.json:', e && e.message || e);
    }
    CONTENT.ready = true;
    return CONTENT;
  })();
  return loading;
}

const upTo = (list, n) => (n ? list.filter(x => (x.lesson | 0) <= n) : list.slice());
const of = (list, n) => list.filter(x => (x.lesson | 0) === +n);

export const sentencesOf = n => of(CONTENT.sentences, n);
export const sentencesUpTo = n => upTo(CONTENT.sentences, n);
export const wfragenOf = n => of(CONTENT.wfragen, n);
export const wfragenUpTo = n => upTo(CONTENT.wfragen, n);
export const verbsOf = n => of(CONTENT.verbs, n);
export const verbsUpTo = n => upTo(CONTENT.verbs, n);
export const grammarOf = n => CONTENT.grammar[n] || CONTENT.grammar[String(n)] || [];
export const itemById = id => CONTENT.byId.get(id);

// البلاطات = الجملة مقسومة على المسافات (الترقيم لازق في الكلمة)
export const tilesOf = s => (s && (s.tiles || String(s.de).split(' '))) || [];

// تصريف الفعل: المفتاح → الضمير اللي بيتعرض
export const PERSONS = [
  { key: 'ich', label: 'ich', ar: 'أنا' },
  { key: 'du', label: 'du', ar: 'إنت/إنتي' },
  { key: 'er', label: 'er / sie / es', ar: 'هو/هي' },
  { key: 'wir', label: 'wir', ar: 'إحنا' },
  { key: 'ihr', label: 'ihr', ar: 'إنتوا' },
  { key: 'sie', label: 'sie / Sie', ar: 'هما / حضرتك' },
];

// ---------- الأرقام بالألماني (0 … 999 999) ----------
const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

function under100(n, inCompound) {
  if (n === 1) return inCompound ? 'ein' : 'eins';
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return o ? `${o === 1 ? 'ein' : ONES[o]}und${TENS[t]}` : TENS[t];
}
function under1000(n, inCompound) {
  const h = Math.floor(n / 100), r = n % 100;
  let s = h ? `${h === 1 ? '' : ONES[h]}hundert` : '';
  if (r) s += under100(r, inCompound);     // 101 = hunderteins، بس 101 000 = hunderteintausend
  return s;
}
export function deNumber(n) {
  n = Math.floor(+n);
  if (!Number.isFinite(n) || n < 0 || n > 999999) return String(n);
  if (n === 0) return 'null';
  const th = Math.floor(n / 1000), r = n % 1000;
  let s = th ? `${th === 1 ? '' : under1000(th, true)}tausend` : '';
  if (r) s += under1000(r, false);
  return s;
}
// صيغ مقبولة للرقم (einhundert = hundert …)
export function numberForms(n) {
  const base = deNumber(n);
  const forms = new Set([base]);
  if (/^hundert/.test(base)) forms.add('ein' + base);
  if (/^tausend/.test(base)) forms.add('ein' + base);
  return [...forms];
}
