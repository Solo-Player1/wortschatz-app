// games/index.js — سجل الألعاب. كل لعبة ملف games/<id>.js بيصدّر { meta, start }
// التحميل lazy: الملف بيتحمّل أول ما نحتاجه، ولو ناقص اللعبة بتختفي من غير ما الأبلكيشن يقع
export const GAME_IDS = [
  'listen-write', 'articles', 'scramble', 'sentence', 'wfragen', 'verbs',
  'numbers', 'alphabet', 'truefalse', 'memory', 'cloze', 'rain',
];

const cache = new Map();
export function loadGame(id) {
  if (!GAME_IDS.includes(id)) return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(id, import(`./${id}.js`).then(m => (m && m.meta && typeof m.start === 'function' ? m : null), e => {
      console.warn('[games] could not load', id, e && e.message || e);
      cache.delete(id);
      return null;
    }));
  }
  return cache.get(id);
}
export async function loadAllGames() {
  const mods = await Promise.all(GAME_IDS.map(loadGame));
  return mods.filter(Boolean);
}
