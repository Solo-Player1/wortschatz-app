// بيانات الدروس والكلمات — بتتحمل مرة واحدة عند التشغيل
export const DATA = { version: 0, lessons: [], words: [], byId: new Map(), translit: {} };

export async function loadData() {
  const r = await fetch('data/lessons.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('lessons.json ' + r.status);
  const j = await r.json();
  DATA.version = j.version || 0;
  DATA.lessons = j.lessons || [];
  DATA.words = j.words || [];
  DATA.byId = new Map(DATA.words.map(w => [w.id, w]));
  try {
    const t = await fetch('data/translit.json', { cache: 'no-cache' });
    if (t.ok) DATA.translit = await t.json();
  } catch (e) { DATA.translit = {}; }
  return DATA;
}

export const lessonOf = n => DATA.lessons.find(l => l.n === +n);

export function wordsOfLesson(n) {
  const l = lessonOf(n);
  return l ? l.words.map(id => DATA.byId.get(id)).filter(Boolean) : [];
}

// الكلمة اللي بتتعرض: الاسم مع أداته من غير الجمع، وباقي الأنواع زي ما هي
export function displayDe(w) {
  if (!w) return '';
  if (w.k === 'noun' && w.sg) return `${w.art} ${w.sg}`;
  return (w.de || '').replace(/^\((etwas|jemanden|jemandem)\)\s*/, '').trim();
}

export const pluralOf = w => (w && w.k === 'noun' && w.pl) ? w.pl : '';

export const audioUrl = w => (w && w.file) ? 'audio/' + w.file : '';

export const translitOf = w => (w && DATA.translit[w.id]) || '';

// الدرس الأول اللي الكلمة فيه (للترتيب)
export const firstLesson = w => (w.lessons && w.lessons[0]) || 99;
