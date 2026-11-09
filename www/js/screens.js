// screens.js — شاشات الأبلكيشن: الرئيسية / الدروس / الدرس / إحصائياتي / الإعدادات
// كل دالة render بتاخد <main id="view"> فاضي، تملاه، وتركّب الـ listeners بتاعتها جواه
import { DATA, lessonOf, wordsOfLesson, pluralOf, translitOf } from './data.js';
import { store, today, dayIndex, todayIndex, dateFromIndex } from './store.js';
import { esc, toast, applyTheme, deHtml, nWords, ring } from './ui.js';
import { counts, lessonCounts, stage, getState, isLearned } from './srs.js';
import { play } from './audio.js';
import { loadVideos, videosLoaded, videoTeaserHtml, homeVideoTeaserHtml, renderVideoSettings } from './video.js';
import { renderUpdateBanner, renderUpdateSettings } from './update.js';
import { lessonStatus, nextStep, currentLesson, mission, level } from './mastery.js';
import { sentencesOf, grammarOf } from './content.js';
import { itemDone, typedCount, gameRecord } from './progress.js';
import { speak, ttsStatus, installGermanVoice } from './tts.js';
import { notifySupported, notifyPermission, requestNotifyPermission, replan } from './notify.js';
import { grammarHtml, wireRefSay } from './reference.js';
import { shareText, shareFile, isNative, plugin } from './native.js';

const STAGE_AR = { new: 'جديدة', learning: 'بتتعلمها', known: 'عارفها', mastered: 'ثابتة' };
const KIND_AR = { noun: 'اسم', verb: 'فعل', phrase: 'جملة', word: 'كلمة' };
const WEEKDAYS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];   // السبت → الجمعة (أول عمود على اليمين)

// ---------- helpers ----------
const settings = () => store.state.settings || (store.state.settings = {});
const todayRec = () => (store.state.days || {})[today()] || { done: 0, xp: 0, sessions: 0, new: 0 };
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sortedLessons = () => DATA.lessons.slice().sort((a, b) => a.n - b.n);
const learnedIn = words => words.filter(w => isLearned(w.id)).length;
const goalOf = () => Math.max(1, +settings().dailyGoal || 20);

// صيغ الجمع بالمصري (أرقام غربية)
function nDays(n) {
  n = +n || 0;
  if (n === 0) return 'ولا يوم';
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n <= 10) return `${n} أيام`;
  return `${n} يوم`;
}
function nAnswers(n) {
  n = +n || 0;
  if (n === 0) return 'ولا إجابة';
  if (n === 1) return 'إجابة واحدة';
  if (n === 2) return 'إجابتين';
  if (n <= 10) return `${n} إجابات`;
  return `${n} إجابة`;
}
function nTimes(n) {
  n = +n || 0;
  if (n === 1) return 'مرة واحدة';
  if (n === 2) return 'مرتين';
  if (n <= 10) return `${n} مرات`;
  return `${n} مرة`;
}
function nReviews(n) {
  n = +n || 0;
  if (n === 1) return 'مراجعة واحدة';
  if (n === 2) return 'مراجعتين';
  if (n <= 10) return `${n} مراجعات`;
  return `${n} مراجعة`;
}
function nNewWords(n) {
  n = +n || 0;
  if (n === 1) return 'كلمة واحدة جديدة';
  if (n === 2) return 'كلمتين جداد';
  if (n <= 10) return `${n} كلمات جديدة`;
  return `${n} كلمة جديدة`;
}
function nSessions(n) {
  n = +n || 0;
  if (n === 0) return 'ولا جلسة';
  if (n === 1) return 'جلسة واحدة';
  if (n === 2) return 'جلستين';
  if (n <= 10) return `${n} جلسات`;
  return `${n} جلسة`;
}

// وصف الجلسة الجاية: «X مراجعة وY كلمات جديدة»
function planText(c, started) {
  const reviews = Math.min(30, c.due | 0);
  const news = Math.min(Math.max(0, +settings().newPerSession || 8), c.new | 0);
  if (!reviews && !news) return started ? 'كل كلماتك متراجعة — الجلسة الجاية هتبقى مراجعة مبكّرة' : 'يلا نبدأ أول جلسة!';
  const parts = [];
  if (reviews) parts.push(nReviews(reviews));
  if (news) parts.push(nNewWords(news));
  return 'الجلسة الجاية: ' + parts.join(' و');
}

// «النهارده» / «إمبارح» / «من 3 أيام» — بيقبل 'YYYY-MM-DD' أو ISO أو ms
function relDay(d) {
  let idx;
  if (typeof d === 'number') idx = dayIndex(today(new Date(d)));
  else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) idx = dayIndex(d);
  else if (d) { const t = new Date(d); if (!isNaN(t)) idx = dayIndex(today(t)); }
  if (idx === undefined || isNaN(idx)) return '';
  const diff = todayIndex() - idx;
  if (diff <= 0) return 'النهارده';
  if (diff === 1) return 'إمبارح';
  return `من ${nDays(diff)}`;
}

function dueText(st) {
  const d = (st.due | 0) - todayIndex();
  if (d <= 0) return 'النهارده';
  if (d === 1) return 'بكرة';
  return `بعد ${nDays(d)}`;
}

// سطر تحية حسب الوقت
function dayLine() {
  const h = new Date().getHours();
  if (h < 5) return 'سهران؟ جولة سريعة وبعدين ارتاح';
  if (h < 12) return 'صباح الخير! كلمتين دلوقتي أحسن من ساعة بكرة';
  if (h < 18) return 'يلا نحفظ شوية كلمات؟';
  return 'مساء الخير! جولة صغيرة قبل النوم؟';
}

// نقط المرحلة ●●○○ : جديدة 0 · بتتعلمها 1 · عارفها 2–3 · ثابتة 4
function dotsHtml(id) {
  const st = stage(id), s = getState(id);
  const on = st === 'new' ? 0 : st === 'learning' ? 1 : st === 'known' ? (s.box >= 3 ? 3 : 2) : 4;
  let dots = '';
  for (let i = 0; i < 4; i++) dots += `<i class="${i < on ? 'on' : ''}"></i>`;
  return `<span class="dots" data-stage="${st}" title="${STAGE_AR[st]}" aria-label="${STAGE_AR[st]}">${dots}</span>`;
}

// بار متقسّم: ثابتة / عارفها / بتتعلمها (الجديدة = الخلفية)
function stackBar(c, cls = '') {
  const t = c.total || 1;
  const seg = (k, n) => (n > 0 ? `<i class="s-${k}" style="width:${((100 * n) / t).toFixed(1)}%"></i>` : '');
  return `<div class="stack-bar ${cls}" role="img" aria-label="ثابتة ${c.mastered} · عارفها ${c.known} · بتتعلمها ${c.learning} · جديدة ${c.new}">${seg('mastered', c.mastered)}${seg('known', c.known)}${seg('learning', c.learning)}</div>`;
}

function emptyCard(icon, text, href, label) {
  return `<div class="card"><div class="empty"><div class="big">${icon}</div><p>${esc(text)}</p></div>${href ? `<a class="btn btn-primary btn-big" href="${href}">${esc(label)}</a>` : ''}</div>`;
}

// كارت الحلقة: videos.json بيتحمّل في الخلفية، فلو لسه ما وصلش نملا المكان لما يوصل
function fillVideoSlot(slot, html) {
  if (!slot) return;
  const fill = () => { if (slot.isConnected) slot.outerHTML = html() || ''; };
  if (videosLoaded()) fill(); else loadVideos().then(fill);
}

// ====================================================================
// الرئيسية
// ====================================================================
const starsHtml = st => `<span class="ln-stars" aria-label="${st.stars} نجوم">${[st.star1, st.star2, st.star3].map(x => (x ? '⭐' : '<i class="off">☆</i>')).join('')}<span class="${st.passed ? '' : 'off'}">🏁</span><span class="${st.crown ? '' : 'off'}">👑</span></span>`;

export function renderHome(root) {
  const s = settings();
  const name = String(s.name || '').trim();
  const c = counts();
  const day = todayRec();
  const streak = store.state.streak || { current: 0, best: 0 };
  const lv = level();
  const m = mission();
  const n = m.lesson;
  const l = lessonOf(n);
  const st = m.status || lessonStatus(n);
  const step = m.step || nextStep(n, st);
  const ls = store.state.lastSession;
  let lastLine = '';
  if (ls && (ls.total | 0) > 0) {
    const rel = relDay(ls.date);
    lastLine = `آخر جلسة${rel ? ' ' + rel : ''}: ${ls.ok | 0} من ${ls.total | 0} صح · +${ls.xp | 0} XP`;
  }
  const missionBody = m.mode === 'goal' || m.review
    ? `<p class="hint">${m.answers} من ${m.goal} إجابة${m.review ? ` · ${m.due} كلمة مستحقة` : ''}</p><div class="bar${m.done ? ' good' : ''}"><i style="width:${pct(Math.min(m.answers, m.goal), m.goal)}%"></i></div>`
    : `<div class="row between ms-lesson"><div class="grow"><b>الدرس ${n}</b> <bdi class="de muted">${esc(l ? l.title : '')}</bdi></div>${starsHtml(st)}</div>
       <div class="bar${st.passed ? ' good' : ''}"><i style="width:${st.pct}%"></i></div>`;
  const cta = m.mode === 'goal'
    ? `<a class="btn btn-primary btn-big" href="#/session">ابدأ المذاكرة</a>`
    : m.review ? `<a class="btn btn-primary btn-big ms-cta" href="${step.href}">${step.icon} ${esc(step.label)}</a><p class="hint center">${esc(step.hint || '')}</p>`
    : `<a class="btn btn-primary btn-big ms-cta" href="${step.href}">${step.icon} ${esc(step.label)}</a><p class="hint center">${esc(step.hint || '')}</p>`;

  root.innerHTML = `
  <section class="card home-hero">
    <div class="row between"><h1 class="home-greet">أهلًا يا ${esc(name || 'بطل')}</h1><a class="chip blue lv-chip" href="#/stats" aria-label="المستوى">مستوى ${lv.level}</a></div>
    <p class="hint">${esc(dayLine())}</p>
    <div class="bar lv-bar" title="${lv.xp - lv.from} من ${lv.to - lv.from} XP للمستوى الجاي"><i style="width:${lv.pct}%"></i></div>
    <div class="row wrap chips-row">
      <span class="chip ${streak.current > 0 ? 'warn' : ''}" id="streakChip">🔥 ${streak.current > 0 ? esc(nDays(streak.current)) + ' ورا بعض' : 'ابدأ الستريك النهارده'}</span>
      <span class="chip blue">${store.state.xp | 0} XP</span>
      <span class="chip">${day.done | 0} إجابة النهارده</span>
    </div>
  </section>

  ${s.introSeen ? '' : `<section class="card intro-card" id="introCard">
    <h2>إزاي تستخدم الأبلكيشن</h2>
    <ol class="intro-list">
      <li><b>مهمة النهارده</b>: درس كل يوم — الزرار الأزرق بيوديك للخطوة الجاية على طول.</li>
      <li>كل درس: ⭐ احفظ الكلمات ← ✍️ اكتبها صح ← 🧱 كوّن جمل ← 🏁 امتحان ← 👑 تثبيت بعد ٣ أيام.</li>
      <li>العب في أي وقت — أي كلمة تغلط فيها بترجعلك في المراجعة.</li>
      <li>حافظ درس قبل كده؟ ادخل <b>امتحانه</b> على طول من صفحة الدرس، ولو نجحت يتحسب خلصان.</li>
      <li>التذكير بيشتغل لوحده كل ساعة لو مهمة النهارده لسه ما خلصتش.</li>
    </ol>
    <button type="button" class="btn btn-primary" id="introOk">فهمت، يلا بينا</button>
  </section>`}

  <section class="card mission ${m.done ? 'done' : ''}">
    <div class="row between"><h2>مهمة النهارده</h2>${m.done ? '<span class="chip good">✓ خلصت</span>' : '<span class="chip warn">لسه</span>'}</div>
    <p class="ms-title">${m.done ? 'عاش! خلصت مهمة النهارده — أي مذاكرة زيادة بتثبّت أكتر' : esc(m.title)}</p>
    ${missionBody}
    ${cta}
    ${m.mode === 'goal' ? '' : `<a class="btn btn-ghost" href="#/lesson/${n}">خطة الدرس ${n}</a>`}
  </section>

  <div data-slot="notify"></div>

  ${c.due > 0 ? `<a class="card list-item link due-card" href="#/session"><span class="due-num">${c.due}</span><div class="grow"><b>كلمات مستحقة للمراجعة</b><p class="muted small">المراجعة في وقتها = مش هتنسى</p></div><span class="btn btn-navy">راجع</span></a>` : ''}

  <div class="grid2 home-quick">
    <a class="card quick" href="#/games"><span>🎮</span><b>الألعاب</b><small>12 لعبة بالقلوب</small></a>
    <a class="card quick" href="#/session"><span>🎯</span><b>مذاكرة حرة</b><small>${esc(planText(c, c.total - c.new > 0))}</small></a>
    <a class="card quick" href="#/ref"><span>📒</span><b>المراجع</b><small>أفعال · استفهام · حروف · أرقام</small></a>
    <a class="card quick" href="#/stats"><span>📈</span><b>إحصائياتي</b><small>${countPassed()} درس خلصان من ${DATA.lessons.length}</small></a>
  </div>

  <section class="card home-games">
    <div class="row between"><h2>العب على الدرس ${n}</h2><a class="btn btn-ghost sm" href="#/games">الكل</a></div>
    <div class="hg-row">
      <a class="hg" href="#/game/listen-write?lesson=${n}"><span>🎧</span>اسمع واكتب</a>
      <a class="hg" href="#/game/articles?lesson=${n}"><span>🎯</span>der die das</a>
      <a class="hg" href="#/game/sentence?lesson=${n}"><span>🧱</span>كوّن الجملة</a>
      <a class="hg" href="#/game/truefalse?lesson=${n}"><span>⚡</span>صح ولا غلط</a>
    </div>
  </section>

  <div data-slot="video"></div>
  ${lastLine ? `<p class="muted small center last-session">${esc(lastLine)}</p>` : ''}
  <p class="muted small center credit">إنشاء وتصميم عبد الله جمال</p>`;

  renderUpdateBanner(root);
  fillVideoSlot(root.querySelector('[data-slot="video"]'), homeVideoTeaserHtml);
  fillNotifySlot(root.querySelector('[data-slot="notify"]'));
  const introOk = root.querySelector('#introOk');
  if (introOk) introOk.addEventListener('click', () => { s.introSeen = true; store.save(); root.querySelector('#introCard').remove(); });
}

const countPassed = () => sortedLessons().filter(l => lessonStatus(l.n).passed).length;

// كارت «فعّل التذكير» (الأندرويد بس، لحد ما الإذن يتدّي أو يتقفل)
function fillNotifySlot(slot) {
  if (!slot || !notifySupported() || settings().notifyCardHidden) { if (slot) slot.remove(); return; }
  notifyPermission().then(p => {
    if (!slot.isConnected) return;
    if (p === 'granted' || p === 'unsupported') { slot.remove(); return; }
    slot.outerHTML = `<section class="card notify-card" id="notifyCard">
      <div class="row"><span class="nc-ico" aria-hidden="true">🔔</span><div class="grow"><b>فعّل التذكير كل ساعة</b><p class="muted small">هيفكّرك تذاكر لو مهمة النهارده لسه ما خلصتش — وبيسكت أول ما تخلّص.</p></div></div>
      <div class="grid2"><button type="button" class="btn btn-primary" id="ncOn">فعّل</button><button type="button" class="btn btn-ghost" id="ncLater">مش دلوقتي</button></div>
    </section>`;
    const card = document.getElementById('notifyCard');
    if (!card) return;
    card.querySelector('#ncOn').addEventListener('click', async () => {
      const ok = await requestNotifyPermission();
      toast(ok ? 'التذكير اتفعّل' : 'من غير الإذن مش هقدر أبعت تذكير — تقدر تفعّله من إعدادات التليفون');
      if (ok || p === 'denied') card.remove();
    });
    card.querySelector('#ncLater').addEventListener('click', () => { settings().notifyCardHidden = true; store.save(); card.remove(); });
  });
}

// ====================================================================
// الدروس
// ====================================================================
export function renderLessons(root) {
  const lessons = sortedLessons();
  if (!lessons.length) { root.innerHTML = emptyCard('📚', 'مفيش دروس متحمّلة', '#/home', 'الرئيسية'); return; }
  const total = DATA.words.length;
  const learnedAll = learnedIn(DATA.words);
  const cur = currentLesson();
  const sts = lessons.map(l => lessonStatus(l.n));
  const passed = sts.filter(s => s.passed).length, crowns = sts.filter(s => s.crown).length;

  const cards = lessons.map((l, i) => {
    const s = sts[i];
    const c = lessonCounts(l.n);
    let chip = '';
    if (l.n === cur && !s.passed) chip = '<span class="chip blue">دلوقتي</span>';
    else if (s.needsReview) chip = '<span class="chip warn">راجعه</span>';
    else if (s.crownReady) chip = '<span class="chip warn">👑 التثبيت متاح</span>';
    else if (c.due > 0) chip = `<span class="chip warn">مستحق ${c.due}</span>`;
    return `
    <a class="list-item link lesson-card${s.passed ? ' done' : ''}${l.n === cur ? ' current' : ''}" href="#/lesson/${l.n}">
      <span class="lesson-num${s.crown ? ' crown' : s.passed ? ' passed' : ''}">${s.crown ? '👑' : s.passed ? '✓' : l.n}</span>
      <div class="grow">
        <div class="row between"><bdi class="de lesson-title">${esc(l.title)}</bdi>${chip}</div>
        <p class="muted small lesson-goal">${esc(l.goal || '')}</p>
        <div class="row between ln-meta">${starsHtml(s)}<span class="n muted small">${s.pct}%</span></div>
        <div class="bar${s.passed ? ' good' : ''}"><i style="width:${s.pct}%"></i></div>
      </div>
    </a>`;
  }).join('');

  root.innerHTML = `
  <section class="card tint flat lessons-sum">
    <div class="row between"><h2>الدروس 1–${lessons[lessons.length - 1].n}</h2><span class="chip blue">🏁 ${passed}/${lessons.length} · 👑 ${crowns}</span></div>
    <div class="bar"><i style="width:${pct(learnedAll, total)}%"></i></div>
    <p class="hint">اتعلمت ${esc(nWords(learnedAll))} من ${total}. الدرس بيتحسب «خلصان» لما تاخد نجومه الـ٣ وتنجح في امتحانه 🏁، وبعد ٣ أيام تاخد التاج 👑 لو لسه فاكره.</p>
  </section>
  <section class="card basics">
    <h2 class="sec-title">الأساسيات والمراجع</h2>
    <div class="basics-row">
      <a class="hg" href="#/ref/alphabet"><span>🔠</span>الحروف</a>
      <a class="hg" href="#/ref/numbers"><span>🔢</span>الأرقام</a>
      <a class="hg" href="#/ref/verbs"><span>🔁</span>الأفعال</a>
      <a class="hg" href="#/ref/wwords"><span>❓</span>الاستفهام</a>
      <a class="hg" href="#/ref/grammar"><span>📖</span>الشرح</a>
      <a class="hg" href="#/library"><span>📚</span>المكتبة</a>
    </div>
  </section>
  <div class="list lesson-list">${cards}</div>`;
}

// ====================================================================
// درس واحد
// ====================================================================
export function renderLesson(root, n) {
  const l = lessonOf(n);
  if (!l) { root.innerHTML = emptyCard('🤔', 'الدرس ده مش موجود', '#/lessons', 'الدروس'); return; }
  const words = wordsOfLesson(l.n);
  const st = lessonStatus(l.n);
  const step = nextStep(l.n, st);
  const sents = sentencesOf(l.n);
  const gram = grammarOf(l.n);

  const planRow = (done, icon, title, val, href, btn, locked) => `
    <div class="plan-row${done ? ' done' : ''}${locked ? ' locked' : ''}">
      <span class="plan-ico" aria-hidden="true">${done ? '✅' : icon}</span>
      <div class="grow"><b>${title}</b>${val ? `<div class="muted small">${val}</div>` : ''}</div>
      ${href ? `<a class="btn ${done ? 'btn-ghost' : 'btn-navy'} plan-btn" href="${href}">${btn}</a>` : ''}
    </div>`;

  const rows = words.map(w => {
    const s = getState(w.id);
    const tr = translitOf(w);
    const pl = pluralOf(w);
    const typed = typedCount(w.id) > 0;
    const more = [`<span>النوع: ${esc(KIND_AR[w.k] || 'كلمة')}</span>`];
    if (w.k === 'noun') more.push(pl ? `<span>الجمع: <bdi class="de">${esc(pl)}</bdi></span>` : '<span>من غير جمع</span>');
    if (w.sub) more.push(`<span>ملحوظة: <bdi class="de">${esc(w.sub)}</bdi></span>`);
    more.push(s.seen > 0
      ? `<span>شفتها ${esc(nTimes(s.seen))} · صح ${s.ok | 0} · غلط ${s.bad | 0} · المراجعة الجاية ${esc(dueText(s))}${w.k !== 'phrase' ? ` · ${typed ? '✍️ كتبتها صح' : '✍️ لسه ما كتبتهاش'}` : ''}</span>`
      : '<span>لسه ما ذاكرتهاش</span>');
    return `
    <div class="word-row" data-id="${esc(w.id)}" role="button" tabindex="0" aria-expanded="false">
      <button class="btn btn-icon say" type="button" data-id="${esc(w.id)}" aria-label="اسمع النطق">🔊</button>
      <div class="grow">
        <div class="word-top">${deHtml(w)}${dotsHtml(w.id)}${typed && w.k !== 'phrase' ? '<span class="typed-mark" title="كتبتها صح">✍️</span>' : ''}</div>
        <div class="word-ar">${esc(w.ar)}${tr ? `<span class="word-tr">${esc(tr)}</span>` : ''}</div>
        <div class="word-more" hidden>${more.join('')}</div>
      </div>
    </div>`;
  }).join('');

  root.innerHTML = `
  <section class="card lesson-head">
    <div class="row">
      <span class="lesson-num lg${st.crown ? ' crown' : st.passed ? ' passed' : ''}">${st.crown ? '👑' : l.n}</span>
      <div class="grow"><h1 class="lesson-title"><bdi class="de">${esc(l.title)}</bdi></h1><p class="hint">${esc(l.goal || '')}</p></div>
    </div>
    ${l.gram ? `<p class="muted small gram">${esc(l.gram)}</p>` : ''}
    <div class="row between ln-meta">${starsHtml(st)}<span class="n muted">${st.pct}%</span></div>
    <div class="bar${st.passed ? ' good' : ''}"><i style="width:${st.pct}%"></i></div>
    ${step.key !== 'done' ? `<a class="btn btn-primary btn-big next-step" href="${step.href}">${step.icon} ${esc(step.label)}</a><p class="hint center">${esc(step.hint || '')}</p>` : '<p class="goal-done center">👑 الدرس ده ثابت — عاش!</p>'}
  </section>

  <section class="card plan">
    <h2 class="sec-title">خطة الدرس — بضمير</h2>
    ${planRow(st.star1, '⭐', '١. احفظ كل الكلمات', `${st.learned} من ${st.words} كلمة`, `#/session?lesson=${l.n}`, 'ذاكر')}
    ${planRow(st.star2, '✍️', '٢. اكتبها صح (الأسماء بأداتها)', `${st.typed} من ${st.typeNeed} كلمة`, `#/game/listen-write?lesson=${l.n}&mode=drill`, 'اكتب')}
    ${planRow(st.star3, '🧱', '٣. كوّن جمل وجاوب أسئلة', st.itemsTotal ? `${st.itemsDone} من ${st.itemsNeed} مطلوبين (من ${st.itemsTotal})` : 'مفيش جمل للدرس ده', st.itemsTotal ? `#/drill/${l.n}` : '', 'جمل')}
    ${planRow(st.passed, '🏁', '٤. امتحان الدرس (٣ قلوب)', st.passed ? `نجحت${st.best ? ` · ${st.best} نقطة` : ''}` : st.tries ? `حاولت ${nTimes(st.tries)}` : 'كل كلمة لازم تتكتب صح', `#/exam/${l.n}`, st.passed ? 'تاني' : 'امتحان')}
    ${planRow(st.crown, '👑', '٥. امتحان التثبيت بعد ٣ أيام', st.crown ? 'الدرس ثابت' : st.passed ? (st.crownReady ? 'متاح دلوقتي!' : `بعد ${nDays(st.crownIn)}`) : 'بيفتح بعد الامتحان', st.passed && !st.crown && st.crownReady ? `#/exam/${l.n}?kind=crown` : '', 'تثبيت', !st.passed)}
  </section>

  <div data-slot="video"></div>

  <section class="card lesson-games">
    <h2 class="sec-title">العب على الدرس ده</h2>
    <div class="hg-row">
      <a class="hg" href="#/game/listen-write?lesson=${l.n}"><span>🎧</span>اسمع واكتب</a>
      <a class="hg" href="#/game/articles?lesson=${l.n}"><span>🎯</span>der die das</a>
      <a class="hg" href="#/game/sentence?lesson=${l.n}"><span>🧱</span>كوّن الجملة</a>
      <a class="hg" href="#/game/cloze?lesson=${l.n}"><span>🫧</span>الكلمة الناقصة</a>
      <a class="hg" href="#/game/scramble?lesson=${l.n}"><span>🔤</span>الحروف المتلخبطة</a>
      <a class="hg" href="#/match?lesson=${l.n}"><span>🧩</span>توصيل</a>
    </div>
  </section>

  ${gram.length ? `<details class="card lesson-gram"><summary><b>شرح الدرس</b> <span class="muted small">${gram.length} نقطة</span></summary>${grammarHtml(l.n)}</details>` : ''}

  <h2 class="sec-title row">الكلمات <span class="chip blue">${words.length}</span></h2>
  ${words.length ? `<div class="list word-list">${rows}</div>` : '<div class="empty"><div class="big">🫙</div><p>مفيش كلمات في الدرس ده</p></div>'}

  ${sents.length ? `<details class="card lesson-sents"><summary><b>جمل الدرس</b> <span class="muted small">${sents.filter(x => itemDone(x.id)).length}/${sents.length} اتعملت</span></summary>
    <div class="list">${sents.map(x => `<div class="list-item sent-row"><button type="button" class="btn btn-icon sm" data-say="${esc(x.de)}" aria-label="اسمع">🔊</button><div class="grow"><bdi class="de">${esc(x.de)}</bdi><div class="muted small">${esc(x.ar)}</div></div>${itemDone(x.id) ? '<span class="chip good">✓</span>' : ''}</div>`).join('')}</div>
  </details>` : ''}`;

  fillVideoSlot(root.querySelector('[data-slot="video"]'), () => videoTeaserHtml(l.n));
  const gramEl = root.querySelector('.lesson-gram');
  if (gramEl) wireRefSay(gramEl);
  const sentsEl = root.querySelector('.lesson-sents');
  if (sentsEl) wireRefSay(sentsEl);

  const list = root.querySelector('.word-list');
  if (!list) return;

  const toggleRow = row => {
    const more = row.querySelector('.word-more');
    if (!more) return;
    const open = more.hidden;
    more.hidden = !open;
    row.setAttribute('aria-expanded', String(open));
  };
  const speakWord = btn => {
    const w = DATA.byId.get(btn.dataset.id);
    if (!w) return;
    list.querySelectorAll('.say.playing').forEach(b => b.classList.remove('playing'));
    btn.classList.add('playing');
    play(w).then(() => btn.classList.remove('playing'));
  };
  list.addEventListener('click', e => {
    const say = e.target.closest('.say');
    if (say) { e.stopPropagation(); speakWord(say); return; }
    const row = e.target.closest('.word-row');
    if (row) toggleRow(row);
  });
  list.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('word-row')) {
      e.preventDefault();
      toggleRow(e.target);
    }
  });
}

// ====================================================================
// إحصائياتي
// ====================================================================
// الأوسمة — بتتحسب من التقدّم (مفيش حالة زيادة)
function badgesHtml(v) {
  const sentOk = Object.keys(store.state.items || {}).filter(k => /^s\d/.test(k) && (store.state.items[k].ok | 0) > 0).length;
  const list = [
    ['🌱', 'أول كلمة', v.learned >= 1], ['📚', '50 كلمة', v.learned >= 50], ['🧠', '150 كلمة', v.learned >= 150], ['🏆', 'كل الكلمات', v.total > 0 && v.learned >= v.total],
    ['✍️', '25 كلمة كتبتها صح', v.typedAll >= 25], ['🖊️', '100 كلمة كتبتها صح', v.typedAll >= 100],
    ['🧱', '50 جملة صح', sentOk >= 50], ['🔥', '3 أيام ورا بعض', v.streakBest >= 3], ['🔥', 'أسبوع كامل', v.streakBest >= 7], ['☄️', 'شهر كامل', v.streakBest >= 30],
    ['🏁', 'أول درس خلصان', v.passed >= 1], ['🎓', '5 دروس', v.passed >= 5], ['🚀', 'الـ 15 درس', v.passed >= 15],
    ['👑', 'أول تاج', v.crowns >= 1], ['💎', '5 تيجان', v.crowns >= 5],
    ['🎮', '10 ألعاب', v.games >= 10], ['🕹️', '50 لعبة', v.games >= 50], ['🏅', 'مستوى 5', v.level >= 5], ['🌟', 'مستوى 10', v.level >= 10],
  ];
  const got = list.filter(b => b[2]).length;
  return `<section class="card badges"><div class="row between"><h2>الأوسمة</h2><span class="chip blue">${got}/${list.length}</span></div>
    <div class="badge-grid">${list.map(([ico, label, ok]) => `<div class="badge-item${ok ? ' on' : ''}" title="${esc(label)}"><span>${ok ? ico : '🔒'}</span><small>${esc(label)}</small></div>`).join('')}</div></section>`;
}

export function renderStats(root) {
  const c = counts();
  const learned = learnedIn(DATA.words);
  const streak = store.state.streak || { current: 0, best: 0 };
  const days = store.state.days || {};
  const goal = goalOf();
  const xp = store.state.xp | 0;
  // يوم نشاط = نفس قاعدة الستريك: إجابات، أو XP (لعبة التوصيل)، أو جلسة، أو لعبة
  const active = r => !!r && ((r.done | 0) > 0 || (r.xp | 0) > 0 || (r.sessions | 0) > 0 || (r.games | 0) > 0);
  const anyActivity = Object.values(days).some(active);

  // شبكة النشاط: 8 صفوف (أسابيع) × 7 أيام، الصف الأخير هو الأسبوع الحالي
  const t = todayIndex();
  const dow = new Date().getDay();            // 0 الأحد … 6 السبت
  const sinceSat = (dow + 1) % 7;             // كام يوم فات من السبت
  const start = t - sinceSat - 49;            // سبت أول أسبوع من الـ 8
  let cells = WEEKDAYS.map(d => `<span class="hd">${d}</span>`).join('');
  let activeDays = 0, answers = 0, sessions = 0;
  for (let i = 0; i < 56; i++) {
    const idx = start + i;
    if (idx > t) { cells += '<i class="heat-cell future"></i>'; continue; }
    const date = dateFromIndex(idx);
    const rec = days[date];
    const done = rec ? rec.done | 0 : 0;
    const on = active(rec);
    if (on) activeDays++;
    answers += done;
    sessions += rec ? rec.sessions | 0 : 0;
    const lv = !on ? 0 : done >= goal ? 4 : done >= goal * 0.66 ? 3 : done >= goal * 0.33 ? 2 : 1;
    cells += `<i class="heat-cell l${lv}${idx === t ? ' today' : ''}" title="${date} · ${esc(nAnswers(done))}"></i>`;
  }

  const lessonRows = sortedLessons().map(l => {
    const lc = lessonCounts(l.n);
    const ls = lessonStatus(l.n);
    return `
    <a class="lesson-stat" href="#/lesson/${l.n}">
      <div class="row between">
        <span class="row"><span class="lesson-num sm${ls.crown ? ' crown' : ls.passed ? ' passed' : ''}">${ls.crown ? '👑' : ls.passed ? '✓' : l.n}</span><bdi class="de">${esc(l.title)}</bdi></span>
        ${starsHtml(ls)}
      </div>
      ${stackBar(lc, 'sm')}
    </a>`;
  }).join('');
  const lv = level();
  const gamesPlayed = Object.values(store.state.games || {}).reduce((a, r) => a + (r.plays | 0), 0);
  const allSt = sortedLessons().map(l => lessonStatus(l.n));
  const typedAll = DATA.words.filter(w => typedCount(w.id) > 0).length;

  root.innerHTML = `
  <section class="card">
    <div class="row between"><h2>كلماتي</h2><span class="chip blue">${learned}/${c.total}</span></div>
    ${stackBar(c)}
    <div class="legend">
      <span><i class="s-mastered"></i>ثابتة ${c.mastered}</span>
      <span><i class="s-known"></i>عارفها ${c.known}</span>
      <span><i class="s-learning"></i>بتتعلمها ${c.learning}</span>
      <span><i class="s-new"></i>جديدة ${c.new}</span>
    </div>
    <p class="hint">${learned ? `اتعلمت ${esc(nWords(learned))} من ${c.total} — ${pct(learned, c.total)}% من الطريق` : 'لسه ما اتعلمتش ولا كلمة — أول جلسة هتغيّر الصورة دي'}</p>
  </section>

  <div class="grid2 stat-cards">
    <div class="card stat-card"><b class="stat-num">${lv.level}</b><span>المستوى</span><small>${xp} XP · فاضل ${lv.to - xp} للمستوى الجاي</small></div>
    <div class="card stat-card"><b class="stat-num">🔥 ${streak.current | 0}</b><span>ستريك — أيام ورا بعض</span><small>${(streak.best | 0) > 0 ? `أفضل ستريك: ${esc(nDays(streak.best | 0))}` : 'أول جلسة هتبدأ العدّاد'}</small></div>
    <div class="card stat-card"><b class="stat-num">🏁 ${allSt.filter(s => s.passed).length}</b><span>دروس خلصانة</span><small>👑 ${allSt.filter(s => s.crown).length} ثابتة · ⭐ ${allSt.reduce((a, s) => a + s.stars, 0)} نجمة</small></div>
    <div class="card stat-card"><b class="stat-num">✍️ ${typedAll}</b><span>كلمة كتبتها صح</span><small>${gamesPlayed} لعبة لعبتها</small></div>
  </div>

  <section class="card">
    <h2>نشاطي — آخر 8 أسابيع</h2>
    <div class="heat" role="img" aria-label="نشاط آخر 8 أسابيع">${cells}</div>
    <p class="hint">${anyActivity
      ? `ذاكرت في ${esc(nDays(activeDays))} · ${esc(nAnswers(answers))} · ${esc(nSessions(sessions))}`
      : 'لسه مفيش نشاط. أول جلسة هتنوّر الشبكة دي'}</p>
    ${anyActivity ? '' : '<a class="btn btn-primary btn-big" href="#/session">ابدأ أول جلسة</a>'}
  </section>

  <section class="card">
    <h2>تقدمي في الدروس</h2>
    <div class="lesson-stats">${lessonRows}</div>
  </section>

  ${badgesHtml({ learned, typedAll, streakBest: Math.max(streak.best | 0, streak.current | 0), passed: allSt.filter(s => s.passed).length, crowns: allSt.filter(s => s.crown).length, games: gamesPlayed, level: lv.level, total: c.total })}

  <button type="button" class="btn btn-primary btn-big" id="btnShareProgress">ابعت تقدمك لصاحبك</button>`;

  root.querySelector('#btnShareProgress').addEventListener('click', async () => {
    const name = String(settings().name || '').trim() || 'أنا';
    const passedL = allSt.filter(s => s.passed).map(s => s.n);
    const text = [
      `${name} في Wortschatz:`,
      `مستوى ${lv.level} · ${xp} XP · ستريك ${streak.current | 0} يوم`,
      `اتعلمت ${learned} كلمة من ${c.total} · كتبت ${typedAll} صح`,
      `خلصت ${passedL.length} درس${passedL.length ? ` (${passedL.join('، ')})` : ''} · ${allSt.filter(s => s.crown).length} ثابتين`,
      'وانت وصلت لفين؟',
    ].join('\n');
    const ok = await shareText('تقدمي في الألماني', text);
    if (!ok) {
      try { await navigator.clipboard.writeText(text); toast('اتنسخ — ابعته لصاحبك على واتساب'); }
      catch (e) { toast('مقدرتش أشارك — خد سكرين شوت'); }
    }
  });
}

// ====================================================================
// الإعدادات
// ====================================================================
const stepperHtml = (key, val, min, max, step, label) =>
  `<div class="stepper ctl" data-key="${key}" data-min="${min}" data-max="${max}" data-step="${step}" role="group" aria-label="${esc(label)}">
    <button type="button" data-d="1" aria-label="زوّد">+</button><b>${+val || min}</b><button type="button" data-d="-1" aria-label="قلّل">−</button>
  </div>`;
const switchHtml = (key, on, label) =>
  `<label class="switch ctl"><input type="checkbox" data-key="${key}"${on ? ' checked' : ''} aria-label="${esc(label)}"><i></i></label>`;

// تنزيل ملف نصّي (Blob) — بيرجع true لو اتعمل
function downloadText(text, name) {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 5000);
    return true;
  } catch (e) {
    console.warn('[settings] download failed:', e);
    return false;
  }
}

async function exportBackup() {
  const json = store.exportJSON();
  const name = 'wortschatz-backup.json';
  // في أبلكيشن الأندرويد الـ WebView مبيعرفش ينزّل ملفات (a.click() بيعدّي من غير ما يحفظ حاجة) →
  // نكتب الملف في الكاش ونبعته بالمشاركة (درايف / واتساب / الملفات)، ونقول «اتبعتت» بس لو اتبعتت فعلًا
  if (isNative()) {
    let ok = false;
    try {
      const FS = plugin('Filesystem');
      if (FS) {
        const r = await FS.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
        ok = await shareFile('Wortschatz backup', r && r.uri);
      }
    } catch (e) { console.warn('[settings] native backup failed:', e); }
    if (ok) toast('اتبعتت النسخة — احفظها في درايف أو ابعتها لنفسك');
    else {
      toast('النسخة ما اتبعتتش — استخدم «انسخ النسخة كنص» وابعتها لنفسك');
      const d = document.querySelector('details.paste');
      if (d) d.open = true;
    }
    return;
  }
  // في المتصفح: لو بيدعم المشاركة بملفات نبعت الملف، غير كده ننزّله
  try {
    if (navigator.share && navigator.canShare && typeof File === 'function') {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Wortschatz backup' })
          .then(() => toast('اتبعتت النسخة'))
          .catch(err => {
            if (err && err.name === 'AbortError') return;        // المستخدم قفل نافذة المشاركة
            console.warn('[settings] share failed:', err);
            if (downloadText(json, name)) toast('اتحفظت نسخة ' + name);
          });
        return;
      }
    }
  } catch (e) { console.warn('[settings] share unavailable:', e); }
  toast(downloadText(json, name) ? 'اتحفظت نسخة ' + name : 'مقدرتش أحفظ الملف — جرّب النسخ كنص');
}

export function renderSettings(root) {
  const s = settings();
  const theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';

  const mode = s.missionMode === 'goal' ? 'goal' : 'lesson';
  root.innerHTML = `
  <a class="card list-item link" href="#/stats"><span class="set-ico" aria-hidden="true">📈</span><div class="grow"><b>إحصائياتي</b><p class="muted small">المستوى، الستريك، الدروس والألعاب</p></div><span aria-hidden="true">‹</span></a>

  <section class="card">
    <h2 class="sec-title">المظهر</h2>
    <div class="seg" id="themeSeg" role="group" aria-label="المظهر">
      <button type="button" data-v="light" aria-pressed="${theme === 'light'}">فاتح</button>
      <button type="button" data-v="dark" aria-pressed="${theme === 'dark'}">غامق</button>
      <button type="button" data-v="system" aria-pressed="${theme === 'system'}">النظام</button>
    </div>
  </section>

  <section class="card">
    <h2 class="sec-title">المذاكرة</h2>
    <div class="setting-row">
      <div><b>الهدف اليومي</b><p class="hint">إجابات في اليوم</p></div>
      ${stepperHtml('dailyGoal', s.dailyGoal, 5, 100, 5, 'الهدف اليومي')}
    </div>
    <div class="setting-row">
      <div><b>كلمات جديدة في الجلسة</b><p class="hint">كل جلسة مذاكرة</p></div>
      ${stepperHtml('newPerSession', s.newPerSession, 3, 20, 1, 'كلمات جديدة في الجلسة')}
    </div>
    <div class="setting-row">
      <div><b>تمارين الكتابة</b><p class="hint">اكتب الكلمة بالألماني لما تبقى ثابتة</p></div>
      ${switchHtml('typing', s.typing !== false, 'تمارين الكتابة')}
    </div>
    <div class="setting-row">
      <div><b>تشغيل الصوت تلقائي</b><p class="hint">ينطق الكلمة أول ما تظهر</p></div>
      ${switchHtml('autoplay', s.autoplay !== false, 'تشغيل الصوت تلقائي')}
    </div>
    <div class="setting-row col">
      <label for="nameInput"><b>اسمك</b><p class="hint">عشان نسلّم عليك في الرئيسية</p></label>
      <input id="nameInput" class="input" type="text" maxlength="30" autocomplete="nickname" placeholder="اكتب اسمك" value="${esc(s.name || '')}">
    </div>
  </section>

  <section class="card">
    <h2 class="sec-title">مهمة النهارده</h2>
    <div class="seg" id="missionSeg" role="group" aria-label="مهمة النهارده">
      <button type="button" data-v="lesson" aria-pressed="${mode === 'lesson'}">درس كامل كل يوم</button>
      <button type="button" data-v="goal" aria-pressed="${mode === 'goal'}">هدف إجابات</button>
    </div>
    <p class="hint set-note">«درس كامل»: المهمة بتخلص لما تنجح في امتحان درس (أو تاخد تاج) النهارده. «هدف إجابات»: لما توصل للهدف اليومي (${goalOf()} إجابة).</p>
    <p class="hint set-note">التذكير بيشتغل لوحده كل ساعة من ١٠ الصبح لـ ١٠ بالليل لو مهمة النهارده لسه — وبيسكت أول ما تخلّصها.</p>
  </section>

  <section class="card">
    <h2 class="sec-title">الصوت</h2>
    <div class="setting-row"><div><b>أصوات الألعاب</b><p class="hint">صوت الصح والغلط والفوز</p></div>${switchHtml('gameSounds', s.gameSounds !== false, 'أصوات الألعاب')}</div>
    <div class="setting-row"><div><b>نطق الجمل والأرقام والحروف</b><p class="hint" id="ttsState">بنفحص…</p></div><button type="button" class="btn" id="btnTtsTest">جرّب 🔊</button></div>
    <button type="button" class="btn btn-big" id="btnTtsInstall" hidden>نزّل الصوت الألماني للتليفون</button>
    <p class="hint">الكلمات بصوت DW الأصلي. الجمل والأرقام والحروف بصوت التليفون الألماني (Google) — لو مش شغّال نزّله من الزرار.</p>
  </section>

  <section class="card">
    <h2 class="sec-title">الفيديوهات</h2>
    <div id="videoSettings"></div>
  </section>

  <section class="card">
    <h2 class="sec-title">النسخة الاحتياطية</h2>
    <p class="hint">احفظ تقدمك أو انقله لتليفون تاني. الملف اسمه <span class="kbd">wortschatz-backup.json</span></p>
    <div class="grid2 backup-actions">
      <button type="button" class="btn" id="btnExport">حفظ نسخة</button>
      <button type="button" class="btn" id="btnImport">استرجاع نسخة</button>
    </div>
    <input type="file" id="fileImport" accept=".json,application/json" hidden>
    <details class="paste">
      <summary>نسخ ولصق كنص (لو الملفات مش شغّالة)</summary>
      <div class="stack">
        <button type="button" class="btn" id="btnCopy">انسخ النسخة كنص</button>
        <textarea id="pasteBox" class="input" rows="4" placeholder="الصق نص النسخة هنا" spellcheck="false"></textarea>
        <button type="button" class="btn" id="btnPaste">استرجع من النص</button>
      </div>
    </details>
  </section>

  <div id="updateSettings"></div>

  <section class="card">
    <h2 class="sec-title">منطقة الخطر</h2>
    <p class="hint">بيمسح الكلمات والنقاط والستريك والإعدادات — ومفيش رجوع.</p>
    <button type="button" class="btn btn-danger btn-big" id="btnReset">امسح كل التقدم</button>
  </section>

  <p class="about muted small center">Wortschatz · ${DATA.words.length} كلمة في ${DATA.lessons.length} درس<br>إنشاء وتصميم <b>عبد الله جمال</b><br>المحتوى من DW · Nicos Weg</p>`;

  const $ = sel => root.querySelector(sel);
  const rerender = () => { root.innerHTML = ''; renderSettings(root); };

  renderVideoSettings($('#videoSettings'));
  renderUpdateSettings($('#updateSettings'));

  // مهمة النهارده
  const mSeg = $('#missionSeg');
  mSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    s.missionMode = b.dataset.v;
    store.save();
    mSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    replan();
    toast(s.missionMode === 'goal' ? 'المهمة: هدف الإجابات اليومي' : 'المهمة: درس كامل كل يوم');
  });

  // الصوت الألماني
  const tState = $('#ttsState'), tInstall = $('#btnTtsInstall');
  ttsStatus().then(t => {
    if (!tState.isConnected) return;
    if (t.engine === 'native') {
      tState.textContent = t.german ? 'الصوت الألماني جاهز' : t.german === false ? '⚠️ الصوت الألماني مش متنزّل على التليفون' : 'مش قادر أتأكد — جرّب';
      tInstall.hidden = t.german === true;
    } else if (t.engine === 'web') tState.textContent = t.german ? 'صوت المتصفح الألماني' : 'في المتصفح ممكن الصوت يبقى مش ألماني';
    else tState.textContent = 'مش متاح على الجهاز ده';
  });
  $('#btnTtsTest').addEventListener('click', async () => {
    const ok = await speak('Hallo! Ich heiße Nico. Wie heißt du?');
    if (!ok) { toast('الصوت مش شغّال — نزّل الصوت الألماني'); if (tInstall) tInstall.hidden = false; }
  });
  if (tInstall) tInstall.addEventListener('click', async () => { if (!(await installGermanVoice())) toast('افتح إعدادات التليفون ← تحويل النص إلى كلام ← نزّل الألمانية'); });

  // المظهر
  const seg = $('#themeSeg');
  seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    s.theme = b.dataset.v;
    applyTheme(s.theme);
    store.save();
    seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });

  // الستيبرز
  root.querySelectorAll('.stepper').forEach(st => {
    const key = st.dataset.key, min = +st.dataset.min, max = +st.dataset.max, step = +st.dataset.step || 1;
    const out = st.querySelector('b');
    const [plus, minus] = st.querySelectorAll('button');
    const sync = () => { const v = +s[key] || min; out.textContent = v; plus.disabled = v >= max; minus.disabled = v <= min; };
    st.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const cur = +s[key] || min;
      const v = clamp(Math.round((cur + step * +b.dataset.d) / step) * step, min, max);
      if (v === cur) return;
      s[key] = v;
      store.save();
      sync();
    });
    sync();
  });

  // السويتشات
  root.querySelectorAll('.switch input').forEach(inp => {
    inp.addEventListener('change', () => {
      s[inp.dataset.key] = inp.checked;
      store.save();
      toast(inp.checked ? 'اتفعّل' : 'اتقفل');
    });
  });

  // الاسم — بيتحفظ وهو بيكتب
  $('#nameInput').addEventListener('input', e => {
    s.name = String(e.target.value || '').trim().slice(0, 30);
    store.save();
  });

  // النسخة الاحتياطية
  $('#btnExport').addEventListener('click', exportBackup);
  const file = $('#fileImport');
  $('#btnImport').addEventListener('click', () => file.click());
  const importText = text => {
    if (store.importJSON(text)) {
      applyTheme(settings().theme);
      toast('استرجعنا نسختك');
      rerender();
    } else {
      toast('الملف ده مش نسخة Wortschatz صالحة');
    }
  };
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => importText(String(r.result || ''));
    r.onerror = () => toast('مقدرتش أقرا الملف');
    r.readAsText(f);
    file.value = '';
  });
  $('#btnCopy').addEventListener('click', () => {
    const json = store.exportJSON();
    const box = $('#pasteBox');
    const fallback = () => {
      // نحط النص في الصندوق عشان يقدر يعمل تحديد ونسخ بإيده
      box.value = json;
      try { box.focus(); box.select(); document.execCommand && document.execCommand('copy'); } catch (e) { /* ignore */ }
      toast('النسخة في الصندوق — حدّدها وانسخها');
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(() => toast('اتنسخت — الصقها في أي مكان'), fallback);
      else fallback();
    } catch (e) { fallback(); }
  });
  $('#btnPaste').addEventListener('click', () => {
    const text = $('#pasteBox').value.trim();
    if (!text) { toast('الصق نص النسخة الأول'); return; }
    importText(text);
  });

  // مسح كل حاجة
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('متأكد؟ هيتمسح كل تقدمك (الكلمات والنقاط والستريك) ومفيش رجوع.')) return;
    store.reset();
    applyTheme(settings().theme);
    toast('اتمسح كل حاجة — بداية جديدة');
    rerender();
  });
}
