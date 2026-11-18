// reading.js — 📖 قطع القراءة: الكلمات الجديدة الأول (اختبار سريع لازم تعدّيه) ← القطعة (بالصوت) ← تكتب فهمك بالعربي
// ← Gemini يقيّم ويقول فهمت كام في المية + فهمت إيه وفاتك إيه. الترجمة المرجعية مستخبية لحد ما تخلص.
// #/read · #/read/<id>   — البيانات: www/data/passages.json (من reading/passages.json عن طريق tools/build_content.py)
import { DATA, displayDe } from './data.js';
import { store } from './store.js';
import { esc, toast, shuffle } from './ui.js';
import { speak, stopSpeak } from './tts.js';
import { play as playWord } from './audio.js';
import { normDe, sameMeaning } from './exercises.js';
import { studiedUpTo } from './mastery.js';
import { addXp } from './srs.js';
import { evaluateReading, hasGeminiKey, errorText } from './gemini.js';

const URL_ = new URL('../data/passages.json', import.meta.url);
let P = null, pPromise = null;
export function loadPassages() {
  if (P) return Promise.resolve(P);
  if (!pPromise) pPromise = fetch(URL_).then(r => { if (!r.ok) throw new Error('passages.json ' + r.status); return r.json(); })
    .then(j => { P = j; return j; }).catch(e => { pPromise = null; throw e; });
  return pPromise;
}
const rec = id => {
  const r = (store.state.reading ||= {});
  return r[id] || (r[id] = { best: null, last: null, tries: 0, words: false, done: false });
};
const scoreClass = s => (s >= 80 ? 'good' : s >= 50 ? 'warn' : 'bad');
const MIN_CHARS = 15;
const SELF_LABEL = { 90: 'فهمت كله تقريبًا', 60: 'فهمت أغلبه', 30: 'فهمت شوية' };   // تقييمك لنفسك (من غير Gemini)
// «der Mann (= جوز)» → «der Mann»: الملحوظة مش جزء من الكلمة (وفي الاختبار كانت بتفضح الإجابة)
const bare = s => String(s || '').replace(/\s*\(=[^)]*\)/g, '').trim();

function loading(root, msg = 'ثواني…') {
  root.innerHTML = `<section class="card"><div class="empty"><div class="big">📖</div><p>${esc(msg)}</p></div></section>`;
}

let seq = 0;                                  // توكن لكل رسمة: لو الصفحة اتغيّرت قبل ما القطع توصل → ما نرسمش فوق الصفحة الجديدة
export function renderRead(root, arg) {
  stopSpeak();
  loading(root);
  const my = ++seq, hash = location.hash, alive = () => my === seq && location.hash === hash;
  loadPassages().then(j => { if (!alive()) return; arg ? passagePage(root, j, arg) : listPage(root, j); })
    .catch(() => { if (alive()) root.innerHTML = '<section class="card"><div class="empty"><div class="big">📭</div><p>مش قادر أفتح القطع — جرّب تاني</p></div></section>'; });
}

// ---------------------------------------------------------------- القايمة
function listPage(root, j) {
  const up = studiedUpTo();
  const levels = j.levels || {};
  const byLevel = new Map();
  for (const p of j.passages) { if (!byLevel.has(p.level)) byLevel.set(p.level, []); byLevel.get(p.level).push(p); }
  const doneN = j.passages.filter(p => rec(p.id).done).length;
  root.innerHTML = `<section class="card tint flat rd-head">
      <h1>📖 قطع القراءة</h1>
      <p class="hint">اتعلم كلمات القطعة الجديدة الأول، اقراها، واكتب بالعربي فهمت إيه — <b>Gemini</b> بيقولك فهمت كام في المية وفاتك إيه.</p>
      <div class="row wrap chips-row"><span class="chip blue">${doneN}/${j.passages.length} خلصتهم</span>
        ${hasGeminiKey() ? '<span class="chip good">🤖 Gemini جاهز</span>' : '<a class="chip warn" href="#/settings">🤖 حط مفتاح Gemini من الإعدادات</a>'}</div>
    </section>
    ${[...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([lv, ps]) => `<section class="card rd-level">
      <h2 class="sec-title">المستوى ${lv} <span class="muted small">${esc(String(levels[lv] || '').replace('Lektionen', 'دروس'))}</span></h2>
      <div class="list">${ps.map(p => {
        const r = rec(p.id), later = p.lesson > up;
        return `<a class="list-item link rd-item${r.done ? ' done' : ''}" href="#/read/${esc(p.id)}">
          <span class="rd-ico" aria-hidden="true">${r.done ? '✅' : later ? '🔒' : '📄'}</span>
          <div class="grow"><b><bdi class="de">${esc(p.title)}</bdi></b><div class="muted small">${esc(p.title_ar || '')}</div></div>
          ${r.best != null ? `<span class="chip ${scoreClass(r.best)} n">${r.best}%</span>` : r.done ? `<span class="chip ${scoreClass(r.self | 0)}">${SELF_LABEL[r.self] || 'خلصتها'}</span>` : later ? `<span class="chip warn">بعد درس ${p.lesson}</span>` : '<span class="chip">جديدة</span>'}
        </a>`;
      }).join('')}</div></section>`).join('')}`;
}

// ---------------------------------------------------------------- القطعة
function wordObj(nw) {                                   // كلمة القطعة لو موجودة في كلمات DW → صوت DW الأصلي
  const k = normDe(bare(nw.de).split(' / ')[0]);        // «das Land / die Länder» → das land (تسجيل DW فيه المفرد والجمع)
  return DATA.words.find(w => w.file && normDe(displayDe(w)) === k) || null;
}
function sayWord(nw) {
  const w = wordObj(nw);
  if (w) playWord(w); else speak(bare(nw.de).replace(/\s+\/\s+/g, ', '));
}

function passagePage(root, j, id) {
  const p = j.passages.find(x => x.id === id);
  if (!p) { root.innerHTML = '<section class="card"><div class="empty"><div class="big">🤔</div><p>القطعة دي مش موجودة</p><a class="btn" href="#/read">القطع</a></div></section>'; return; }
  const r = rec(p.id);
  const idx = j.passages.indexOf(p), next = j.passages[idx + 1];
  let answer = '';
  const head = `<a class="btn btn-ghost rf-back" href="#/read">→ القطع</a>
    <section class="card rd-title"><h1><bdi class="de">${esc(p.title)}</bdi></h1><p class="hint">${esc(p.title_ar || '')} · المستوى ${p.level} · بعد درس ${p.lesson}</p>
      <div class="rd-steps" aria-label="الخطوات"><span data-s="1">١ الكلمات</span><span data-s="2">٢ القطعة</span><span data-s="3">٣ فهمك</span><span data-s="4">٤ النتيجة</span></div></section>
    <div id="rdBody"></div>`;
  root.innerHTML = head;
  const body = root.querySelector('#rdBody');          // بيتشال لما الصفحة تتغيّر (#view نفسه بيفضل موجود)
  let cur = 1, gradeRun = 0;                           // gradeRun: رد Gemini قديم (بعد رجوع/إعادة) يتجاهل
  const steps = n => { cur = n; root.querySelectorAll('.rd-steps span').forEach(s => s.classList.toggle('on', +s.dataset.s === n)); };
  // زرار الرجوع بتاع أندرويد: خطوة لورا جوّا القطعة (فهمك ← القطعة ← الكلمات) — الكلام اللي كتبته بيفضل
  const onBack = e => {
    if (!body.isConnected) { window.removeEventListener('app-back', onBack); return; }   // قطعة سبتها: الـ listener بيشيل نفسه
    if (cur === 4 && body.querySelector('.rd-wait, #rdRetry, #rdSelfSeg')) { e.preventDefault(); gradeRun++; stepWrite(); }   // بيصحّح/غلط/مقارنة → «فهمك» والكلام محفوظ
    else if (cur === 3) { e.preventDefault(); stopSpeak(); stepText(); }
    else if (cur === 2 || (cur === 1 && body.querySelector('.rd-quiz, #rdGo'))) { e.preventDefault(); stopSpeak(); stepWords(); }
  };
  window.addEventListener('app-back', onBack);
  const wordsHtml = `<div class="list rd-words">${p.newWords.map((w, i) => `<div class="list-item"><button type="button" class="btn btn-icon sm" data-say="${i}" aria-label="اسمع">🔊</button>
      <div class="grow"><b class="de"><bdi>${esc(w.de)}</bdi></b><div class="muted">${esc(w.ar)}</div></div></div>`).join('')}</div>`;
  const textHtml = () => {
    // كل بديل في «das Land / die Länder» بيتعلّم عليه، من غير ملحوظة «(= …)»
    const marks = p.newWords.flatMap(w => bare(w.de).split(/\s+\/\s+/).map(x => normDe(x).split(' ').pop())).filter(x => x && x.length > 2);
    return p.de.split(/\n\s*\n/).map(par => `<p>${esc(par).replace(/[\p{L}ßäöüÄÖÜ]+/gu, m => (marks.includes(normDe(m)) ? `<mark>${m}</mark>` : m))}</p>`).join('');
  };
  // 🔊 listener واحد على #rdBody (مش مع كل خطوة — كانت الكلمة بتتقال كذا مرة)
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) sayWord(p.newWords[+b.dataset.say]);
  });

  // ١) الكلمات الجديدة
  const stepWords = () => {
    steps(1);
    body.innerHTML = `<section class="card"><h2 class="sec-title">الكلمات الجديدة في القطعة</h2>
      <p class="hint">احفظهم الأول — دوس 🔊 تسمع. وبعدين اختبار سريع لازم تعدّيه قبل القراية.</p>${wordsHtml}
      <button type="button" class="btn btn-primary btn-big" id="rdQuiz">اختبرني في الكلمات</button>
      ${r.words ? '<button type="button" class="btn btn-ghost btn-big" id="rdSkip">عدّيت الاختبار قبل كده — اقرا على طول</button>' : ''}</section>`;
    body.querySelector('#rdQuiz').addEventListener('click', stepQuiz);
    const sk = body.querySelector('#rdSkip');
    if (sk) sk.addEventListener('click', stepText);
  };

  // اختبار الكلمات: معنى كل كلمة من ٤ — الغلط بيرجع في الآخر لحد ما الكل يبقى صح
  const stepQuiz = () => {
    const pool = shuffle(p.newWords.map((w, i) => i));
    const others = j.passages.flatMap(x => x.newWords);
    let right = 0;
    const ask = () => {
      if (!pool.length) {
        r.words = true; store.save();
        body.innerHTML = `<section class="card center"><div class="big">🎉</div><h2>كده إنت جاهز للقطعة</h2><button type="button" class="btn btn-primary btn-big" id="rdGo">اقرا القطعة</button></section>`;
        body.querySelector('#rdGo').addEventListener('click', stepText);
        return;
      }
      const i = pool[0], w = p.newWords[i];
      // الاختيارات الغلط: لا نفس المعنى (sameMeaning: تشكيل/ال/مترادف) ولا معنى تاني لنفس الكلمة (der Mann = راجل / جوز)
      const same = o => normDe(bare(o.de)) === normDe(bare(w.de));
      const wrongs = [];
      for (const a of shuffle([...p.newWords, ...others].filter(o => !same(o)).map(o => o.ar))) {
        if (wrongs.length >= 3) break;
        if (!sameMeaning(a, w.ar) && !wrongs.some(x => sameMeaning(x, a))) wrongs.push(a);
      }
      const opts = shuffle([w.ar, ...wrongs]);
      body.innerHTML = `<section class="card rd-quiz"><p class="hint center">${right} من ${p.newWords.length} · يعني إيه؟</p>
        <h2 class="center"><bdi class="de">${esc(bare(w.de))}</bdi> <button type="button" class="btn btn-icon sm" data-say="${i}" aria-label="اسمع">🔊</button></h2>
        <div class="stack">${opts.map((o, k) => `<button type="button" class="btn btn-big rd-opt" data-k="${k}">${esc(o)}</button>`).join('')}</div></section>`;
      if (store.state.settings?.autoplay !== false) sayWord(w);   // زي المذاكرة: «تشغيل الصوت تلقائي»
      body.querySelectorAll('.rd-opt').forEach(b => b.addEventListener('click', () => {
        const ok = opts[+b.dataset.k] === w.ar;
        body.querySelectorAll('.rd-opt').forEach(x => { x.disabled = true; if (opts[+x.dataset.k] === w.ar) x.classList.add('ok'); });
        if (!ok) b.classList.add('bad');
        setTimeout(() => {
          pool.shift();
          if (ok) right++; else pool.push(i);                      // الغلط يرجع تاني في الآخر
          if (!pool.length) { r.words = true; store.save(); }
          if (!b.isConnected) return;                              // رجعت أو خرجت أثناء التصحيح → ما نرسمش السؤال اللي بعده
          ask();
        }, ok ? 450 : 1200);
      }));
    };
    ask();
  };

  // ٢) القطعة
  const stepText = () => {
    steps(2);
    body.innerHTML = `<section class="card rd-text-card">
      <div class="row between"><h2 class="sec-title">اقرا القطعة</h2><button type="button" class="btn" id="rdListen">🔊 اسمعها</button></div>
      <div class="rd-text" dir="ltr" lang="de">${textHtml()}</div>
      <details class="rd-words-mini"><summary>الكلمات الجديدة</summary>${wordsHtml}</details>
      <button type="button" class="btn btn-primary btn-big" id="rdWrite">خلصت — أكتب فهمت إيه</button></section>`;
    let speaking = false;
    const lb = body.querySelector('#rdListen');
    lb.addEventListener('click', async () => {
      if (speaking) { stopSpeak(); speaking = false; lb.textContent = '🔊 اسمعها'; return; }
      speaking = true; lb.textContent = '⏹ وقّف';
      for (const s of p.de.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)) {
        if (!speaking || !lb.isConnected) break;
        await speak(s, { rate: 0.85 });
      }
      speaking = false; if (lb.isConnected) lb.textContent = '🔊 اسمعها';
    });
    body.querySelector('#rdWrite').addEventListener('click', () => { stopSpeak(); stepWrite(); });
  };

  // ٣) فهمك بالعربي
  const stepWrite = () => {
    steps(3);
    const key = hasGeminiKey();
    body.innerHTML = `<section class="card">
      <details class="rd-peek" open><summary>القطعة</summary><div class="rd-text sm" dir="ltr" lang="de">${textHtml()}</div></details>
      <label for="rdAnswer"><h2 class="sec-title">اكتب بالعربي فهمت إيه</h2></label>
      <p class="hint">مصري أو فصحى، ومش لازم ترجمة حرف بحرف — المهم المعنى: مين، فين، إمتى، حصل إيه.</p>
      <textarea id="rdAnswer" class="input rd-answer" rows="7" dir="rtl" placeholder="مثلاً: لينا من ألمانيا وساكنة في …">${esc(answer)}</textarea>
      ${key ? '' : '<p class="hint warn-text">🤖 عشان Gemini يصحّح محتاج مفتاح — حطه من <a href="#/settings">الإعدادات</a>. ولحد كده تقدر تقارن بنفسك.</p>'}
      <button type="button" class="btn btn-primary btn-big" id="rdCheck" ${key ? '' : 'hidden'}>صحّح بـ Gemini 🤖</button>
      <button type="button" class="btn btn-big ${key ? 'btn-ghost' : ''}" id="rdSelf">قارن بالترجمة بنفسي</button>
      <p class="hint small">اللي بتكتبه بيتبعت لـ Google Gemini عشان يصحّحه بس.</p></section>`;
    const ta = body.querySelector('#rdAnswer'), check = body.querySelector('#rdCheck');
    const sync = () => { answer = ta.value; check.disabled = ta.value.trim().length < MIN_CHARS; };
    ta.addEventListener('input', sync); sync();
    check.addEventListener('click', () => grade());
    body.querySelector('#rdSelf').addEventListener('click', () => { answer = ta.value; stepSelf(); });
  };

  const grade = async () => {
    const run = ++gradeRun;
    steps(4);
    body.innerHTML = `<section class="card center rd-wait"><div class="big rd-spin">🤖</div><p>Gemini بيصحّح… ثواني</p></section>`;
    try {
      const res = await evaluateReading({ de: p.de, ref: p.ar, answer });
      if (!body.isConnected || run !== gradeRun) return;     // رجعت لـ«فهمك» أو خرجت → الرد ده قديم
      const first = !r.done;
      r.tries = (r.tries | 0) + 1; r.last = res.score; r.best = Math.max(r.best == null ? 0 : r.best, res.score); r.done = true;
      r.date = new Date().toISOString().slice(0, 10);
      store.save();
      if (first) addXp(20 + (res.score >= 80 ? 10 : 0));
      store.bumpStreak();                                       // قطعة اتصحّحت = يوم مذاكرة للستريك (زي الألعاب والامتحان)
      stepResult(res);
    } catch (e) {
      if (!body.isConnected || run !== gradeRun) return;
      body.innerHTML = `<section class="card center"><div class="big">😕</div><p>${esc(errorText(e))}</p>
        <div class="grid2"><button type="button" class="btn btn-primary" id="rdRetry">جرّب تاني</button><button type="button" class="btn" id="rdSelf2">قارن بنفسي</button></div></section>`;
      body.querySelector('#rdRetry').addEventListener('click', grade);
      body.querySelector('#rdSelf2').addEventListener('click', stepSelf);
    }
  };

  const refHtml = `<details class="rd-ref"><summary>الترجمة الصح</summary><div class="rd-ref-text">${p.ar.split(/\n\s*\n/).map(x => `<p>${esc(x)}</p>`).join('')}</div></details>`;
  const nextHtml = next ? `<a class="btn btn-primary btn-big" href="#/read/${esc(next.id)}">القطعة اللي بعدها: <bdi class="de">${esc(next.title)}</bdi></a>` : '<a class="btn btn-primary btn-big" href="#/read">كل القطع</a>';

  // ٤) النتيجة
  const stepResult = res => {
    steps(4);
    const li = (xs, f) => xs.length ? `<ul class="rd-list">${xs.map(f).join('')}</ul>` : '';
    body.innerHTML = `<section class="card center rd-score ${scoreClass(res.score)}"><div class="rd-pct n">${res.score}%</div>
        <p>${res.score >= 80 ? 'فهمت القطعة كويس جدًا 👏' : res.score >= 50 ? 'فهمت أغلبها — شوية تفاصيل فاتتك' : 'لسه — راجع الكلمات واقرا تاني'}</p>
        ${r.best > res.score ? `<p class="hint">أحسن نتيجة ليك في القطعة دي ${r.best}%</p>` : ''}</section>
      ${res.feedback ? `<section class="card"><p>${esc(res.feedback)}</p></section>` : ''}
      ${res.understood.length ? `<section class="card"><h2 class="sec-title">✅ فهمته صح</h2>${li(res.understood, x => `<li>${esc(x)}</li>`)}</section>` : ''}
      ${res.wrong.length ? `<section class="card"><h2 class="sec-title">❌ فهمته غلط</h2>${li(res.wrong, x => `<li><bdi class="de" dir="ltr">${esc(x.de)}</bdi><br><span class="muted">كتبت: ${esc(x.learner)}</span><br><b>الصح: ${esc(x.correct)}</b></li>`)}</section>` : ''}
      ${res.missed.length ? `<section class="card"><h2 class="sec-title">❗ فاتك</h2>${li(res.missed, x => `<li><bdi class="de" dir="ltr">${esc(x.de)}</bdi> = ${esc(x.ar)}</li>`)}</section>` : ''}
      <section class="card">${refHtml}
        <div class="grid2"><button type="button" class="btn" id="rdAgain">اكتب تاني</button><button type="button" class="btn" id="rdReread">اقرا تاني</button></div>
        ${nextHtml}</section>`;
    body.querySelector('#rdAgain').addEventListener('click', stepWrite);
    body.querySelector('#rdReread').addEventListener('click', stepText);
  };

  // من غير Gemini: الترجمة الصح وتقيّم نفسك
  const stepSelf = () => {
    steps(4);
    body.innerHTML = `<section class="card"><h2 class="sec-title">قارن اللي كتبته بالترجمة الصح</h2>
      ${answer.trim() ? `<div class="rd-mine"><b>إنت كتبت:</b><p>${esc(answer)}</p></div>` : ''}
      <div class="rd-ref-text">${p.ar.split(/\n\s*\n/).map(x => `<p>${esc(x)}</p>`).join('')}</div>
      <p class="hint">فهمت قد إيه؟</p>
      <div class="seg" id="rdSelfSeg"><button type="button" data-v="90">كله تقريبًا</button><button type="button" data-v="60">أغلبه</button><button type="button" data-v="30">شوية</button></div>
      ${nextHtml}</section>`;
    let rated = false;                                          // تغيير التقييم في نفس المرة مش محاولة جديدة
    body.querySelector('#rdSelfSeg').addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const v = +b.dataset.v, first = !r.done;
      r.done = true; r.self = v;
      if (!rated) { r.tries = (r.tries | 0) + 1; rated = true; }
      store.save();
      if (first) addXp(15);
      store.bumpStreak();
      body.querySelectorAll('#rdSelfSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      toast('اتسجّلت — المرة الجاية جرّب تصحيح Gemini');
    });
  };

  stepWords();
}
