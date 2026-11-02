// games/engine.js — الغلاف المشترك لكل الألعاب: شاشة البداية (اختيار الكلمات)، القلوب، النقط، الكومبو،
// التايمر، الفيدباك، شاشة النتيجة، أعلى سكور، XP، وتسجيل التقدّم (كتابة الكلمات / الجمل / الأسئلة).
// كل لعبة = موديول بيصدّر { meta, start(g) } — شوف GAMES_SPEC.md
import { DATA, wordsOfLesson, lessonOf, displayDe } from '../data.js';
import { store } from '../store.js';
import { el, esc, toast, vibrate, confetti, shuffle, mixHtml } from '../ui.js';
import { isSeen, addXp } from '../srs.js';
import { play as playWord, stop as stopWord } from '../audio.js';
import { speak, stopSpeak } from '../tts.js';
import { loadContent, sentencesOf, sentencesUpTo, wfragenOf, wfragenUpTo, verbsOf, verbsUpTo, CONTENT } from '../content.js';
import { recordTyped, recordItem, weakWord, countAnswer, finishGame, gameRecord } from '../progress.js';
import { currentLesson, studiedUpTo, sortedLessonNs, latchReview } from '../mastery.js';
import { replan } from '../notify.js';
import { normDe, normAr, fold, typeAnswer, synonymPair } from '../exercises.js';

export const MAX_COMBO_MULT = 4;
const settings = () => (store.state.settings ||= {});

// CSS خاص بلعبة: بيتحط مرة واحدة في <head> (كل لعبة ملف واحد من غير ما نلمس games.css)
export function injectCss(id, css) {
  if (typeof document === 'undefined' || document.getElementById('css-' + id)) return;
  const s = document.createElement('style');
  s.id = 'css-' + id;
  s.textContent = css;
  document.head.appendChild(s);
}

// ====================================================================
// أصوات صغيرة (WebAudio) — من غير ملفات
// ====================================================================
let actx = null;
function tone(freqs, { dur = 0.09, type = 'sine', gap = 0.07, vol = 0.07 } = {}) {
  if (settings().gameSounds === false) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), gn = actx.createGain();
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(vol, t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
      t += gap;
    }
  } catch (e) { /* مفيش صوت — مش مهم */ }
}
export const sfx = {
  ok: () => tone([660, 880], { dur: 0.11 }),
  bad: () => tone([220, 165], { type: 'square', dur: 0.14, gap: 0.11, vol: 0.05 }),
  win: () => tone([523, 659, 784, 1047], { dur: 0.16, gap: 0.11 }),
  lose: () => tone([392, 330, 262], { type: 'triangle', dur: 0.22, gap: 0.16 }),
  tick: () => tone([1200], { dur: 0.03, vol: 0.03 }),
};

// ====================================================================
// مصدر الكلمات (الدرس / اللي ذاكرته / كل الدروس)
// ====================================================================
const POOL_KINDS = { lesson: 'درس', learned: 'اللي ذاكرته', all: 'كل الدروس' };

export function defaultSel(params = {}) {
  if (params.lesson) return { kind: 'lesson', lesson: +params.lesson };
  const saved = settings().gamePool;
  if (saved && POOL_KINDS[saved.kind]) return saved.kind === 'lesson' ? { kind: 'lesson', lesson: currentLesson() } : { kind: saved.kind };
  return { kind: 'lesson', lesson: currentLesson() };
}
export function selLabel(sel) {
  // FSI…PDI حوالين العنوان الألماني: بيتعرض كنص (textContent) فـ«Hallo!» ما تتقلبش «!Hallo»
  if (sel.kind === 'lesson') { const l = lessonOf(sel.lesson); return `الدرس ${sel.lesson}${l ? ' · \u2068' + l.title + '\u2069' : ''}`; }
  return POOL_KINDS[sel.kind] || '';
}

const KIND_FILTER = kinds => w => !kinds || kinds.includes(w.k);
function wordsFor(sel, { kinds, needAudio = false, min = 4 } = {}) {
  const ok = w => w && KIND_FILTER(kinds)(w) && (!needAudio || !!w.file);
  let list;
  if (sel.kind === 'lesson') {
    list = wordsOfLesson(sel.lesson).filter(ok);
    // لو الدرس لوحده قليل نكمّل من الدروس اللي قبله — على قد اللي ناقص بس (كلمات الدرس تفضل الأغلبية)
    const have = new Set(list.map(w => w.id));
    for (let n = sel.lesson - 1; list.length < min && n >= 1; n--) {
      for (const w of shuffle(wordsOfLesson(n).filter(x => ok(x) && !have.has(x.id)))) {
        if (list.length >= min) break;
        list.push(w); have.add(w.id);
      }
    }
  } else if (sel.kind === 'learned') {
    list = DATA.words.filter(w => ok(w) && isSeen(w.id));
    if (list.length < min) list = wordsFor({ kind: 'lesson', lesson: studiedUpTo() }, { kinds, needAudio, min });
  } else {
    const ns = new Set(sortedLessonNs());
    list = DATA.words.filter(w => ok(w) && (w.lessons || []).some(n => ns.has(n)));
  }
  return list;
}
function listFor(sel, ofFn, upToFn, min) {
  if (sel.kind === 'lesson') {
    let list = ofFn(sel.lesson);
    if (list.length < min) list = upToFn(sel.lesson);
    return list;
  }
  if (sel.kind === 'learned') return upToFn(studiedUpTo());
  return upToFn(0);
}
// «اللي ذاكرته» في لعبة كلمات: لو لسه ما ذاكرش كفاية اللعبة بتلعب على درسه (بنقوله ده في شاشة البداية)
function learnedTooFew(meta, sel) {
  if (sel.kind !== 'learned' || !meta.kinds) return false;
  const kf = KIND_FILTER(meta.kinds);
  return DATA.words.filter(w => kf(w) && (!meta.needAudio || w.file) && isSeen(w.id)).length < meta.minItems;
}

// ====================================================================
// مقارنة الكتابة
// ====================================================================
// expected: نص أو قايمة نصوص مقبولة. بيرجّع { ok, almost } — almost = غلطة أوملاوت/ß بس (بتتحسب صح مع تنبيه)
const deAccent = s => s.replace(/[éèêë]/g, 'e').replace(/[áàâ]/g, 'a').replace(/[íìî]/g, 'i').replace(/[óòô]/g, 'o').replace(/[úùû]/g, 'u').replace(/ç/g, 'c');
export function checkTyped(expected, typed) {
  const t = normDe(typed);
  if (!t) return { ok: false, almost: false };
  const targets = (Array.isArray(expected) ? expected : [expected]).map(normDe).filter(Boolean);
  if (targets.includes(t)) return { ok: true, almost: false };
  const loose = x => fold(deAccent(x));
  if (targets.map(loose).includes(loose(t))) return { ok: true, almost: true };
  return { ok: false, almost: false };
}
// كلمات ليها نفس المعنى بالعربي (Hallo / Hi / Hey = مرحباً) — لما السؤال بالعربي بس لازم نقبل أي واحدة منهم
export function synonymsOf(w) {
  if (!w) return [];
  const key = normAr(w.ar);
  return DATA.words.filter(x => x.id !== w.id && (normAr(x.ar) === key || synonymPair(x, w)));
}
// الإجابة المتوقّعة لكلمة: الأسماء لازم بالأداة (وصوت DW بيقول المفرد والجمع «das Büro, die Büros» → مقبول برضه).
// withSynonyms → يقبل كمان الكلمات اللي ليها نفس المعنى
export function expectedFor(w, { withSynonyms = false } = {}) {
  if (withSynonyms) {
    const base = expectedFor(w);
    for (const x of synonymsOf(w)) base.accept.push(...expectedFor(x).accept);
    return base;
  }
  if (!w) return { show: '', accept: [] };
  if (w.k === 'noun' && w.art && w.sg) return { show: `${w.art} ${w.sg}`, accept: [`${w.art} ${w.sg}`, ...(w.pl ? [`${w.art} ${w.sg}, ${w.pl}`] : [])] };
  const { answer, accept } = typeAnswer(w);
  const all = [answer, ...(accept || [])];
  for (const a of all.slice()) {
    const m = /^ein(hundert|tausend)(.*)$/i.exec(a);
    if (m) all.push(m[1] + m[2]);
    else if (/^(hundert|tausend)/i.test(a)) all.push('ein' + a);
  }
  return { show: answer, accept: all };
}

// ====================================================================
// تشغيل لعبة
// ====================================================================
let current = null;
window.addEventListener('hashchange', () => { if (current) current.destroy(); });

export function wordHtml(w) {
  if (!w) return '';
  if (w.k === 'noun' && w.art && w.sg) return `<bdi class="de"><span class="art art-${esc(w.art)}">${esc(w.art)}</span> ${esc(w.sg)}</bdi>`;
  return `<bdi class="de">${esc(displayDe(w))}</bdi>`;
}

// root = <main id="view">، mod = { meta, start }، params من الهاش
export function runGame(root, mod, params = {}) {
  if (current) current.destroy();
  const meta = { hearts: 3, minItems: 4, ...mod.meta };
  let sel = defaultSel(params);
  root.innerHTML = '';

  const intro = () => {
    document.body.classList.remove('immersive');
    const best = gameRecord(meta.id).best | 0;
    const shownLesson = sel.kind === 'lesson' ? sel.lesson : currentLesson();
    const lessonOpts = sortedLessonNs().map(n => `<option value="${n}"${shownLesson === n ? ' selected' : ''}>الدرس ${n}</option>`).join('');
    const card = el(`<section class="gm-intro">
      <div class="card gm-intro-card">
        <div class="gm-intro-ico" aria-hidden="true">${meta.icon || '🎮'}</div>
        <h1>${esc(meta.title)}</h1>
        <p class="hint">${mixHtml(meta.desc || '')}</p>
        ${meta.how && meta.how.length ? `<ul class="gm-how">${meta.how.map(h => `<li>${mixHtml(h)}</li>`).join('')}</ul>` : ''}
        ${meta.links && meta.links.length ? `<div class="gm-links">${meta.links.map(l => `<a class="btn btn-ghost" href="${esc(l.href)}">${esc(l.label)}</a>`).join('')}</div>` : ''}
        <div class="row wrap chips-row gm-badges">
          ${meta.hearts ? `<span class="chip bad">${'❤️'.repeat(Math.min(meta.hearts, 5))} ${meta.hearts} قلوب</span>` : ''}
          ${meta.clock ? `<span class="chip warn">⏱ ${meta.clock} ثانية</span>` : ''}
          ${best ? `<span class="chip blue">🏆 أعلى سكور ${best}</span>` : ''}
        </div>
      </div>
      ${meta.source === 'none' ? '' : `<div class="card gm-pool">
        <h2 class="sec-title">تلعب على إيه؟</h2>
        <div class="seg gm-pool-seg" role="group" aria-label="مصدر الكلمات">
          <button type="button" data-k="lesson" aria-pressed="${sel.kind === 'lesson'}">درس</button>
          <button type="button" data-k="learned" aria-pressed="${sel.kind === 'learned'}">اللي ذاكرته</button>
          <button type="button" data-k="all" aria-pressed="${sel.kind === 'all'}">كل الدروس</button>
        </div>
        <select class="input gm-lesson"${sel.kind === 'lesson' ? '' : ' hidden'} aria-label="اختار الدرس">${lessonOpts}</select>
        <p class="hint gm-pool-hint"></p>
      </div>`}
      <button type="button" class="btn btn-primary btn-big gm-go">▶ يلا نلعب</button>
      <a class="btn btn-ghost" href="#/games">🎮 كل الألعاب</a>
    </section>`);
    root.innerHTML = '';
    root.appendChild(card);
    const hint = card.querySelector('.gm-pool-hint');
    const go = card.querySelector('.gm-go');
    const refresh = () => {
      const n = countFor(meta, sel, params);
      if (hint) hint.textContent = n < meta.minItems ? `محتاج ${meta.minItems} على الأقل — اختار «كل الدروس» أو ذاكر كلمات أكتر`
        : learnedTooFew(meta, sel) ? `لسه ما ذاكرتش كلمات كفاية — هنلعب على الدرس ${studiedUpTo()} · ${n} ${meta.unit || 'سؤال'}`
        : `${selLabel(sel)} · ${n} ${meta.unit || 'سؤال'}`;
      go.disabled = n < meta.minItems;
    };
    const seg = card.querySelector('.gm-pool-seg');
    const select = card.querySelector('.gm-lesson');
    if (seg) seg.addEventListener('click', e => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      sel = b.dataset.k === 'lesson' ? { kind: 'lesson', lesson: +select.value || currentLesson() } : { kind: b.dataset.k };
      seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      select.hidden = sel.kind !== 'lesson';
      refresh();
    });
    if (select) select.addEventListener('change', () => { sel = { kind: 'lesson', lesson: +select.value }; refresh(); });
    go.addEventListener('click', () => {
      settings().gamePool = sel.kind === 'lesson' ? { kind: 'lesson' } : { kind: sel.kind };
      store.save();
      play();
    });
    refresh();
  };

  const play = () => {
    if (current) current.destroy();      // جولة قديمة خلصت: ننضّف الـ listeners بتاعتها
    const g = makeContext(root, mod, meta, sel, params, { replay: play, intro });
    current = g;
    try { mod.start(g); }
    catch (e) { console.error('[game] start failed', meta.id, e); g.end({ win: false, error: true }); }
  };

  loadContent().then(() => {
    if (params.autostart === '1' && countFor(meta, sel, params) >= meta.minItems) play(); else intro();
  });
}

function countFor(meta, sel, params = {}) {
  try { return meta.count ? meta.count(poolApi(sel), params) : poolApi(sel).words({ kinds: meta.kinds, needAudio: meta.needAudio, min: meta.minItems }).length; }
  catch (e) { console.warn('[game] count failed', e); return 0; }
}

function poolApi(sel) {
  return {
    sel,
    words: (o = {}) => wordsFor(sel, o),
    sentences: ({ min = 4, cloze = false } = {}) => {
      const f = s => !cloze || (s.cloze && s.cloze.word);
      return listFor(sel, n => sentencesOf(n).filter(f), n => sentencesUpTo(n).filter(f), min);
    },
    wfragen: ({ min = 4 } = {}) => listFor(sel, wfragenOf, wfragenUpTo, min),
    verbs: ({ min = 3 } = {}) => listFor(sel, verbsOf, verbsUpTo, min),
    letters: () => (CONTENT.alphabet && CONTENT.alphabet.letters) || [],
    spelling: () => (CONTENT.alphabet && CONTENT.alphabet.spelling) || [],
    maxLesson: () => (sel.kind === 'lesson' ? sel.lesson : sel.kind === 'learned' ? studiedUpTo() : Math.max(...sortedLessonNs(), 1)),
  };
}

// ====================================================================
// سياق اللعبة g
// ====================================================================
function makeContext(root, mod, meta, sel, params, { replay, intro }) {
  document.body.classList.add('immersive');
  root.innerHTML = '';
  window.scrollTo(0, 0);
  const timers = new Set(), cleanups = [];
  const st = { hearts: meta.hearts || 0, maxHearts: meta.hearts || 0, score: 0, combo: 0, bestCombo: 0, right: 0, wrong: 0, mistakes: [], over: false, total: 0, done: 0 };

  const wrap = el(`<div class="gm-wrap" data-game="${esc(meta.id)}">
    <div class="gm-top">
      <button type="button" class="btn btn-icon gm-close" aria-label="خروج">✕</button>
      <div class="gm-hearts" aria-label="القلوب"></div>
      <span class="gm-combo" hidden></span>
      <div class="gm-score" aria-label="النقط"><b>0</b><small>نقطة</small></div>
    </div>
    <div class="bar gm-bar" hidden><i style="width:0%"></i></div>
    <div class="gm-clock" hidden></div>
    <div class="gm-stage"></div>
    <div class="gm-fb" role="status" aria-live="polite"></div>
  </div>`);
  root.appendChild(wrap);
  const $ = s => wrap.querySelector(s);
  const heartsEl = $('.gm-hearts'), scoreEl = $('.gm-score b'), comboEl = $('.gm-combo'), barEl = $('.gm-bar'), fbEl = $('.gm-fb'), clockEl = $('.gm-clock');
  const stage = $('.gm-stage');

  const drawHearts = (lost = false) => {
    if (!st.maxHearts) { heartsEl.hidden = true; return; }
    heartsEl.classList.toggle('many', st.maxHearts > 3);
    heartsEl.innerHTML = Array.from({ length: st.maxHearts }, (_, i) => `<span class="gm-heart${i < st.hearts ? '' : ' off'}">${i < st.hearts ? '❤️' : '🖤'}</span>`).join('');
    if (lost) { heartsEl.classList.remove('shake'); void heartsEl.offsetWidth; heartsEl.classList.add('shake'); }
  };
  const mult = () => Math.min(MAX_COMBO_MULT, 1 + Math.floor(st.combo / 3));
  const drawScore = gain => {
    scoreEl.textContent = st.score;
    const m = mult();
    comboEl.hidden = m < 2;
    comboEl.textContent = `🔥 x${m}`;
    if (gain) {
      const pop = el(`<span class="gm-pop">+${gain}</span>`);
      $('.gm-score').appendChild(pop);
      setTimeout(() => pop.remove(), 700);
    }
  };
  drawHearts(); drawScore(0);

  const g = {
    meta, sel, params, stage, root, wrap,
    lesson: sel.kind === 'lesson' ? sel.lesson : null,
    label: selLabel(sel),
    get alive() { return !st.over; },
    get hearts() { return st.hearts; },
    get score() { return st.score; },
    get combo() { return st.combo; },
    state: st,
    ...poolApi(sel),

    // ---------- أدوات ----------
    after(ms, fn) { const t = setTimeout(() => { timers.delete(t); if (!st.over) fn(); }, ms); timers.add(t); return t; },
    every(ms, fn) { const t = setInterval(() => { if (!st.over) fn(); }, ms); timers.add(t); return t; },
    clear(t) { clearTimeout(t); clearInterval(t); timers.delete(t); },
    on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); cleanups.push(() => target.removeEventListener(ev, fn, opts)); },
    onCleanup(fn) { cleanups.push(fn); },
    shuffle, esc, el, toast, wordHtml, checkTyped, expectedFor, sfx,
    // lastSpeech = آخر صوت اتطلب (askTiles بيستنى الأخير لو دوس 🔊 تاني وهو مستني)
    say(x, opts) {
      if (!x) return Promise.resolve(false);
      if (typeof x === 'object' && x.file) { stopSpeak(); return (g.lastSpeech = playWord(x)); }
      stopWord();
      return (g.lastSpeech = speak(typeof x === 'object' ? displayDe(x) : x, opts));
    },
    stopAudio() { stopWord(); stopSpeak(); },

    // تقدّم لعبة محدودة (عدد أسئلة معروف)
    setProgress(done, total) {
      st.done = done; st.total = total;
      barEl.hidden = false;
      barEl.firstElementChild.style.width = `${total ? Math.round((100 * done) / total) : 0}%`;
    },

    // تايمر لكل سؤال: بيرجّع { stop(), elapsed } ولما يخلص بينادي onTimeout.
    // الوقت بيتعد من التكّات نفسها: رسالة «تخرج؟» مفتوحة أو الأبلكيشن في الخلفية → الوقت واقف
    timer(seconds, onTimeout) {
      barEl.hidden = false;
      barEl.classList.add('gm-timer');
      barEl.classList.remove('low');
      const ms = seconds * 1000;
      let stopped = false, used = 0, last = performance.now();
      const fill = barEl.firstElementChild;
      fill.style.transition = 'none'; fill.style.width = '100%'; void fill.offsetWidth; fill.style.transition = '';
      const t = g.every(100, () => {
        if (stopped) return;
        const now = performance.now();
        if (!document.hidden) used += Math.min(250, now - last);
        last = now;
        const left = Math.max(0, 1 - used / ms);
        fill.style.width = `${Math.round(left * 100)}%`;
        barEl.classList.toggle('low', left < 0.3);
        if (left <= 0) { stopped = true; g.clear(t); onTimeout && onTimeout(); }
      });
      return { stop() { stopped = true; g.clear(t); }, get elapsed() { return used / 1000; } };
    },

    // ساعة اللعبة كلها (ألعاب السرعة): لما تخلص اللعبة بتنتهي
    clock(seconds, { onEnd } = {}) {
      let left = seconds;
      clockEl.hidden = false;
      const draw = () => { clockEl.textContent = `⏱ ${left}`; clockEl.classList.toggle('low', left <= 10); };
      draw();
      const t = g.every(1000, () => {
        left--; draw();
        if (left <= 5 && left > 0) sfx.tick();
        if (left <= 0) {
          g.clear(t);
          if (st.maxHearts && st.hearts <= 0) return;           // خسر وهو بيقرا الإجابة الصح → تفضل خسارة
          onEnd ? onEnd() : g.end({ win: true, timeUp: true });
        }
      });
      return { add(s) { left += s; draw(); }, get left() { return left; } };
    },

    // ---------- النتيجة ----------
    // صح: بيرجّع Promise<boolean> (true = كمّل)
    correct({ points = 10, wordId, typed = false, itemId, msg, quiet = false, ms = 650 } = {}) {
      if (st.over) return Promise.resolve(false);
      st.combo++; st.bestCombo = Math.max(st.bestCombo, st.combo); st.right++;
      const gain = Math.round(points * mult());
      st.score += gain;
      countAnswer();
      latchReview();                 // مهمة المراجعة اتحققت دلوقتي؟ تفضل خالصة
      if (wordId && typed) recordTyped(wordId, true);
      if (itemId) recordItem(itemId, true);
      drawScore(gain);
      sfx.ok();
      if (quiet) return Promise.resolve(true);
      return feedback(true, msg || randomPraise(), { ms });
    },
    // غلط: بيقلّل قلب ويعرض الإجابة الصح. wait=true → يستنى «متابعة». بيرجّع Promise<boolean>
    wrong({ wordId, typed = false, itemId, correctHtml = '', msg, wait = true, cost = 1, label, ms = 1300 } = {}) {
      if (st.over) return Promise.resolve(false);
      st.combo = 0; st.wrong++;
      if (cost && st.maxHearts) st.hearts = Math.max(0, st.hearts - cost);
      latchReview();                 // قبل ما الغلطة ترجّع الكلمة للمراجعة (لو المهمة كانت خلصت قبلها)
      countAnswer();
      if (wordId) { if (typed) recordTyped(wordId, false); else weakWord(wordId); }
      if (itemId) recordItem(itemId, false);
      if (correctHtml || label) st.mistakes.push({ html: correctHtml, label: label || '', wordId });
      drawHearts(true); drawScore(0);
      sfx.bad(); vibrate(40);
      const dead = st.maxHearts && st.hearts <= 0;
      const head = dead ? 'خلصت القلوب 💔' : (msg || 'غلط');
      const html = `<b>${mixHtml(head)}</b>${dead && msg ? `<div>${mixHtml(msg)}</div>` : ''}${correctHtml ? `<div class="gm-fb-ans">الصح: ${correctHtml}</div>` : ''}`;
      return feedback(false, html, { wait: wait || dead, ms, wordId, raw: true }).then(() => {
        if (dead) { g.end({ win: false }); return false; }
        return !st.over;
      });
    },
    // كسب/خسارة قلب يدوي (مكافآت)
    addHeart() { if (st.maxHearts && st.hearts < st.maxHearts) { st.hearts++; drawHearts(); } },

    end({ win = true, error = false, timeUp = false, quit = false } = {}) {
      if (st.over) return;
      st.over = true;
      for (const t of timers) { clearTimeout(t); clearInterval(t); }
      timers.clear();
      g.stopAudio();
      // الامتحان والتدريب ليهم شاشة نتيجة خاصة (mod.finish)
      if (typeof mod.finish === 'function') {
        try { mod.finish(root, st, { win: win && !error, error, quit, replay, intro, g }); return; }
        catch (e) { console.error('[game] finish failed', e); }
      }
      showResults(root, meta, st, { win: win && !error, error, timeUp, quit, replay, intro });
    },
    destroy() {
      st.over = true;
      for (const t of timers) { clearTimeout(t); clearInterval(t); }
      timers.clear();
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (e) { /* ignore */ } }
      g.stopAudio();
      if (current === g) current = null;
    },
  };

  // فيدباك تحت: صح سريع / غلط بزرار «متابعة»
  let fbResolve = null;
  function feedback(ok, html, { wait = false, ms = 800, wordId, raw = false } = {}) {
    return new Promise(resolve => {
      if (fbResolve) { fbResolve(); fbResolve = null; }
      fbEl.className = `gm-fb show ${ok ? 'ok' : 'bad'}`;
      const w = wordId ? DATA.byId.get(wordId) : null;
      fbEl.innerHTML = `<div class="gm-fb-body">${raw ? html : `<b>${mixHtml(html)}</b>`}</div>${w && w.file ? '<button type="button" class="ss-say sm gm-fb-say" aria-label="اسمع">🔊</button>' : ''}${wait ? '<button type="button" class="btn btn-big gm-fb-next">متابعة</button>' : ''}`;
      const done = () => {
        if (fbResolve !== done) return;
        fbResolve = null;
        fbEl.className = 'gm-fb';
        resolve(true);
      };
      fbResolve = done;
      const say = fbEl.querySelector('.gm-fb-say');
      if (say) say.addEventListener('click', () => playWord(w));
      if (wait) {
        const nb = fbEl.querySelector('.gm-fb-next');
        nb.addEventListener('click', done);
        setTimeout(() => { try { nb.focus(); } catch (e) { /* ignore */ } }, 50);
      } else g.after(ms, done);
    });
  }
  // Enter = متابعة
  g.on(document, 'keydown', e => {
    if (e.key === 'Enter' && fbResolve && fbEl.querySelector('.gm-fb-next') && document.activeElement && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); fbResolve(); }
  });

  $('.gm-close').addEventListener('click', () => {
    if (st.over) return;
    if (st.right + st.wrong === 0 || confirm('تخرج من اللعبة؟ النقط اللي جمعتها هتتحسب.')) g.end({ win: false, quit: true });
  });
  return g;
}

const PRAISE = ['صح! 👏', 'برافو! 🎉', 'ممتاز 💪', 'عاش! 🔥', 'جامد! ⭐', 'تمام كده ✅'];
const randomPraise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

// ====================================================================
// شاشة النتيجة
// ====================================================================
function showResults(root, meta, st, { win, error, timeUp, quit, replay, intro }) {
  document.body.classList.remove('immersive');
  window.scrollTo(0, 0);
  const answered = st.right + st.wrong;
  const xp = answered ? Math.min(60, Math.round(st.score / 10)) + (win ? 10 : 0) : 0;
  if (xp) addXp(xp);
  const rec = answered ? finishGame(meta.id, { score: st.score, win }) : { record: false, best: gameRecord(meta.id).best };
  if (answered) replan();          // ممكن مهمة النهارده تكون خلصت دلوقتي → التذكيرات تسكت
  const lost = st.maxHearts ? st.maxHearts - st.hearts : st.wrong;            // غلطات كلّفت قلوب
  const stars = !win ? 0 : lost === 0 ? 3 : lost === 1 ? 2 : 1;
  const acc = answered ? Math.round((100 * st.right) / answered) : 0;
  const title = error ? 'حصلت مشكلة في اللعبة 😕' : quit ? 'خرجت من اللعبة' : win ? (timeUp ? '⏱ الوقت خلص!' : '🎉 برافو عليك!') : st.maxHearts && st.hearts <= 0 ? '💔 خلصت القلوب' : 'خلصت اللعبة';
  const mistakes = st.mistakes.slice(-8);
  root.innerHTML = '';
  const card = el(`<section class="gm-results">
    <div class="card gm-res-card ${win ? 'win' : 'lose'}">
      <div class="gm-res-ico" aria-hidden="true">${meta.icon || '🎮'}</div>
      <h1>${esc(title)}</h1>
      ${win && stars ? `<div class="gm-stars" aria-label="${stars} نجوم">${'⭐'.repeat(stars)}${'☆'.repeat(Math.max(0, 3 - stars))}</div>` : ''}
      <div class="gm-res-score"><b>${st.score}</b><span>نقطة</span></div>
      ${rec.record && st.score > 0 ? '<p class="gm-record">🏆 رقم قياسي جديد!</p>' : `<p class="hint">أعلى سكور: ${rec.best | 0}</p>`}
      <div class="row wrap chips-row gm-res-chips">
        <span class="chip good">✓ ${st.right} صح</span>
        <span class="chip bad">✗ ${st.wrong} غلط</span>
        ${answered ? `<span class="chip">🎯 ${acc}%</span>` : ''}
        ${st.bestCombo >= 3 ? `<span class="chip warn">🔥 ${st.bestCombo} ورا بعض</span>` : ''}
        ${xp ? `<span class="chip blue">⭐ +${xp} XP</span>` : ''}
      </div>
    </div>
    ${mistakes.length ? `<div class="card gm-mistakes"><h2 class="sec-title">راجع اللي غلطت فيه</h2>
      <div class="list">${mistakes.map((m, i) => `<div class="list-item gm-mis" data-i="${i}">${m.wordId && DATA.byId.get(m.wordId)?.file ? `<button type="button" class="btn btn-icon say" data-w="${esc(m.wordId)}" aria-label="اسمع">🔊</button>` : ''}<div class="grow">${m.html || ''}${m.label ? `<div class="muted small">${esc(m.label)}</div>` : ''}</div></div>`).join('')}</div></div>` : ''}
    <div class="gm-res-actions">
      <button type="button" class="btn btn-primary btn-big" data-act="again">🔁 كمان مرة</button>
      <div class="grid2">
        <button type="button" class="btn" data-act="intro">⚙️ غيّر الكلمات</button>
        <a class="btn" href="#/games">🎮 ألعاب تانية</a>
      </div>
      <a class="btn btn-ghost" href="#/home">🏠 الرئيسية</a>
    </div>
  </section>`);
  root.appendChild(card);
  if (win && !error) { sfx.win(); if (stars >= 3 || rec.record) confetti(); } else if (!error) sfx.lose();
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-act], [data-w]');
    if (!b) return;
    if (b.dataset.w) { playWord(DATA.byId.get(b.dataset.w)); return; }
    if (b.dataset.act === 'again') replay();
    if (b.dataset.act === 'intro') intro();
  });
}
