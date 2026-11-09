// online/index.js — سجل ألعاب «العب مع صاحبك»
import { runRace } from './race.js';
import * as build from './games/build.js';
import * as bingo from './games/bingo.js';

const race = (id, title, icon, short, opts) => ({ meta: { id, title, icon, short, coop: false }, start: vs => runRace(vs, opts) });

export const VS_GAMES = [
  race('duel', 'المبارزة', '⚔️', 'نفس السؤال للاتنين — الأسرع صح يكسب الجولة، والغلط بيوديك قلب', { kind: 'duel', mode: 'duel', rounds: 10 }),
  race('war', 'حرب التصريف', '🔥', 'أدوات der/die/das وتصريف الأفعال — الأسرع صح ياخد النقطة', { kind: 'war', mode: 'war', rounds: 12 }),
  race('tug', 'شد الحبل', '🪢', 'كل إجابة صح بتشد الحبل ناحيتك — وصّله لعندك وتكسب', { kind: 'tug', mode: 'tug', rounds: 24 }),
  race('listen', 'سباق اسمع واكتب', '🎧', 'الصوت بيشتغل عند الاتنين — أول واحد يكتب الكلمة صح يكسب', { kind: 'listen', mode: 'listen', rounds: 8 }),
  { meta: { ...build.meta, short: 'لوحة واحدة بينكم — رتّبوا الجملة سوا بالتعاون' }, start: build.start },
  { meta: { ...bingo.meta, short: 'كارت أرقام لكل واحد — اعلّم على اللي اتنادى واكمل صف' }, start: bingo.start },
];

export const vsGame = id => VS_GAMES.find(g => g.meta.id === id) || null;
