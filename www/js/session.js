// session.js — جلسة المذاكرة + شاشة النتيجة + لعبة التوصيل
// بيتنادى من app.js: renderSession(root, {lesson}) و renderMatch(root, {lesson})
import { DATA, lessonOf, wordsOfLesson, displayDe, pluralOf } from './data.js';
import { store, today } from './store.js';
import { el, esc, toast, deHtml, articleClass, vibrate, ring, confetti, nWords } from './ui.js';
import { buildSession, grade, markIntro, addXp, isSeen } from './srs.js';
import { recordTyped } from './progress.js';
import { replan } from './notify.js';
import { latchReview } from './mastery.js';
import { makeExercise, gradeAnswer, makeMatch, normDe } from './exercises.js';
import { play, autoplay, stop as stopAudio, preload } from './audio.js';

// الأنواع اللي بنشغّل صوتها أوتوماتيك (لو الإعداد مفتوح)
const AUTOPLAY_TYPES = new Set(['intro', 'mcq_de_ar', 'listen']);
const MATCH_XP = 15;
const MATCH_PAIRS = 6;
const MAX_RETRIES = 3;          // أقصى عدد مرات ترجع فيها نفس الكلمة في الجلسة لو فضلت غلط

// ---------- أدوات صغيرة ----------
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pad2 = n => String(n).padStart(2, '0');
const fmtTime = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };
const isNoun = w => !!(w && w.k === 'noun' && w.art && w.sg);
const wordOf = id => DATA.byId.get(id);
const goHome = () => { location.hash = '#/home'; };

function nDays(n) {
  n = +n || 0;
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوم`;
}

// نص فيه عربي وألماني مع بعض (زي ملاحظات التصحيح): نلفّ الأجزاء اللاتينية في <bdi class="de">
function mixedHtml(s) {
  s = String(s ?? '');
  const re = /[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß'’-]*(?:[ ][A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß'’-]*)*/g;
  let out = '', last = 0;
  for (const m of s.matchAll(re)) {
    out += esc(s.slice(last, m.index)) + `<bdi class="de">${esc(m[0])}</bdi>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

// اختيار ألماني كنص: لو بيبدأ بأداة نلوّنها زي deHtml
function deOptHtml(text) {
  const m = String(text ?? '').match(/^(der|die|das)\s+(.+)$/);
  if (m) return `<bdi class="de"><span class="art ${articleClass(m[1])}">${m[1]}</span> ${esc(m[2])}</bdi>`;
  return `<bdi class="de">${esc(text)}</bdi>`;
}

// الصوت: نشغّل ونعمل نبضة على الزرار لحد ما يخلص
function pulse(btn, promise) {
  if (!btn) return promise;
  btn.classList.add('playing');
  return promise.then(() => btn.classList.remove('playing'), () => btn.classList.remove('playing'));
}

// ---------- دورة حياة الشاشة: نشيل listeners والتايمرات لما نسيب الصفحة ----------
let current = null;
function activate(ctrl) {
  if (current && current !== ctrl) current.destroy();
  current = ctrl;
}
window.addEventListener('hashchange', () => { if (current) { const c = current; current = null; c.destroy(); } });

function makeCtrl() {
  const timers = new Set();
  const docListeners = [];
  const ctrl = {
    alive: true,
    after(ms, fn) { const t = setTimeout(() => { timers.delete(t); if (ctrl.alive) fn(); }, ms); timers.add(t); return t; },
    every(ms, fn) { const t = setInterval(() => { if (ctrl.alive) fn(); }, ms); timers.add(t); return t; },
    onDoc(type, fn) { document.addEventListener(type, fn); docListeners.push([type, fn]); },
    destroy() {
      if (!ctrl.alive) return;
      ctrl.alive = false;
      for (const t of timers) { clearTimeout(t); clearInterval(t); }
      timers.clear();
      for (const [type, fn] of docListeners) document.removeEventListener(type, fn);
      docListeners.length = 0;
      stopAudio();
      if (current === ctrl) current = null;
    },
  };
  return ctrl;
}

// ---------- حالة فاضية (مفيش كلمات) ----------
function emptyCard(lesson, game) {
  const l = lesson ? lessonOf(lesson) : null;
  const title = lesson && !l ? 'الدرس ده مش موجود' : lesson ? 'الدرس ده مفيهوش كلمات' : 'مفيش كلمات دلوقتي';
  const hint = game ? 'اختار درس تاني أو ارجع للرئيسية.' : 'جرّب درس تاني، أو ارجع للرئيسية وابدأ من هناك.';
  const card = el(`<section class="card ss-empty">
    <div class="empty"><div class="big">📭</div><h2>${title}</h2><p class="hint">${hint}</p></div>
    <div class="ss-res-actions">
      <button class="btn btn-big btn-primary" data-act="lessons">اختار درس</button>
      <button class="btn btn-big" data-act="home">الرئيسية</button>
    </div></section>`);
  card.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'lessons') location.hash = '#/lessons'; else goHome();
  });
  return card;
}

// ======================================================================
//  جلسة المذاكرة
// ======================================================================
export function renderSession(root, { lesson = null } = {}) {
  startSession(root, lesson ? +lesson : null);
}

function startSession(root, lesson) {
  const ctrl = makeCtrl();
  activate(ctrl);
  root.innerHTML = '';

  let built;
  try { built = buildSession({ lesson }); }
  catch (e) { console.error('[session] buildSession failed', e); built = { items: [], early: false }; }
  const queue = (built.items || []).filter(it => it && wordOf(it.id)).map(it => ({ id: it.id, type: it.type }));
  if (!queue.length) { root.appendChild(emptyCard(lesson)); return; }

  const S = {
    lesson, early: !!built.early, queue, pos: 0, ex: null, item: null,
    phase: 'answer',            // answer | feedback | busy | results
    flipped: false,
    stats: { total: 0, ok: 0, wrong: 0, retriesOk: 0, xp: 0, newCount: 0, touched: 0 },
  };
  try { preload([...new Set(queue.map(i => i.id))].map(wordOf)); } catch (e) { /* مش مهم */ }

  const lessonObj = lesson ? lessonOf(lesson) : null;
  const subChips = [
    lessonObj ? `<span class="chip">الدرس ${lessonObj.n} · <bdi class="de">${esc(lessonObj.title)}</bdi></span>` : '',
    S.early ? '<span class="chip warn">مراجعة مبكرة</span>' : '',
  ].join('');
  const wrap = el(`<div class="ss-wrap">
    <div class="ss-top">
      <button class="btn btn-icon ss-close" data-act="close" aria-label="خروج من المذاكرة">✕</button>
      <div class="bar ss-bar" role="progressbar" aria-label="التقدم"><i style="width:0%"></i></div>
      <span class="chip blue ss-xp" aria-label="نقاط الجولة"><b>0</b> XP</span>
    </div>
    ${subChips ? `<div class="ss-sub">${subChips}</div>` : ''}
    <div class="ss-stage"></div>
    <div class="ss-fb" role="status" aria-live="polite"></div>
  </div>`);
  root.appendChild(wrap);
  const stage = wrap.querySelector('.ss-stage');
  const fb = wrap.querySelector('.ss-fb');
  const barFill = wrap.querySelector('.ss-bar > i');
  const xpEl = wrap.querySelector('.ss-xp');

  // ---------- الصف العلوي ----------
  function updateTop(gain = 0) {
    const pct = S.queue.length ? Math.round(Math.min(S.pos, S.queue.length) / S.queue.length * 100) : 100;
    barFill.style.width = pct + '%';
    xpEl.querySelector('b').textContent = S.stats.xp;
    if (gain > 0) {
      xpEl.classList.remove('pop');
      void xpEl.offsetWidth;        // إعادة تشغيل الأنيميشن
      xpEl.classList.add('pop');
    }
  }

  // ---------- الكروت ----------
  function tagRow(ex, item) {
    const chips = [];
    if (item.extra) chips.push('<span class="chip">مراجعة سريعة</span>');
    else if (item.retry) chips.push('<span class="chip warn">تاني مرة</span>');
    return `<div class="ss-tag"><span class="ss-hint">${esc(ex.prompt.hint || '')}</span>${chips.join('')}</div>`;
  }
  const sayBtn = (cls = '') => `<button type="button" class="ss-say ${cls}" data-act="say" aria-label="اسمع الكلمة">🔊</button>`;
  const translitLine = ex => ex.prompt.translit ? `<div class="ss-translit">${esc(ex.prompt.translit)}</div>` : '';

  function optionsHtml(ex) {
    if (ex.type === 'article') {
      return `<div class="ss-opts ss-arts">${ex.options.map((o, i) =>
        `<button type="button" class="ss-opt ss-art ${articleClass(o.text)}" data-act="opt" data-i="${i}"><bdi class="de">${esc(o.text)}</bdi></button>`).join('')}</div>`;
    }
    return `<div class="ss-opts">${ex.options.map((o, i) =>
      `<button type="button" class="ss-opt" data-act="opt" data-i="${i}">${o.isDe ? deOptHtml(o.text) : esc(o.text)}</button>`).join('')}</div>`;
  }

  function buildCard(ex, item) {
    const w = ex.word;
    const attrs = `data-type="${ex.type}" data-id="${esc(w.id)}"${item.retry ? ' data-retry="1"' : ''}${item.extra ? ' data-extra="1"' : ''}`;
    let body = '';
    switch (ex.type) {
      case 'intro': {
        const pl = pluralOf(w);
        body = `<div class="ss-tag"><span class="chip blue">كلمة جديدة</span>${ex.prompt.hint ? `<span class="chip">${esc(ex.prompt.hint)}</span>` : ''}</div>
          <div class="ss-flip" data-act="flip" role="button" tabindex="0" aria-label="اقلب الكارت">
            <div class="ss-flip-inner">
              <div class="ss-face ss-front">
                <div class="ss-de-row">${ex.prompt.de}</div>
                ${translitLine(ex)}
                ${sayBtn()}
                <div class="ss-flip-hint">دوس على الكارت عشان تشوف المعنى</div>
              </div>
              <div class="ss-face ss-back">
                <div class="ss-back-de">${deHtml(w)}</div>
                <div class="ss-ar-big">${esc(w.ar)}</div>
                ${isNoun(w) ? `<div class="ss-pl">${pl ? `الجمع: ${deOptHtml(pl)}` : '<span class="muted">من غير جمع</span>'}</div>` : ''}
                ${w.sub ? `<div class="ss-subline muted"><bdi class="de">${esc(w.sub)}</bdi></div>` : ''}
              </div>
            </div>
          </div>
          <div class="ss-actions">
            <button type="button" class="btn btn-big btn-primary ss-flipbtn" data-act="flip">اقلب الكارت</button>
            <div class="grid2 ss-know" hidden>
              <button type="button" class="btn btn-big" data-act="later">لسه</button>
              <button type="button" class="btn btn-big btn-primary" data-act="know">عارفها ✓</button>
            </div>
          </div>`;
        break;
      }
      case 'mcq_de_ar':
        body = `${tagRow(ex, item)}
          <div class="ss-prompt"><div class="ss-de-row">${ex.prompt.de}${sayBtn()}</div>${translitLine(ex)}</div>
          ${optionsHtml(ex)}`;
        break;
      case 'mcq_ar_de':
        body = `${tagRow(ex, item)}
          <div class="ss-prompt"><div class="ss-ar-big">${esc(ex.prompt.ar)}</div></div>
          ${optionsHtml(ex)}`;
        break;
      case 'listen':
        body = `${tagRow(ex, item)}
          <div class="ss-prompt ss-listen">
            <button type="button" class="ss-speaker" data-act="say" aria-label="اسمع">🔊</button>
            <button type="button" class="btn btn-ghost" data-act="say">اسمع تاني</button>
          </div>
          ${optionsHtml(ex)}`;
        break;
      case 'article':
        // من غير زرار صوت: الصوت بيقول الأداة
        body = `${tagRow(ex, item)}
          <div class="ss-prompt"><div class="ss-de-row">${ex.prompt.de}</div><div class="ss-ar-sub">${esc(ex.prompt.ar)}</div></div>
          ${optionsHtml(ex)}`;
        break;
      case 'plural':
        body = `${tagRow(ex, item)}
          <div class="ss-prompt"><div class="ss-de-row">${ex.prompt.de}${sayBtn()}</div><div class="ss-ar-sub">${esc(ex.prompt.ar)}</div></div>
          ${optionsHtml(ex)}`;
        break;
      case 'type':
        body = `${tagRow(ex, item)}
          <div class="ss-prompt"><div class="ss-ar-big">${esc(ex.prompt.ar)}</div></div>
          <div class="ss-type">
            <input class="ss-input" type="text" lang="de" dir="ltr" placeholder="اكتب هنا…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="الإجابة بالألماني">
            <div class="ss-umlaut" aria-label="حروف ألمانية">
              ${['ä', 'ö', 'ü', 'ß'].map(c => `<button type="button" data-act="umlaut" data-ch="${c}" aria-label="${c}">${c}</button>`).join('')}
            </div>
            <button type="button" class="btn btn-big btn-primary" data-act="check">تحقق</button>
            <div class="ss-type-row">
              <button type="button" class="btn btn-ghost" data-act="say">🔊 اسمعها</button>
              <button type="button" class="btn btn-ghost ss-giveup" data-act="giveup">مش عارفها</button>
            </div>
          </div>`;
        break;
      default:
        body = `${tagRow(ex, item)}<div class="ss-prompt">${ex.prompt.de || esc(ex.prompt.ar || '')}</div>${ex.options ? optionsHtml(ex) : ''}`;
    }
    return el(`<section class="ss-card enter" ${attrs}>${body}</section>`);
  }

  // ---------- عرض العنصر الحالي ----------
  function showItem() {
    if (!ctrl.alive) return;
    if (S.pos >= S.queue.length) return finish();
    const item = S.queue[S.pos];
    const w = wordOf(item.id);
    let ex = null;
    if (w) { try { ex = makeExercise(w, item.type); } catch (e) { console.error('[session] makeExercise failed', e); } }
    if (!ex) { S.pos++; return showItem(); }
    S.item = item; S.ex = ex; S.phase = 'answer'; S.flipped = false;
    hideFeedback();
    updateTop();
    const card = buildCard(ex, item);
    stage.innerHTML = '';
    stage.appendChild(card);
    window.scrollTo(0, 0);
    if (ex.type === 'type') {
      const inp = card.querySelector('.ss-input');
      if (inp) ctrl.after(80, () => { if (ctrl.alive && S.ex === ex) inp.focus({ preventScroll: true }); });
    }
    if (AUTOPLAY_TYPES.has(ex.type)) pulse(card.querySelector('.ss-speaker, .ss-say'), autoplay(w));
  }

  function say(btn) {
    if (!S.ex) return;
    const isIcon = btn && (btn.classList.contains('ss-speaker') || btn.classList.contains('ss-say'));
    pulse(isIcon ? btn : stage.querySelector('.ss-speaker, .ss-say'), play(S.ex.word));
  }

  // ---------- كارت التعريف ----------
  function flip() {
    if (S.phase !== 'answer' || !S.ex || S.ex.type !== 'intro') return;
    const card = stage.firstElementChild;
    S.flipped = !S.flipped;
    card.querySelector('.ss-flip').classList.toggle('flipped', S.flipped);
    const fbtn = card.querySelector('.ss-flipbtn'), know = card.querySelector('.ss-know');
    if (fbtn && !fbtn.hidden) { fbtn.hidden = true; know.hidden = false; }
  }
  function know(later) {
    if (S.phase !== 'answer' || !S.ex || S.ex.type !== 'intro') return;
    S.phase = 'busy';
    try { markIntro(S.ex.id); } catch (e) { console.error('[session] markIntro failed', e); }
    S.stats.touched++;
    S.stats.newCount++;
    // «لسه» → اختبار إضافي سريع بعد كام عنصر (مراجعة من غير تغيير في الجدولة)
    if (later) requeue({ id: S.ex.id, type: 'mcq_de_ar', retry: true, extra: true });
    S.pos++;
    showItem();
  }

  // إعادة عنصر بعد 3–5 عناصر من العنصر الحالي
  function requeue(item) {
    const at = Math.min(S.queue.length, S.pos + rnd(3, 5));
    S.queue.splice(at, 0, item);
  }

  // ---------- الإجابة ----------
  function answer(value) {
    if (S.phase !== 'answer' || !S.ex) return;
    S.phase = 'feedback';
    const ex = S.ex, item = S.item;
    const res = gradeAnswer(ex, value);
    const firstTry = !item.retry && !item.extra;
    let xp = 0;
    try {
      // الإضافي (بعد «لسه») بيتحسب زي الإعادة (5 XP) ومن غير تغيير في الصندوق
      latchReview();                 // مهمة المراجعة لو كانت اتحققت قبل الإجابة دي — الغلطة ما تفتحهاش تاني
      const g = grade(ex.id, res.ok, { early: item.extra ? true : S.early, retry: !firstTry });
      if (res.ok) latchReview();
      xp = g.xp | 0;
      if (ex.type === 'type') {
        // ✍️ نجمة الكتابة: الاسم لازم يتكتب بأداته الصح عشان يتحسب
        const w = ex.word || {};
        const withArt = !(w.k === 'noun' && w.art) || normDe(String(value)).startsWith(w.art + ' ');
        if (res.ok && withArt) recordTyped(ex.id, true);
        else if (!res.ok) recordTyped(ex.id, false);
      }
    } catch (e) { console.error('[session] grade failed', e); }
    S.stats.touched++;
    S.stats.xp += xp;
    if (firstTry) { S.stats.total++; if (res.ok) S.stats.ok++; else S.stats.wrong++; }
    else if (res.ok) S.stats.retriesOk++;
    if (!res.ok) {
      vibrate(30);
      // الكلمة بقت في صندوق 0 وهترجع في الجلسة الجاية، فمش لازم تفضل تلف هنا للأبد
      const tries = (item.tries | 0) + 1;
      item.requeued = tries <= MAX_RETRIES;
      if (item.requeued) requeue({ id: item.id, type: item.type, retry: true, extra: !!item.extra, tries });
    }
    markOptions(ex, value, res);
    updateTop(xp);
    showFeedback(ex, item, res, xp);
  }

  function markOptions(ex, value, res) {
    const card = stage.firstElementChild;
    if (!card) return;
    card.classList.add('answered');
    if (ex.options) {
      const ci = ex.options.findIndex(o => o.correct);
      card.querySelectorAll('.ss-opt').forEach((b, i) => {
        b.disabled = true;
        if (i === ci) b.classList.add('is-correct');
        else if (i === value) b.classList.add('is-wrong');
      });
    } else {
      const inp = card.querySelector('.ss-input');
      if (inp) { inp.disabled = true; inp.classList.add(res.ok ? 'is-correct' : 'is-wrong'); }
      card.querySelectorAll('.ss-type button').forEach(b => { if (b.dataset.act !== 'say') b.disabled = true; });
    }
  }

  function check() {
    if (S.phase !== 'answer' || !S.ex || S.ex.type !== 'type') return;
    const inp = stage.querySelector('.ss-input');
    if (!inp) return;
    const v = inp.value.trim();
    if (!v) { toast('اكتب الكلمة الأول'); inp.focus(); return; }
    inp.blur();
    answer(v);
  }
  function giveUp() {
    if (S.phase !== 'answer' || !S.ex || S.ex.type !== 'type') return;
    const inp = stage.querySelector('.ss-input');
    if (inp) inp.blur();
    answer('');
  }
  function insertChar(ch) {
    const inp = stage.querySelector('.ss-input');
    if (!inp || inp.disabled) return;
    const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? s;
    inp.value = inp.value.slice(0, s) + ch + inp.value.slice(e);
    try { inp.setSelectionRange(s + ch.length, s + ch.length); } catch (err) { /* مش مهم */ }
    inp.focus();
  }

  // ---------- لوحة التصحيح ----------
  function correctHtml(ex, res) {
    const w = ex.word;
    if (ex.type === 'mcq_de_ar') return `<div class="ss-fb-main">${esc(w.ar)}</div><div class="ss-fb-other">${deHtml(w)}</div>`;
    let main;
    if (ex.type === 'plural') main = deOptHtml(res.correctText);
    else if (isNoun(w)) main = deHtml(w);
    else main = `<bdi class="de">${esc(res.correctText || displayDe(w))}</bdi>`;
    return `<div class="ss-fb-main">${main}</div><div class="ss-fb-other">${esc(w.ar)}</div>`;
  }

  function showFeedback(ex, item, res, xp) {
    const ok = res.ok;
    const head = ok ? (item.retry && !item.extra ? 'صح! رجعتها' : 'صح!') : (item.retry && !item.extra ? 'لسه غلط' : 'غلط');
    const sub = ok ? '' : item.requeued ? 'هتيجي تاني كمان شوية' : 'هترجعلك في المراجعة الجاية';
    fb.className = `ss-fb ${ok ? 'ok' : 'bad'}`;
    fb.innerHTML = `
      <div class="ss-fb-head"><b>${head}</b>${xp ? `<span class="ss-fb-xp">+${xp} XP</span>` : ''}</div>
      ${sub ? `<div class="ss-fb-sub">${sub}</div>` : ''}
      <div class="ss-fb-ans">
        <button type="button" class="ss-say sm" data-act="fbsay" aria-label="اسمع الكلمة">🔊</button>
        <div class="ss-fb-ans-text">${correctHtml(ex, res)}</div>
      </div>
      ${res.note ? `<div class="ss-fb-note">${mixedHtml(res.note)}</div>` : ''}
      <button type="button" class="btn btn-big ss-fb-btn" data-act="continue">متابعة</button>`;
    wrap.classList.add('fb-open');
    void fb.offsetWidth;          // نثبّت الحالة المخفية الأول علشان الانتقال يشتغل (من غير rAF)
    fb.classList.add('show');
  }
  function hideFeedback() {
    fb.classList.remove('show');
    wrap.classList.remove('fb-open');
  }
  function next() {
    if (S.phase !== 'feedback') return;
    S.phase = 'busy';
    hideFeedback();
    S.pos++;
    showItem();
  }

  // ---------- النتيجة ----------
  function finish() {
    S.phase = 'results';
    S.ex = null; S.item = null;
    hideFeedback();
    const st = S.stats;
    const pct = st.total ? Math.round(st.ok / st.total * 100) : (st.touched ? 100 : 0);

    // الستريك + ملخص الجلسة (مرة واحدة)
    try {
      store.bumpStreak();
      const dayRec = store.touchDay();
      dayRec.sessions = (dayRec.sessions | 0) + 1;          // جلسات المذاكرة بس (الألعاب ليها عدّاد games)
      store.state.lastSession = { date: today(), total: st.total, ok: st.ok, xp: st.xp };
      store.save();
    } catch (e) { console.error('[session] finish save failed', e); }
    replan();

    const streak = store.state.streak || { current: 0, best: 0 };
    const goal = Math.max(1, store.state.settings.dailyGoal | 0);
    const done = ((store.state.days || {})[today()] || {}).done | 0;
    const reached = done >= goal;
    const title = pct === 100 ? 'كلها صح!' : pct >= 80 ? 'جامد جدًا!' : pct >= 50 ? 'حلو، كمّل كده' : 'ولا يهمك، التكرار بيعلّم';
    const ringColor = pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--blue)' : 'var(--warn)';
    const chips = [
      st.newCount ? `<span class="chip blue">${nWords(st.newCount)} جديدة</span>` : '',
      st.wrong ? `<span class="chip bad">✗ ${st.wrong} غلط</span>` : '',
      st.retriesOk ? `<span class="chip good">${st.retriesOk} رجعت صح</span>` : '',
      S.early ? '<span class="chip warn">مراجعة مبكرة</span>' : '',
    ].join('');
    stage.innerHTML = '';
    stage.appendChild(el(`<section class="ss-card ss-results enter">
      <div class="ss-res-top" style="--ring:${ringColor}">
        ${ring(pct, 132)}
        <div class="ss-res-head"><h2>${title}</h2>
          <p class="hint">${st.total ? `${st.ok} من ${st.total} صح من أول مرة` : 'جولة تعريف بالكلمات'}</p></div>
      </div>
      <div class="ss-res-xp"><b>+${st.xp}</b> XP</div>
      ${chips ? `<div class="ss-res-chips">${chips}</div>` : ''}
      <div class="ss-res-rows">
        <div class="ss-res-row"><span>🔥 ستريك: ${nDays(streak.current)}</span>${streak.best > streak.current ? `<span class="muted small">أحسن ستريك: ${streak.best}</span>` : ''}</div>
        <div class="ss-res-row"><span>الهدف اليومي</span><span class="muted" dir="ltr">${Math.min(done, goal)}/${goal}</span></div>
        <div class="bar ${reached ? 'good' : ''}"><i style="width:${Math.min(100, Math.round(done / goal * 100))}%"></i></div>
        ${reached ? '<div class="ss-res-goal">✓ خلصت هدف النهارده</div>' : `<div class="muted small">فاضل ${nWords(goal - done)} وتخلص الهدف</div>`}
      </div>
      <div class="ss-res-actions">
        <button type="button" class="btn btn-big btn-primary" data-act="again">كمان جولة</button>
        <button type="button" class="btn btn-big" data-act="home">الرئيسية</button>
      </div>
    </section>`));
    updateTop();
    barFill.style.width = '100%';
    window.scrollTo(0, 0);
    if (st.total && pct >= 80) { try { confetti(); } catch (e) { /* مش مهم */ } }
  }

  // ---------- الخروج ----------
  function confirmExit() {
    if (S.phase === 'results' || !S.stats.touched) { goHome(); return; }
    if (wrap.querySelector('.ss-modal')) return;
    const m = el(`<div class="ss-modal" role="dialog" aria-modal="true" aria-labelledby="ssExitTitle">
      <div class="card ss-modal-card">
        <h2 id="ssExitTitle">تخرج من المذاكرة؟</h2>
        <p class="hint">اللي جاوبته لحد دلوقتي اتحفظ، بس الجولة مش هتتحسب خالصة.</p>
        <div class="grid2">
          <button type="button" class="btn btn-big" data-act="cancelExit">كمّل</button>
          <button type="button" class="btn btn-big btn-danger" data-act="exit">اخرج</button>
        </div>
      </div></div>`);
    wrap.appendChild(m);
    void m.offsetWidth;
    m.classList.add('show');
  }
  function closeModal() { const m = wrap.querySelector('.ss-modal'); if (m) m.remove(); }

  // ---------- الأحداث ----------
  wrap.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || !wrap.contains(t)) return;
    switch (t.dataset.act) {
      case 'close': confirmExit(); break;
      case 'exit': goHome(); break;
      case 'cancelExit': closeModal(); break;
      case 'say': say(t); break;
      case 'fbsay': if (S.ex) pulse(t, play(S.ex.word)); break;
      case 'flip': flip(); break;
      case 'know': know(false); break;
      case 'later': know(true); break;
      case 'opt': if (!t.disabled) answer(+t.dataset.i); break;
      case 'check': check(); break;
      case 'giveup': giveUp(); break;
      case 'umlaut': insertChar(t.dataset.ch); break;
      case 'continue': next(); break;
      case 'again': startSession(root, lesson); break;
      case 'home': goHome(); break;
    }
  });
  // زرار الأوملاوت ما يسحبش الفوكس من خانة الكتابة
  wrap.addEventListener('pointerdown', e => { if (e.target.closest('.ss-umlaut button')) e.preventDefault(); });
  // لمس الخلفية المعتمة بيقفل نافذة التأكيد
  wrap.addEventListener('click', e => { if (e.target.classList.contains('ss-modal')) closeModal(); });

  ctrl.onDoc('keydown', e => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = e.target && e.target.tagName;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Enter') {
      if (tag === 'BUTTON' || tag === 'A') return;                 // الزرار بيعمل click لوحده
      if (wrap.querySelector('.ss-modal')) return;
      if (S.phase === 'feedback') { e.preventDefault(); next(); return; }
      if (S.phase === 'answer' && S.ex) {
        if (S.ex.type === 'type') { e.preventDefault(); check(); }
        else if (S.ex.type === 'intro') { e.preventDefault(); if (S.flipped) know(false); else flip(); }
      }
      return;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // أرقام 1–4 بتختار الاختيار (للكيبورد)
    if (S.phase === 'answer' && S.ex && S.ex.options && /^[1-9]$/.test(e.key)) {
      const i = +e.key - 1;
      if (i < S.ex.options.length) answer(i);
    }
  });

  showItem();
}

// ======================================================================
//  لعبة التوصيل
// ======================================================================
export function renderMatch(root, { lesson = null } = {}) {
  startMatch(root, lesson ? +lesson : null);
}

function startMatch(root, lesson) {
  const ctrl = makeCtrl();
  activate(ctrl);
  root.innerHTML = '';

  const lessonObj = lesson ? lessonOf(lesson) : null;
  const pool = lesson ? wordsOfLesson(lesson) : DATA.words;
  // نفضّل الكلمات اللي شافها قبل كده، والقصيرة عشان الزراير تبقى مريحة
  const short = w => displayDe(w).length <= 26 && String(w.ar || '').length <= 26;
  const seen = pool.filter(w => isSeen(w.id));
  const seenShort = seen.filter(short), poolShort = pool.filter(short);
  const cands = seenShort.length >= MATCH_PAIRS ? seenShort
    : seen.length >= MATCH_PAIRS ? seen
    : poolShort.length >= MATCH_PAIRS ? poolShort
    : pool.length ? pool : DATA.words.filter(short);
  let m;
  try { m = makeMatch(cands, MATCH_PAIRS); } catch (e) { console.error('[match] makeMatch failed', e); m = { pairs: [], left: [], right: [] }; }
  if (!m.pairs || m.pairs.length < 2) { root.appendChild(emptyCard(lesson, true)); return; }
  const n = m.pairs.length;

  const wrap = el(`<div class="mg-wrap">
    <div class="ss-top">
      <button type="button" class="btn btn-icon ss-close" data-act="home" aria-label="خروج">✕</button>
      <div class="mg-mid">
        <span class="chip"><b class="mg-count" dir="ltr">0/${n}</b></span>
        ${lessonObj ? `<span class="chip">الدرس ${lessonObj.n}</span>` : ''}
      </div>
      <span class="chip blue mg-timer" dir="ltr" aria-label="الوقت">00:00</span>
    </div>
    <p class="hint center mg-lead">وصّل كل كلمة ألماني بمعناها بالعربي</p>
    <div class="mg-grid">
      <div class="mg-col mg-de">${m.left.map(x => `<button type="button" class="mg-btn" data-side="de" data-id="${esc(x.id)}">${deOptHtml(x.text)}</button>`).join('')}</div>
      <div class="mg-col mg-ar">${m.right.map(x => `<button type="button" class="mg-btn" data-side="ar" data-id="${esc(x.id)}">${esc(x.text)}</button>`).join('')}</div>
    </div>
  </div>`);
  root.appendChild(wrap);

  const timerEl = wrap.querySelector('.mg-timer');
  const countEl = wrap.querySelector('.mg-count');
  const grid = wrap.querySelector('.mg-grid');
  const t0 = Date.now();
  let matched = 0, wrongTaps = 0, busy = false, finished = false;
  const sel = { de: null, ar: null };
  const tick = () => { timerEl.textContent = fmtTime(Date.now() - t0); };
  ctrl.every(500, tick);

  function clearSel() {
    for (const k of ['de', 'ar']) { if (sel[k]) sel[k].classList.remove('sel'); sel[k] = null; }
  }

  function tap(btn) {
    if (busy || finished || btn.classList.contains('gone') || btn.classList.contains('ok')) return;
    const side = btn.dataset.side;
    if (sel[side] === btn) { btn.classList.remove('sel'); sel[side] = null; return; }   // نفس الزرار → إلغاء
    if (sel[side]) sel[side].classList.remove('sel');
    sel[side] = btn;
    btn.classList.add('sel');
    if (!sel.de || !sel.ar) return;

    const a = sel.de, b = sel.ar;
    sel.de = sel.ar = null;
    a.classList.remove('sel'); b.classList.remove('sel');
    if (a.dataset.id === b.dataset.id) {
      a.classList.add('ok'); b.classList.add('ok');
      matched++;
      countEl.textContent = `${matched}/${n}`;
      ctrl.after(260, () => { a.classList.add('gone'); b.classList.add('gone'); });
      if (matched >= n) ctrl.after(420, done);
    } else {
      wrongTaps++;
      busy = true;
      vibrate(40);
      a.classList.add('bad'); b.classList.add('bad');
      ctrl.after(420, () => { a.classList.remove('bad'); b.classList.remove('bad'); busy = false; });
    }
  }

  function done() {
    if (finished) return;
    finished = true;
    const ms = Date.now() - t0;
    tick();
    try { addXp(MATCH_XP); store.bumpStreak(); } catch (e) { console.error('[match] addXp failed', e); }
    const card = el(`<section class="ss-card ss-results enter mg-done">
      <div class="mg-done-ico">🧩</div>
      <h2>وصّلت الكل!</h2>
      <p class="hint">خلصت في <b dir="ltr">${fmtTime(ms)}</b> · ${wrongTaps ? `${wrongTaps} ${wrongTaps === 1 ? 'غلطة' : wrongTaps === 2 ? 'غلطتين' : 'غلطات'}` : 'من غير ولا غلطة'}</p>
      <div class="ss-res-xp"><b>+${MATCH_XP}</b> XP</div>
      <div class="ss-res-actions">
        <button type="button" class="btn btn-big btn-primary" data-act="again">كمان مرة</button>
        <button type="button" class="btn btn-big" data-act="home">الرئيسية</button>
      </div>
    </section>`);
    grid.replaceWith(card);
    const lead = wrap.querySelector('.mg-lead');
    if (lead) lead.remove();
    if (!wrongTaps) { try { confetti(); } catch (e) { /* مش مهم */ } }
  }

  wrap.addEventListener('click', e => {
    const b = e.target.closest('.mg-btn');
    if (b && wrap.contains(b)) { tap(b); return; }
    const t = e.target.closest('[data-act]');
    if (!t || !wrap.contains(t)) return;
    if (t.dataset.act === 'again') startMatch(root, lesson);
    else if (t.dataset.act === 'home') goHome();
  });
}
