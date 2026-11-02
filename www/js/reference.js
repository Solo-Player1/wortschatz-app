// reference.js — 📒 المراجع: الأفعال وتصريفها، أدوات الاستفهام، الحروف الألمانية، الأرقام، شرح الدروس
// #/ref · #/ref/verbs · #/ref/wwords · #/ref/alphabet · #/ref/numbers · #/ref/grammar
import { DATA } from './data.js';
import { esc, el, toast, mixHtml } from './ui.js';
import { play } from './audio.js';
import { speak } from './tts.js';
import { CONTENT, PERSONS, deNumber, grammarOf } from './content.js';
import { sortedLessonNs } from './mastery.js';

const sayBtn = (text, label = 'اسمع') => `<button type="button" class="btn btn-icon sm rf-say" data-say="${esc(text)}" aria-label="${esc(label)}">🔊</button>`;
const back = '<a class="btn btn-ghost rf-back" href="#/ref">→ المراجع</a>';
const lessonChip = n => `<span class="chip">الدرس ${n}</span>`;
const empty = msg => `<section class="card"><div class="empty"><div class="big">📭</div><p>${esc(msg)}</p></div></section>`;

function wire(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-say], [data-w]');
    if (!b) return;
    if (b.dataset.w) { const w = DATA.byId.get(b.dataset.w); if (w) play(w); return; }
    b.classList.add('playing');
    speak(b.dataset.say).then(ok => { b.classList.remove('playing'); if (!ok) toast('الصوت الألماني مش متاح — شوف الإعدادات ← الصوت'); });
  });
}

export function renderRef(root, { page = '' } = {}) {
  // كونتينر جديد كل مرة (الـ #view نفسه بيفضل، فما نركّبش listeners عليه)
  root.innerHTML = '<div class="rf-page"></div>';
  const box = root.firstElementChild;
  switch (page) {
    case 'verbs': verbsPage(box); break;
    case 'wwords': wwordsPage(box); break;
    case 'alphabet': alphabetPage(box); break;
    case 'numbers': numbersPage(box); break;
    case 'grammar': grammarPage(box); break;
    default: indexPage(box);
  }
  wire(box);
}

function indexPage(root) {
  const tile = (href, ico, title, sub, game) => `<div class="card rf-tile"><a class="rf-tile-main" href="${href}"><span class="rf-ico" aria-hidden="true">${ico}</span><div class="grow"><b>${title}</b><p class="muted small">${sub}</p></div><span aria-hidden="true">‹</span></a>${game ? `<a class="btn btn-ghost rf-game" href="${game}">🎮 العب عليها</a>` : ''}</div>`;
  root.innerHTML = `<section class="card tint flat"><h1>📒 المراجع</h1><p class="hint">كل اللي محتاج تبص عليه بسرعة: تصريف الأفعال، أدوات الاستفهام، الحروف، الأرقام، وشرح كل درس — وكل حاجة بالصوت.</p></section>
    ${tile('#/ref/verbs', '🔁', 'الأفعال وتصريفها', `${CONTENT.verbs.length} فعل من الدروس 1–15 — ich / du / er …`, '#/game/verbs')}
    ${tile('#/ref/wwords', '❓', 'أدوات الاستفهام', 'Wie, Was, Wo, Woher, Wer … بأمثلة', '#/game/wfragen')}
    ${tile('#/ref/alphabet', '🔠', 'الحروف الألمانية', 'نطق كل حرف + التهجّي (Buchstabieren)', '#/game/alphabet')}
    ${tile('#/ref/numbers', '🔢', 'الأرقام', 'من 0 لحد 999 999 — اكتب أي رقم واسمعه', '#/game/numbers')}
    ${tile('#/ref/grammar', '📖', 'شرح الدروس', 'القواعد المهمة في كل درس بالمصري', '')}`;
}

function verbsPage(root) {
  const verbs = CONTENT.verbs;
  if (!verbs.length) { root.innerHTML = back + empty('الأفعال لسه ما اتحمّلتش'); return; }
  root.innerHTML = `${back}<section class="card tint flat"><h1>🔁 الأفعال</h1><p class="hint">دوس 🔊 تسمع الفعل مع الضمير. الأفعال الشاذة عليها علامة ⚠️.</p><a class="btn btn-primary btn-big" href="#/game/verbs">🎮 العب «صرّف الفعل»</a></section>
    ${verbs.map(v => `<section class="card rf-verb">
      <div class="row between"><h2><bdi class="de">${esc(v.inf)}</bdi> ${v.type && v.type !== 'regular' ? '<span title="شاذ">⚠️</span>' : ''}</h2>${lessonChip(v.lesson)}</div>
      <p class="hint">${esc(v.ar)}</p>
      <table class="rf-table" dir="ltr"><tbody>${PERSONS.map(p => `<tr><td class="muted">${esc(p.label)}</td><td><b class="de">${esc(v.forms[p.key] || '')}</b></td><td>${sayBtn(`${p.label.split(' / ')[0]} ${v.forms[p.key] || ''}`.replace('…', ''))}</td></tr>`).join('')}</tbody></table>
      ${v.note ? `<p class="small rf-note">💡 ${mixHtml(v.note)}</p>` : ''}
      ${(v.examples || []).map(x => `<div class="rf-ex"><div class="grow"><bdi class="de">${esc(x.de)}</bdi><div class="muted small">${esc(x.ar)}</div></div>${sayBtn(x.de)}</div>`).join('')}
    </section>`).join('')}`;
}

function wwordsPage(root) {
  const ws = CONTENT.wwords;
  if (!ws.length) { root.innerHTML = back + empty('أدوات الاستفهام لسه ما اتحمّلتش'); return; }
  root.innerHTML = `${back}<section class="card tint flat"><h1>❓ أدوات الاستفهام</h1><p class="hint">السؤال بيبدأ بأداة الاستفهام وبعدها الفعل على طول: <bdi class="de">Wie heißt du?</bdi></p><a class="btn btn-primary btn-big" href="#/game/wfragen">🎮 العب «أدوات الاستفهام»</a></section>
    ${ws.map(w => `<section class="card rf-w">
      <div class="row between"><h2><bdi class="de">${esc(w.w)}</bdi> ${sayBtn(w.w)}</h2>${lessonChip(w.lesson)}</div>
      <p><b>${esc(w.ar)}</b>${w.use ? ` — <span class="muted">${mixHtml(w.use)}</span>` : ''}</p>
      ${(w.examples || []).map(x => `<div class="rf-ex"><div class="grow"><bdi class="de">${esc(x.de)}</bdi><div class="muted small">${esc(x.ar)}</div></div>${sayBtn(x.de)}</div>`).join('')}
    </section>`).join('')}`;
}

function alphabetPage(root) {
  const letters = (CONTENT.alphabet && CONTENT.alphabet.letters) || [];
  if (!letters.length) { root.innerHTML = back + empty('الحروف لسه ما اتحمّلتش'); return; }
  const wordOf = de => DATA.words.find(w => w.file && (w.k === 'noun' ? `${w.art} ${w.sg}` : w.de) === de);
  root.innerHTML = `${back}<section class="card tint flat"><h1>🔠 الحروف الألمانية</h1><p class="hint">دوس على أي حرف تسمع اسمه بالألماني — ده اللي بتستخدمه لما تتهجّى اسمك: <bdi class="de">Wie schreibt man das?</bdi></p><a class="btn btn-primary btn-big" href="#/game/alphabet">🎮 العب «الحروف»</a></section>
    <div class="rf-letters">${letters.map(L => `<button type="button" class="card rf-letter" data-say="${esc(L.name)}"><b class="de">${esc(L.ch)}</b><span class="de small">${esc(L.name)}</span><span class="muted small">${esc(L.say || '')}</span></button>`).join('')}</div>
    <section class="card"><h2 class="sec-title">أمثلة</h2><div class="list">${letters.filter(L => L.word && L.word.de).map(L => { const w = wordOf(L.word.de); return `<div class="list-item"><b class="de rf-l">${esc(L.ch)}</b><div class="grow"><bdi class="de">${esc(L.word.de)}</bdi><div class="muted small">${esc(L.word.ar || '')}</div></div>${w ? `<button type="button" class="btn btn-icon sm" data-w="${esc(w.id)}" aria-label="اسمع">🔊</button>` : sayBtn(L.word.de)}</div>`; }).join('')}</div></section>`;
}

function numbersPage(root) {
  const row = n => `<div class="rf-num" data-say="${esc(deNumber(n))}" role="button" tabindex="0"><b class="n">${n}</b><bdi class="de">${esc(deNumber(n))}</bdi></div>`;
  const range = (a, b, s = 1) => { const r = []; for (let i = a; i <= b; i += s) r.push(i); return r; };
  root.innerHTML = `${back}<section class="card tint flat"><h1>🔢 الأرقام</h1><p class="hint">الأحاد قبل العشرات: ٢١ = <bdi class="de">einundzwanzig</bdi> (واحد و عشرين). دوس على أي رقم تسمعه.</p><a class="btn btn-primary btn-big" href="#/game/numbers">🎮 العب «الأرقام»</a></section>
    <section class="card"><h2 class="sec-title">اكتب أي رقم</h2>
      <div class="row rf-try"><input class="input" id="numIn" type="number" inputmode="numeric" min="0" max="999999" value="2026" dir="ltr"><button type="button" class="btn btn-primary" id="numSay">🔊</button></div>
      <p class="rf-out" dir="ltr"><bdi class="de" id="numOut">${esc(deNumber(2026))}</bdi></p></section>
    <section class="card"><h2 class="sec-title">0 – 20</h2><div class="rf-nums">${range(0, 20).map(row).join('')}</div></section>
    <section class="card"><h2 class="sec-title">العشرات</h2><div class="rf-nums">${range(30, 90, 10).map(row).join('')}${[21, 32, 45, 58, 67, 99].map(row).join('')}</div></section>
    <section class="card"><h2 class="sec-title">المية والألف</h2><div class="rf-nums">${[100, 101, 115, 200, 350, 999, 1000, 2026, 10000].map(row).join('')}</div></section>`;
  const inp = root.querySelector('#numIn'), out = root.querySelector('#numOut');
  const upd = () => { out.textContent = deNumber(Math.max(0, Math.min(999999, +inp.value || 0))); };
  inp.addEventListener('input', upd);
  root.querySelector('#numSay').addEventListener('click', () => { upd(); speak(out.textContent); });
}

function grammarPage(root) {
  const ns = sortedLessonNs().filter(n => grammarOf(n).length);
  if (!ns.length) { root.innerHTML = back + empty('الشرح لسه ما اتحمّلش'); return; }
  root.innerHTML = `${back}<section class="card tint flat"><h1>📖 شرح الدروس</h1><p class="hint">أهم القواعد في كل درس — مختصرة وبأمثلة بالصوت.</p></section>
    ${ns.map(n => `<details class="card rf-g"${ns[0] === n ? ' open' : ''}><summary><b>الدرس ${n}</b> <span class="muted small"><bdi class="de">${esc((DATA.lessons.find(l => l.n === n) || {}).title || '')}</bdi></span></summary>${grammarHtml(n)}</details>`).join('')}`;
}

// بيستخدمه screens.js كمان (كارت «شرح الدرس» في صفحة الدرس)
export function grammarHtml(n) {
  return grammarOf(n).map(p => `<div class="rf-point">
    <h3>${mixHtml(p.h)}</h3>
    <p>${mixHtml(p.body)}</p>
    ${p.table && p.table.length ? `<table class="rf-table rf-gtable" dir="ltr"><tbody>${p.table.map((r, i) => `<tr>${r.map(c => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>` : ''}
    ${(p.examples || []).map(x => `<div class="rf-ex"><div class="grow"><bdi class="de">${esc(x.de)}</bdi><div class="muted small">${mixHtml(x.ar)}</div></div>${sayBtn(x.de)}</div>`).join('')}
  </div>`).join('');
}
export { wire as wireRefSay };
export function refCardEl(html) { return el(html); }
