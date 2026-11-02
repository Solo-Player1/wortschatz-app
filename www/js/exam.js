// exam.js — 🏁 امتحان الدرس (الوحش) · 👑 امتحان التثبيت بعد ٣ أيام · 🧱 تدريب جمل الدرس (النجمة التالتة)
// كلهم شغّالين على محرّك الألعاب (games/engine.js) بأسئلة rounds.js
import { DATA, wordsOfLesson, lessonOf } from './data.js';
import { el, esc, confetti, shuffle } from './ui.js';
import { addXp } from './srs.js';
import { store } from './store.js';
import { replan } from './notify.js';
import { normDe } from './exercises.js';
import { play } from './audio.js';
import { sentencesOf, wfragenOf, verbsOf, PERSONS, tilesOf } from './content.js';
import { recordExam, itemDone, promoteProven } from './progress.js';
import { lessonStatus, nextStep } from './mastery.js';
import { runGame, injectCss, sfx, synonymsOf } from './games/engine.js';
import { askType, askChoice, askTiles } from './games/rounds.js';

const BOSSES = ['👾', '🐲', '🦖', '👹', '🤖', '🦂', '🐙', '🦈', '🧌', '🐺', '🦇', '🕷️', '🐊', '🦁', '🐉'];
const bossOf = n => BOSSES[(n - 1) % BOSSES.length];

injectCss('exam', `
.ex-res .gm-res-ico { font-size: 64px; }
.ex-steps { display: grid; gap: 8px; margin-top: 12px; text-align: right; }
.ex-step { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--surface-2); font-weight: 600; }
.ex-step.done { background: var(--good-tint); color: var(--good-text); }
.ex-blank { display: inline-block; min-width: 3.2em; border-bottom: 3px solid var(--blue); color: transparent; }
`);

// ---------- بناء الأسئلة ----------
// «Mein Name ist ...» → «Mein Name ist» · «(das) Deutsch» → «Deutsch»
const phraseText = w => String(w.de).replace(/^\([^)]*\)\s*/, '').replace(/\s*(\.\.\.|…)\s*$/u, '').trim();
const isTypeable = w => w.k !== 'phrase' || phraseText(w).split(/\s+/).length === 1;
const phraseAsSentence = w => ({ id: 'p:' + w.id, de: phraseText(w), ar: w.ar, alts: [] });
const tileable = s => tilesOf(s).length >= 2;

function verbItem(v) {
  const p = PERSONS[Math.floor(Math.random() * PERSONS.length)];
  const right = v.forms[p.key];
  const wrong = shuffle([...new Set(Object.values(v.forms))].filter(f => f !== right)).slice(0, 3);
  return { kind: 'verb', v, p, right, opts: shuffle([right, ...wrong]) };
}

function examItems(n, kind) {
  const words = wordsOfLesson(n);
  const sents = sentencesOf(n);
  const wq = wfragenOf(n);
  const verbs = verbsOf(n).filter(v => new Set(Object.values(v.forms)).size >= 2);
  if (kind === 'crown') {
    // تثبيت: ١٠ كلمات كتابة + ٣ جمل + سؤالين
    const items = shuffle(words.filter(isTypeable)).slice(0, 10).map((w, i) => ({ kind: 'word', w, listen: i % 2 === 0 }));
    items.push(...shuffle(sents.filter(tileable)).slice(0, 3).map(s => ({ kind: 'tiles', s })));
    items.push(...shuffle(wq).slice(0, 1).map(q => ({ kind: 'wfrage', q })));
    items.push(...shuffle(sents.filter(s => s.cloze)).slice(0, 1).map(s => ({ kind: 'cloze', s })));
    return shuffle(items);
  }
  // الامتحان: كل كلمة في الدرس مرة (كتابة، أو ترتيب لو جملة) + جمل + استفهام + تصريف
  const wordItems = shuffle(words).map((w, i) => (isTypeable(w) ? { kind: 'word', w, listen: i % 2 === 0 } : { kind: 'tiles', s: phraseAsSentence(w), w }));
  const phraseKeys = new Set(wordItems.filter(it => it.kind === 'tiles').map(it => normDe(it.s.de)));
  const sentItems = shuffle(sents.filter(s => tileable(s) && !phraseKeys.has(normDe(s.de)))).sort((a, b) => itemDone(a.id) - itemDone(b.id)).slice(0, 5).map(s => ({ kind: 'tiles', s }));
  const used = new Set(sentItems.map(it => it.s.id));
  const clozeItems = shuffle(sents.filter(s => s.cloze && !used.has(s.id))).slice(0, 3).map(s => ({ kind: 'cloze', s }));
  const wItems = shuffle(wq).slice(0, 3).map(q => ({ kind: 'wfrage', q }));
  const vItems = shuffle(verbs).slice(0, 3).map(verbItem);
  // نوزّع الجمل وسط الكلمات بالتساوي
  const extras = shuffle([...sentItems, ...clozeItems, ...wItems, ...vItems]);
  const out = [];
  const step = extras.length ? wordItems.length / (extras.length + 1) : Infinity;
  let e = 0;
  wordItems.forEach((it, k) => {
    out.push(it);
    while (e < extras.length && k + 1 >= Math.round(step * (e + 1))) out.push(extras[e++]);
  });
  while (e < extras.length) out.push(extras[e++]);
  return out;
}

function drillItems(n) {
  const items = [
    ...sentencesOf(n).filter(tileable).map(s => ({ kind: 'tiles', s, id: s.id })),
    ...wfragenOf(n).map(q => ({ kind: 'wfrage', q, id: q.id })),
  ];
  const todo = shuffle(items.filter(it => !itemDone(it.id)));
  return todo.length ? todo : shuffle(items);
}

// ---------- سؤال واحد ----------
function blankSentence(s) {
  const word = s.cloze.word;
  let done = false;
  return tilesOf(s).map(t => {
    const core = t.replace(/[.,!?;:…"„“”«»]+/g, '');
    if (!done && core === word) { done = true; return esc(t).replace(esc(word), '<span class="ex-blank">____</span>'); }
    return esc(t);
  }).join(' ');
}

function ask(g, it) {
  switch (it.kind) {
    case 'word': {
      const w = it.w;
      const shared = synonymsOf(w).length > 0;
      const listen = !!w.file && (it.listen || shared);      // نفس المعنى لكلمة تانية → الصوت بيحدد المقصود
      const exp = g.expectedFor(w, { withSynonyms: !listen });
      return askType(g, {
        promptHtml: `<p class="hint center">${listen ? 'اسمع واكتب' : 'اكتبها بالألماني'}${w.k === 'noun' ? ' — المفرد بأداته (der / die / das)' : ''}</p><p class="gm-ar">${esc(w.ar)}</p>`,
        expected: exp.accept, show: exp.show, wordId: w.id,
        audio: listen ? w : null, points: 10,
        placeholder: w.k === 'noun' ? 'der / die / das …' : 'اكتب الكلمة…',
      });
    }
    case 'tiles':
      return askTiles(g, { sentence: it.s, points: 15 });
    case 'cloze': {
      const s = it.s;
      return askChoice(g, {
        promptHtml: `<p class="hint center">كمّل الجملة</p><p class="gm-de-big" dir="ltr"><bdi class="de">${blankSentence(s)}</bdi></p><p class="muted">${esc(s.ar)}</p>`,
        options: shuffle(s.cloze.opts).map(o => ({ html: `<bdi class="de">${esc(o)}</bdi>`, correct: o === s.cloze.word })),
        correctHtml: `<bdi class="de">${esc(s.de)}</bdi>`,
        itemId: s.id, points: 10,
      });
    }
    case 'wfrage': {
      const q = it.q;
      return askChoice(g, {
        promptHtml: `<p class="hint center">أنهي أداة استفهام؟</p><p class="gm-de-big" dir="ltr"><bdi class="de">${esc(q.q).replace('___', '<span class="ex-blank">____</span>')}</bdi></p><p class="muted">${esc(q.ar)}</p>`,
        options: shuffle(q.opts).map(o => ({ html: `<bdi class="de">${esc(o)}</bdi>`, correct: o === q.answer })),
        correctHtml: `<bdi class="de">${esc(q.q.replace('___', q.answer))}</bdi>`,
        itemId: q.id, points: 10,
      });
    }
    case 'verb': {
      const { v, p, right, opts } = it;
      return askChoice(g, {
        promptHtml: `<p class="hint center">صرّف الفعل</p><p class="gm-de-big" dir="ltr"><bdi class="de">${esc(p.label)} ___ <span class="muted">(${esc(v.inf)})</span></bdi></p><p class="muted">${esc(v.ar)}</p>`,
        options: opts.map(o => ({ html: `<bdi class="de">${esc(o)}</bdi>`, correct: o === right })),
        correctHtml: `<bdi class="de">${esc(p.label.split(' / ')[0])} ${esc(right)}</bdi>`,
        itemId: `v:${v.inf}:${p.key}`, points: 10,
      });
    }
    default: return Promise.resolve(true);
  }
}

// ---------- شاشة النتيجة ----------
const daysAr = d => (d === 1 ? 'يوم' : d === 2 ? 'يومين' : `${d} أيام`);
// معاد التثبيت من النهارده (crownIn محسوب من النهارده مش من يوم الامتحان)
const crownWhen = s => (s.crownIn <= 0 ? 'النهارده' : s.crownIn === 1 ? 'بكره' : `بعد ${daysAr(s.crownIn)}`);

function finishScreen(root, n, kind, st, { win, quit, replay }, opts0 = {}) {
  document.body.classList.remove('immersive');
  const answered = st.right + st.wrong;
  const isDrill = kind === 'drill' || kind === 'practice';
  let xp = 0, first = false;
  if (!isDrill && answered) {
    first = recordExam(n, { kind, passed: win, score: st.score }).first;
    if (win) promoteProven(wordsOfLesson(n));
    xp = win ? (first ? (kind === 'crown' ? 80 : 120) : 30) : Math.min(30, Math.round(st.score / 20));
  } else if (isDrill && answered) { xp = Math.min(60, Math.round(st.score / 10)); store.bumpStreak(); }
  if (xp) addXp(xp);
  if (answered) replan();
  const s = lessonStatus(n);
  const step = nextStep(n, s);
  let title, ico, sub;
  if (kind === 'practice') {
    title = quit ? 'وقفت التدريب' : win ? '👍 تدريب التثبيت عدّى' : '💔 لسه محتاج مراجعة';
    ico = '👑';
    sub = s.crown ? 'الدرس واخد التاج 👑 من قبل — ده كان تدريب مراجعة' : `التاج الحقيقي بيتحسب ${crownWhen(s)} — تعالى ساعتها`;
  } else if (isDrill) {
    title = quit ? 'وقفت التدريب — اللي حلّيته اتحسب' : s.star3 && !opts0.star3 ? '🧱 النجمة التالتة بتاعتك!' : win ? 'خلصت التدريب 👏' : '💔 خلصت القلوب';
    ico = '🧱';
    sub = `جمل وأسئلة الدرس: ${s.itemsDone} من ${s.itemsTotal} (المطلوب ${s.itemsNeed})`;
  } else if (kind === 'crown') {
    title = quit ? 'خرجت من امتحان التثبيت' : win ? '👑 الدرس ثابت — مش هتنساه!' : '💔 لسه محتاج مراجعة';
    ico = win ? '👑' : bossOf(n);
    sub = win ? 'كسبت تاج الدرس' : 'راجع الكلمات اللي غلطت فيها وجرّب تاني';
  } else {
    title = quit ? 'خرجت من الامتحان' : win ? (first ? `🏁 الدرس ${n} خلصان!` : `🏁 نجحت تاني في امتحان الدرس ${n}`) : '💔 الوحش كسب المرة دي';
    ico = win ? '🏆' : bossOf(n);
    sub = !win ? 'كل كلمة غلطت فيها رجعت للمراجعة — ذاكرها وجرّب تاني'
      : s.crown ? 'الدرس ثابت 👑 من قبل — المراجعة دي بتثبّته أكتر'
      : s.crownReady ? 'امتحان التثبيت 👑 متاح دلوقتي'
      : `امتحان التثبيت 👑 هيفتح ${crownWhen(s)} عشان نتأكد إنك مش ناسي`;
  }
  const mistakes = st.mistakes.slice(-10);
  const stepRow = (done, icon, label, val) => `<div class="ex-step${done ? ' done' : ''}">${done ? '✅' : icon} ${label}<span class="grow"></span>${val ? `<b class="n">${val}</b>` : ''}</div>`;
  root.innerHTML = '';
  const card = el(`<section class="gm-results ex-res">
    <div class="card gm-res-card ${win ? 'win' : 'lose'}">
      <div class="gm-res-ico" aria-hidden="true">${ico}</div>
      <h1>${esc(title)}</h1>
      <p class="hint">${esc(sub)}</p>
      <div class="row wrap chips-row gm-res-chips">
        <span class="chip good">✓ ${st.right} صح</span><span class="chip bad">✗ ${st.wrong} غلط</span>
        ${xp ? `<span class="chip blue">⭐ +${xp} XP</span>` : ''}
      </div>
      <div class="ex-steps">
        ${stepRow(s.star1, '⭐', 'حفظت الكلمات', `${s.learned}/${s.words}`)}
        ${stepRow(s.star2, '✍️', 'كتبتها صح', `${s.typed}/${s.typeNeed}`)}
        ${stepRow(s.star3, '🧱', 'جمل وأسئلة', `${s.itemsDone}/${s.itemsNeed}`)}
        ${stepRow(s.passed, '🏁', 'امتحان الدرس', '')}
        ${stepRow(s.crown, '👑', `التثبيت${!s.crown && s.passed ? (s.crownReady ? ' (متاح دلوقتي)' : ` (${crownWhen(s)})`) : ''}`, '')}
      </div>
    </div>
    ${mistakes.length ? `<div class="card gm-mistakes"><h2 class="sec-title">راجع اللي غلطت فيه</h2><div class="list">${mistakes.map(m => `<div class="list-item gm-mis">${m.wordId && DATA.byId.get(m.wordId)?.file ? `<button type="button" class="btn btn-icon say" data-w="${esc(m.wordId)}" aria-label="اسمع">🔊</button>` : ''}<div class="grow">${m.html || ''}${m.label ? `<div class="muted small">${esc(m.label)}</div>` : ''}</div></div>`).join('')}</div></div>` : ''}
    <div class="gm-res-actions">
      ${step.href && step.key !== 'wait' && step.key !== 'done' ? `<a class="btn btn-primary btn-big" href="${step.href}">${step.icon} ${esc(step.label)}</a>` : ''}
      ${!win ? '<button type="button" class="btn btn-big" data-act="again">🔁 جرّب تاني</button>' : ''}
      <div class="grid2">
        <a class="btn" href="#/lesson/${n}">📚 الدرس ${n}</a>
        <a class="btn" href="#/home">🏠 الرئيسية</a>
      </div>
    </div>
  </section>`);
  root.appendChild(card);
  if (win) { sfx.win(); confetti(); } else sfx.lose();
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-act], [data-w]');
    if (!b) return;
    if (b.dataset.w) { play(DATA.byId.get(b.dataset.w)); return; }
    if (b.dataset.act === 'again') replay();
  });
}

// ---------- الراوتات ----------
const missing = root => { root.innerHTML = '<section class="card"><div class="empty"><div class="big">🤔</div><p>الدرس ده مش موجود</p></div><a class="btn btn-primary btn-big" href="#/lessons">الدروس</a></section>'; };

export function renderExam(root, { lesson, kind = 'exam' } = {}) {
  const n = +lesson;
  const l = lessonOf(n);
  if (!l) { missing(root); return; }
  const st = lessonStatus(n);
  if (kind === 'crown' && !st.passed) kind = 'exam';
  const crown = kind === 'crown';
  const mod = {
    meta: {
      id: crown ? 'crown' : 'exam',
      title: crown ? `امتحان تثبيت الدرس ${n}` : `امتحان الدرس ${n}`,
      icon: crown ? '👑' : bossOf(n),
      desc: crown
        ? `${l.title} — ${examItems(n, 'crown').length} سؤال من الدرس عشان نتأكد إنك لسه فاكره. ٣ غلطات وتخسر.`
        : `${l.title} — الوحش النهائي: كل كلمة في الدرس لازم تكتبها صح (الأسماء بأداتها) + جمل وأسئلة. عندك ٣ قلوب بس!`,
      how: crown
        ? (st.crown ? ['الدرس ده واخد التاج 👑 خلاص — ده تدريب مراجعة بس', 'تعيده في أي وقت عشان الكلام يفضل ثابت']
          : st.crownReady ? ['عدّى ٣ أيام على الامتحان — وقت التثبيت', 'لو نجحت الدرس ياخد التاج 👑']
          : [`التاج بيتحسب ${crownWhen(st)} — تقدر تتدرّب دلوقتي`, 'التدريب ده مش بيتحسب، بس بيجهّزك للتاج 👑'])
        : ['كل سؤال بتعدّيه بينزّل طاقة الوحش ⚔️', 'كل غلطة بقلب — ٣ غلطات والوحش يكسب', `نجومك دلوقتي: ${'⭐'.repeat(st.stars)}${'☆'.repeat(3 - st.stars)}${st.stars < 3 ? ' — الأحسن تخلّص النجوم الأول' : ' — جاهز!'}`],
      hearts: 3, source: 'none', minItems: 1, unit: 'سؤال',
      count: () => examItems(n, kind).length,
    },
    start(g) {
      const items = examItems(n, kind);
      if (!items.length) { g.end({ win: false }); return; }
      const boss = g.el(`<div class="gm-boss"><span class="gm-boss-ico" aria-hidden="true">${crown ? '👑' : bossOf(n)}</span><div class="bar"><i style="width:100%"></i></div><small class="n">${items.length}/${items.length}</small></div>`);
      g.wrap.insertBefore(boss, g.stage);
      const hp = boss.querySelector('.bar > i'), hpText = boss.querySelector('small'), ico = boss.querySelector('.gm-boss-ico');
      let i = 0;
      const next = async () => {
        if (!g.alive) return;
        if (i >= items.length) { g.end({ win: true }); return; }
        const rightBefore = g.state.right;
        const go = await ask(g, items[i++]);
        const left = items.length - i;
        hp.style.width = `${Math.round((100 * left) / items.length)}%`;
        hpText.textContent = `${left}/${items.length}`;
        if (g.state.right > rightBefore) { ico.classList.remove('hit'); void ico.offsetWidth; ico.classList.add('hit'); }
        if (go) next();
      };
      next();
    },
    finish(root2, st2, opts) {
      // امتحان التثبيت قبل معاده = تدريب بس (ما بيتسجّلش)
      if (crown && !lessonStatus(n).crownReady) { finishScreen(root2, n, 'practice', st2, opts); return; }
      finishScreen(root2, n, kind, st2, opts);
    },
  };
  runGame(root, mod, { lesson: n });
}

export function renderDrill(root, { lesson } = {}) {
  const n = +lesson;
  const l = lessonOf(n);
  if (!l) { missing(root); return; }
  const mod = {
    meta: {
      id: 'drill', title: `جمل الدرس ${n}`, icon: '🧱',
      desc: `${l.title} — كوّن جمل الدرس وجاوب أسئلة الاستفهام. لما تخلّص ٨٠٪ منهم تاخد النجمة التالتة ⭐`,
      how: ['رتّب الكلمات وكوّن الجملة', 'اللي بتحلّه صح بيتحسب ومش بيرجعلك تاني في التدريب', 'عندك ٥ قلوب'],
      hearts: 5, source: 'none', minItems: 1, unit: 'جملة',
      count: () => drillItems(n).length,
    },
    start(g) {
      star3Before = lessonStatus(n).star3;
      const items = drillItems(n);
      if (!items.length) { g.end({ win: true }); return; }
      let i = 0;
      const next = async () => {
        if (!g.alive) return;
        if (i >= items.length) { g.end({ win: true }); return; }
        g.setProgress(i, items.length);
        const go = await ask(g, items[i++]);
        if (go) next();
      };
      next();
    },
    finish(root2, st2, opts) { finishScreen(root2, n, 'drill', st2, opts, { star3: star3Before }); },
  };
  let star3Before = false;
  runGame(root, mod, { lesson: n });
}
