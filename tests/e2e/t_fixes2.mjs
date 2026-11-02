// QA for the fixes from the second review (meaning helpers, typing, mission, hub, tiles lock, timer, wfragen,
// notifications tap, native backup, permission denial, overflow at 360 px).
import { launch } from './cdp.mjs';
const URL = 'http://127.0.0.1:8131/index.html';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);

// ---------- part 1: pure logic in a plain browser ----------
let p = await launch({ port: 9471, width: 360, height: 780 });
await p.goto(URL + '#/home', 2500);
await p.evaluate(`localStorage.removeItem('ws:v1')`);
await p.goto(URL + '#/home', 3000);

let r = await p.evaluate(`(async () => {
  const ex = await import('./js/exercises.js');
  const { DATA } = await import('./js/data.js');
  const byDe = d => DATA.words.find(w => w.de.startsWith(d));
  const papa = byDe('der Papa'), vater = byDe('der Vater'), mama = byDe('die Mama'), mutter = byDe('die Mutter');
  const nein = DATA.words.find(w => w.de === 'nein' && w.lessons.includes(4)), nicht = DATA.words.find(w => w.de === 'nicht');
  const ka = byDe('Keine Ahnung'), wn = byDe('Ich weiß es nicht');
  return {
    papaVater: ex.sameWord(papa, vater), mamaMutter: ex.sameWord(mama, mutter), neinNicht: ex.sameWord(nein, nicht),
    kaWn: ex.sameWord(ka, wn), formal: ex.sameMeaning('ما اسمُك؟ (صيغة رسمية )', 'ما اسمك؟ (صيغة رسميّة)'),
    shop: ex.sameMeaning('متجر دراجات', 'متجر الدراجات'), notSame: ex.sameWord(papa, mama),
  };
})()`);
check('sameWord: Papa=Vater, Mama=Mutter, nein~nicht, Keine Ahnung=Ich weiß es nicht', r.papaVater && r.mamaMutter && r.neinNicht && r.kaWn && !r.notSame, JSON.stringify(r));
check('sameMeaning: shadda/space and ال variants', r.formal && r.shop, JSON.stringify(r));

r = await p.evaluate(`(async () => {
  const ex = await import('./js/exercises.js');
  const { DATA } = await import('./js/data.js');
  const vater = DATA.words.find(w => w.de.startsWith('der Vater')), papa = DATA.words.find(w => w.de.startsWith('der Papa'));
  const nein = DATA.words.find(w => w.de === 'nein' && w.lessons.includes(4));
  let bad = [];
  for (let i = 0; i < 300; i++) {
    const a = ex.makeExercise(vater, 'mcq_de_ar'); if (a.options.some(o => !o.correct && /بابا|أبي/.test(o.text))) bad.push('vater:' + a.options.map(o => o.text).join('|'));
    const b = ex.makeExercise(papa, 'mcq_ar_de'); if (b.options.some(o => !o.correct && /Vater/.test(o.text))) bad.push('papa:' + b.options.map(o => o.text).join('|'));
    const c = ex.makeExercise(nein, 'mcq_de_ar'); if (c.options.some(o => !o.correct && /^لا/.test(o.text))) bad.push('nein:' + c.options.map(o => o.text).join('|'));
  }
  const t = ex.makeExercise(vater, 'type');
  const g1 = ex.gradeAnswer(t, 'Papa'), g2 = ex.gradeAnswer(t, 'Vater'), g3 = ex.gradeAnswer(t, 'der Vater');
  return { bad: bad.slice(0, 3), n: bad.length, hint: t.prompt.hint, papaOk: g1.ok, bare: g2, full: g3 };
})()`);
check('session MCQ never offers a synonym as a wrong option (900 exercises)', r.n === 0, JSON.stringify(r.bad));
check('type card: noun hint asks for the article; bare noun = ok + note; Papa accepted for «أب»', /بأداته/.test(r.hint) && r.bare.ok && /الأداة/.test(r.bare.note || '') && r.full.ok && !r.full.note && r.papaOk, JSON.stringify(r));

r = await p.evaluate(`(async () => {
  const eng = await import('./js/games/engine.js');
  const { DATA } = await import('./js/data.js');
  const buero = DATA.words.find(w => w.k === 'noun' && w.sg === 'Büro');
  const e = eng.expectedFor(buero);
  const vater = DATA.words.find(w => w.de.startsWith('der Vater'));
  return { a: eng.checkTyped(e.accept, 'das Büro, die Büros').ok, b: eng.checkTyped(e.accept, 'das Büro die Büros').ok, c: eng.checkTyped(e.accept, 'das Büro').ok,
           d: eng.checkTyped(e.accept, 'Büro').ok, syn: eng.synonymsOf(vater).map(w => w.de) };
})()`);
check('listen-write: «das Büro, die Büros» (what DW says) accepted, bare «Büro» not', r.a && r.b && r.c && !r.d, JSON.stringify(r));
check('synonymsOf(Vater) includes Papa (exam switches to audio)', r.syn.some(d => /Papa/.test(d)), JSON.stringify(r.syn));

// mission sticky + hub card + studiedUpTo
r = await p.evaluate(`(async () => {
  const { store, todayIndex, today } = await import('./js/store.js');
  const { DATA } = await import('./js/data.js');
  const m = await import('./js/mastery.js');
  const t = todayIndex();
  store.state.exams = {};
  for (const l of DATA.lessons) store.state.exams[l.n] = { passed: t - 10, crown: t - 5, best: 100, tries: 1, crownTries: 1 };
  store.state.progress = {};
  for (const w of DATA.words) store.state.progress[w.id] = { box: 4, due: t + 5, seen: 3, ok: 3, bad: 0, last: 1, typed: 1 };
  store.state.days = { [today()]: { done: 10, xp: 0, sessions: 0, new: 0 } };
  store.save();
  const a = m.mission();
  const w0 = DATA.words[0].id; store.state.progress[w0].due = t; store.save();
  const b = m.mission();
  const flag = !!store.state.days[today()].reviewDone;
  const up = m.studiedUpTo();
  return { a: { review: a.review, done: a.done }, b: { done: b.done, due: b.due }, flag, up };
})()`);
check('review mission stays done after a mistake makes a word due', r.a.review && r.a.done && r.b.done && r.b.due === 1 && r.flag, JSON.stringify(r));
check('studiedUpTo() = last lesson when all exams passed', r.up === 15, JSON.stringify(r));
await p.hash('#/games', 1200);
r = await p.evaluate(`({ exam: [...document.querySelectorAll('a[href^="#/exam/"]')].map(a => a.getAttribute('href')) })`);
check('hub: all crowned → no useless exam re-take card', r.exam.length === 0, JSON.stringify(r));
await p.evaluate(`(async () => { const { store, todayIndex } = await import('./js/store.js'); store.state.exams[2].crown = 0; store.state.exams[2].passed = todayIndex() - 4; store.save(); })()`);
await p.hash('#/home', 500); await p.hash('#/games', 1200);
r = await p.evaluate(`({ exam: [...document.querySelectorAll('a[href^="#/exam/"]')].map(a => a.getAttribute('href') + ' ' + a.textContent.trim().slice(0, 40)) })`);
check('hub: crown ready → «امتحان تثبيت الدرس 2» → crown exam', r.exam.length === 1 && r.exam[0].startsWith('#/exam/2?kind=crown') && /تثبيت/.test(r.exam[0]), JSON.stringify(r));
r = await p.evaluate(`(async () => { const eng = await import('./js/games/engine.js'); const c = await import('./js/content.js');
  return { up: (await import('./js/mastery.js')).studiedUpTo(), n: c.sentencesUpTo(15).length }; })()`);
check('learned pool spans all lessons after all passed', r.up === 15 && r.n > 300, JSON.stringify(r));

// crown texts on a crowned lesson
await p.hash('#/exam/3?kind=crown', 1500);
r = await p.evaluate(`document.querySelector('.gm-how') ? document.querySelector('.gm-how').textContent : ''`);
check('crown intro on a crowned lesson says «واخد التاج … تدريب»', /واخد التاج/.test(r) && !/فاضل 0/.test(r), r.slice(0, 120));

// sessions counter: a game alone doesn't count a study session
r = await p.evaluate(`(async () => { const { store, today } = await import('./js/store.js'); const pr = await import('./js/progress.js');
  store.state.streak = { current: 0, best: 0, lastDay: '' }; store.state.days = {}; store.save();
  pr.finishGame('listen-write', { score: 10, win: false });
  const d = store.state.days[today()]; return { sessions: d.sessions | 0, games: d.games | 0, streak: store.state.streak.current }; })()`);
check('a game bumps the streak but not «جلسات»', r.sessions === 0 && r.games === 1 && r.streak === 1, JSON.stringify(r));

// tiles board lock
r = await p.evaluate(`(async () => {
  const rounds = await import('./js/games/rounds.js');
  const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const g = { shuffle: a => a.slice().reverse(), el, esc: s => String(s) };
  const tiles = ['Ich', 'heiße', 'Nico.'];
  let calls = 0, built = null;
  const board = rounds.tilesBoard(g, tiles, { onCheck: b => { calls++; built = b; } });
  document.body.appendChild(board);
  for (const t of tiles) [...board.querySelectorAll('.gm-bank button.gm-tile')].find(b => b.textContent === t).click();
  board.querySelector('.gm-submit').click();
  board.querySelector('.gm-answer').innerHTML = tiles.map(t => '<span class="gm-tile done"><bdi class="de">' + t + '</bdi></span>').join('');
  let err = null;
  try { board.querySelector('.gm-answer .gm-tile').click(); board.querySelector('.gm-answer .gm-tile').click(); board.querySelector('.gm-submit').click(); } catch (e) { err = String(e); }
  const res = { calls, built, bank: board.querySelectorAll('.gm-bank .gm-tile').length, answer: board.querySelectorAll('.gm-answer .gm-tile').length, disabled: board.querySelector('.gm-submit').disabled, err };
  board.remove();
  return res;
})()`);
check('tiles board locked after «تحقق» (done words not clickable, no second check)', r.calls === 1 && r.built.join(' ') === 'Ich heiße Nico.' && r.bank === 0 && r.answer === 3 && r.disabled && !r.err, JSON.stringify(r));

// wfragen: B rounds never offer a valid question for the reply (lesson 5 / 7 / 12 / 15)
r = await p.evaluate(`(async () => {
  const mod = await import('./js/games/wfragen.js');
  const content = await import('./js/content.js');
  const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const bad = []; let bRounds = 0;
  for (const L of [5, 7, 10, 11, 12, 14, 15]) for (let run = 0; run < 25; run++) {
    const stage = document.createElement('div'); document.body.appendChild(stage);
    let over = false;
    const g = {
      stage, el, esc: s => String(s), shuffle: a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; },
      wfragen: () => content.wfragenOf(L).length >= 4 ? content.wfragenOf(L) : content.wfragenUpTo(L), maxLesson: () => L,
      get alive() { return !over; }, setProgress() {}, on: (t, ev, fn) => t.addEventListener(ev, fn), after: (ms, fn) => setTimeout(fn, 0),
      say: () => Promise.resolve(true), correct: async () => true, wrong: async () => true, end: () => { over = true; },
    };
    mod.start(g);
    for (let k = 0; k < 40 && !over; k++) {
      await new Promise(res => setTimeout(res, 5));
      const p = stage.querySelector('.gm-wfragen-p');
      if (!p) continue;
      const btns = [...stage.querySelectorAll('.gm-choice')];
      if (p.dataset.type === 'B' && btns.length) {
        bRounds++;
        const reply = p.querySelector('.gm-wfragen-reply .de').textContent;
        const opts = btns.map(b => b.textContent.trim());
        if (/^Ich heiße/.test(reply) && opts.some(o => /^Wer (bist du|sind Sie)\\?$/.test(o))) bad.push(reply + ' :: ' + opts.join(' | '));
        if (/Adresse/.test(reply) && opts.some(o => /wohn/i.test(o))) bad.push(reply + ' :: ' + opts.join(' | '));
        if (/^Pizza Hawaii/.test(reply)) bad.push('noun-only reply as B: ' + reply);
        if (/nummer/i.test(reply) && opts.filter(o => /nummer/i.test(o)).length > 1) bad.push('number question twice: ' + reply + ' :: ' + opts.join(' | '));
        if (opts.some(o => /ist mit (dir|Ihnen)/.test(o))) bad.push('open question offered: ' + reply + ' :: ' + opts.join(' | '));
      }
      if (btns.length && !btns[0].disabled) btns[0].click();
    }
    over = true; stage.remove();
  }
  return { bad: bad.slice(0, 4), n: bad.length, bRounds };
})()`);
check('wfragen «إيه السؤال؟»: no option that also answers the reply (175 games)', r.n === 0 && r.bRounds > 20, JSON.stringify(r));

// timer: a 5 s stall (blocked confirm / background) doesn't eat the round
await p.evaluate(`(async () => { const { store } = await import('./js/store.js'); store.state.exams = {}; store.save(); })()`);
await p.hash('#/game/articles?lesson=2&autostart=1', 1500);
r = await p.evaluate(`(async () => {
  const before = document.querySelector('.gm-articles-n')?.textContent;
  const w0 = parseFloat(document.querySelector('.gm-bar > i').style.width);
  const real = performance.now.bind(performance);
  const t0 = real();
  performance.now = () => real() + (real() - t0 > 0 ? 5000 : 0);   // one jump of 5 s
  await new Promise(r => setTimeout(r, 450));
  performance.now = real;
  const hearts = document.querySelectorAll('.gm-heart:not(.off)').length;
  const w = parseFloat(document.querySelector('.gm-bar > i').style.width);
  return { before, after: document.querySelector('.gm-articles-n')?.textContent, hearts, w0, w, drop: w0 - w };
})()`);
// 450 ms real time + one capped tick (≤ 250 ms) + tick granularity ≈ 0.8 s of a 6 s round → ≤ ~14 %
check('articles timer: a 5 s stall costs ≤ 0.25 s, no heart lost', r.hearts === 3 && r.before === r.after && r.drop <= 15, JSON.stringify(r));

// overflow: long number in the results mistakes list + grammar tables at 360 px
await p.hash('#/home', 600);
r = await p.evaluate(`(() => {
  const v = document.getElementById('view');
  v.insertAdjacentHTML('beforeend', '<div class="card gm-mistakes" id="tmis"><div class="list"><div class="list-item gm-mis"><button class="btn btn-icon say">🔊</button><div class="grow"><bdi class="de">7727</bdi> = <bdi class="de">siebentausendsiebenhundertsiebenundzwanzig</bdi></div></div></div></div>');
  const sw = document.documentElement.scrollWidth; document.getElementById('tmis').remove(); return { sw, vw: innerWidth };
})()`);
check('results mistakes list: 42-letter number word wraps at 360 px', r.sw <= r.vw, JSON.stringify(r));
await p.hash('#/ref/grammar', 1200);
r = await p.evaluate(`(() => {
  document.querySelectorAll('details.rf-g').forEach(d => d.open = true);
  const out = [];
  document.querySelectorAll('.rf-gtable').forEach(t => { const c = t.closest('.card').getBoundingClientRect(), b = t.getBoundingClientRect(); if (b.left < c.left - 0.5 || b.right > c.right + 0.5) out.push(Math.round(b.left) + '..' + Math.round(b.right) + ' vs ' + Math.round(c.left) + '..' + Math.round(c.right)); });
  const sum = [...document.querySelectorAll('details.rf-g summary bdi.de')].length;
  return { out, n: document.querySelectorAll('.rf-gtable').length, sw: document.documentElement.scrollWidth, sum };
})()`);
check('grammar tables fit their cards at 360 px; titles isolated in <bdi>', r.out.length === 0 && r.sw <= 360 && r.sum >= 10, JSON.stringify(r));

// review-3: Hallo / Hi / Hey are synonyms (session MCQ never offers «مرحباً!» as a wrong meaning of Hi!)
r = await p.evaluate(`(async () => {
  const ex = await import('./js/exercises.js');
  const { DATA } = await import('./js/data.js');
  const hi = DATA.words.find(w => w.de === 'Hi!'), hallo = DATA.words.find(w => w.de === 'Hallo!');
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    if (ex.makeExercise(hi, 'mcq_de_ar').options.some(o => !o.correct && /مرحب/.test(o.text))) bad++;
    if (ex.makeExercise(hallo, 'mcq_ar_de').options.some(o => !o.correct && /^(Hi|Hey)!/.test(o.text))) bad++;
  }
  return { same: ex.sameWord(hi, hallo), bad };
})()`);
check('Hallo / Hi / Hey never offered as each other\'s wrong option', r.same && r.bad === 0, JSON.stringify(r));

// review-3: askTiles waits for the LATEST reading when 🔊 is tapped during the wait
r = await p.evaluate(`(async () => {
  const rounds = await import('./js/games/rounds.js');
  const { CONTENT } = await import('./js/content.js');
  const s = CONTENT.sentences.find(x => x.id === 's01-008');
  const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const stage = document.createElement('div'); document.body.appendChild(stage);
  const ends = [];
  const g = { stage, el, esc: x => String(x), shuffle: a => a.slice().reverse(), alive: true, lastSpeech: null,
    say() { const p = new Promise(r => ends.push(r)); g.lastSpeech = p; return p; },
    correct: async () => true, wrong: async () => true };
  let resolved = false;
  const pr = rounds.askTiles(g, { sentence: s }).then(v => { resolved = true; return v; });
  for (const t of s.de.split(' ')) [...stage.querySelectorAll('.gm-bank .gm-tile')].find(x => x.textContent.trim() === t).click();
  stage.querySelector('.gm-submit').click();
  await new Promise(r => setTimeout(r, 50));
  stage.querySelector('.gm-speaker').click();          // replay during the wait → reading #2
  ends[0](true);                                         // reading #1 cancelled
  await new Promise(r => setTimeout(r, 120));
  const waitingForSecond = !resolved;
  ends[1](true);
  await new Promise(r => setTimeout(r, 50));
  stage.remove();
  return { waitingForSecond, resolvedAfter: resolved, readings: ends.length };
})()`);
check('askTiles: 🔊 during the wait → waits for the new reading', r.waitingForSecond && r.resolvedAfter && r.readings === 2, JSON.stringify(r));

// review-3: a match-only day counts as activity in Stats (streak and activity agree)
r = await p.evaluate(`(async () => {
  const { store, today, todayIndex, dateFromIndex } = await import('./js/store.js');
  const srs = await import('./js/srs.js');
  const y = dateFromIndex(todayIndex() - 1);
  store.state.days = { [y]: { done: 12, xp: 120, sessions: 1, new: 0 } };
  store.state.streak = { current: 1, best: 1, lastDay: y };
  store.save();
  srs.addXp(15); store.bumpStreak();                    // what the match game does when finished
  return store.state.streak.current;
})()`);
await p.hash('#/stats', 1200);
r = await p.evaluate(`({ line: [...document.querySelectorAll('#view .hint')].map(x => x.textContent).find(t => /ذاكرت في/.test(t)) || '', today: document.querySelector('.heat-cell.today')?.className || '' })`);
check('Stats: match-only day is an active day (2 days, today cell lit)', /يومين/.test(r.line) && !/\bl0\b/.test(r.today), JSON.stringify(r));
const errs1 = p.errors.filter(e => !/githubusercontent|vibrate|_capacitor_file_/.test(e));
check('part 1: zero console errors', errs1.length === 0, errs1.join(' | ').slice(0, 500));
await p.close();

// ---------- part 2: mocked native plugins (notifications tap, backup, permission denial) ----------
p = await launch({ port: 9472, width: 390, height: 844 });
await p.addInit(`(() => {
  const pending = new Map();
  window.__ln = { pending, perm: 'granted', listeners: {}, writes: [], shares: [], shareMode: 'ok', reqResult: 'denied' };
  window.Capacitor = {
    isNativePlatform: () => true, convertFileSrc: u => u,
    Plugins: {
      LocalNotifications: {
        checkPermissions: async () => ({ display: window.__ln.perm }),
        requestPermissions: async () => ({ display: window.__ln.reqResult }),
        getPending: async () => ({ notifications: [...pending.values()].map(n => ({ id: n.id })) }),
        cancel: async ({ notifications }) => { for (const n of notifications) pending.delete(n.id); },
        schedule: async ({ notifications }) => { for (const n of notifications) pending.set(n.id, n); return { notifications }; },
        createChannel: async () => {}, removeAllDeliveredNotifications: async () => {},
        addListener: (ev, fn) => { window.__ln.listeners[ev] = fn; return { remove: async () => {} }; },
      },
      Filesystem: { writeFile: async o => { window.__ln.writes.push(o); return { uri: 'file:///data/cache/' + o.path }; } },
      Share: { share: async o => { window.__ln.shares.push(o); if (window.__ln.shareMode === 'cancel') throw new Error('Share canceled'); return {}; } },
    },
  };
})();`);
await p.goto(URL + '#/home', 2500);
await p.evaluate(`localStorage.removeItem('ws:v1')`);
await p.goto(URL + '#/home', 4000);
r = await p.evaluate(`(() => { const list = [...window.__ln.pending.values()]; const now = Date.now();
  return { n: list.length, soon: list.filter(x => new Date(x.schedule.at).getTime() - now < 60 * 60 * 1000).length,
           fsi: list.some(x => x.title.includes('\\u2068') && x.title.includes('\\u2069')), listener: !!window.__ln.listeners.localNotificationActionPerformed }; })()`);
check('app open → nothing scheduled in the next hour; German titles wrapped in FSI…PDI', r.n > 0 && r.soon === 0 && r.listener, JSON.stringify(r));
check('reminder titles carry FSI/PDI around the lesson title', r.fsi, JSON.stringify(r));
await p.hash('#/exam/1', 1500);
await p.evaluate(`document.querySelector('.gm-go') && document.querySelector('.gm-go').click()`);
await p.sleep(800);
r = await p.evaluate(`(() => { window.__ln.listeners.localNotificationActionPerformed({ notification: { extra: { route: '#/home' } } }); return new Promise(res => setTimeout(() => res({ hash: location.hash, stage: !!document.querySelector('.gm-stage'), immersive: document.body.classList.contains('immersive') }), 400)); })()`);
check('tapping a reminder during an exam keeps the exam', r.hash === '#/exam/1' && r.stage, JSON.stringify(r));
await p.hash('#/home', 1200);
r = await p.evaluate(`(() => { const first = document.querySelector('#view > *'); first.dataset.old = '1';
  window.__ln.listeners.localNotificationActionPerformed({ notification: { extra: { route: '#/home' } } });
  return new Promise(res => setTimeout(() => res({ hash: location.hash, redrawn: !document.querySelector('#view [data-old]') }), 500)); })()`);
check('tapping a reminder on #/home redraws it', r.hash === '#/home' && r.redrawn, JSON.stringify(r));
// backup
await p.hash('#/settings', 1500);
await p.evaluate(`document.querySelector('#btnExport').click()`);
await p.sleep(700);
r = await p.evaluate(`({ w: window.__ln.writes.map(x => x.path + ':' + x.directory + ':' + x.encoding + ':' + (x.data || '').length), s: window.__ln.shares.map(x => (x.files || []).join(',')), toast: document.querySelector('.toast')?.textContent || '' })`);
check('APK backup: file written to CACHE and shared', r.w.length === 1 && /wortschatz-backup\.json:CACHE:utf8:\d{3,}/.test(r.w[0]) && r.s[0] === 'file:///data/cache/wortschatz-backup.json' && /اتبعتت/.test(r.toast), JSON.stringify(r));
await p.evaluate(`window.__ln.shareMode = 'cancel'; document.querySelector('#btnExport').click()`);
await p.sleep(700);
r = await p.evaluate(`({ toast: document.querySelector('.toast')?.textContent || '', open: document.querySelector('details.paste').open })`);
check('APK backup cancelled → honest message + copy-as-text opened', /ما اتبعتتش/.test(r.toast) && r.open, JSON.stringify(r));
// permission denied from the switch keeps the wish; granting later schedules
await p.evaluate(`(async () => { const { store } = await import('./js/store.js'); store.state.settings.notify = false; store.save(); window.__ln.perm = 'denied'; window.__ln.reqResult = 'denied'; })()`);
await p.hash('#/home', 500); await p.hash('#/settings', 1500);
await p.evaluate(`document.querySelector('input[data-key=notify]').click()`);
await p.sleep(900);
r = await p.evaluate(`(async () => { const { store } = await import('./js/store.js'); return { notify: store.state.settings.notify, sw: document.querySelector('input[data-key=notify]').checked, state: document.querySelector('#notifyState').textContent }; })()`);
check('denied from the switch: switch off, wish kept (notify stays true)', r.notify === true && r.sw === false && /مرفوض/.test(r.state), JSON.stringify(r));
await p.evaluate(`(async () => { window.__ln.perm = 'granted'; const n = await import('./js/notify.js'); await n.replan(); })()`);
await p.sleep(500);
r = await p.evaluate(`({ n: window.__ln.pending.size })`);
check('…after granting in phone settings, reminders get scheduled', r.n > 0, JSON.stringify(r));

// review-3: all exams passed + crown ready → reminders talk about the crown, not «لسه ما خلصتش»
await p.evaluate(`(async () => {
  const { store, todayIndex } = await import('./js/store.js');
  const { DATA } = await import('./js/data.js');
  const t = todayIndex();
  store.state.exams = {};
  for (const l of DATA.lessons) store.state.exams[l.n] = { passed: t - 10, crown: l.n === 2 ? 0 : t - 5, best: 100, tries: 1, crownTries: 1 };
  store.state.settings.notify = true; store.save();
  window.__ln.perm = 'granted';
  const n = await import('./js/notify.js'); await n.replan();
})()`);
await p.sleep(500);
r = await p.evaluate(`(() => { const today = new Date().toDateString(); const list = [...window.__ln.pending.values()].filter(x => new Date(x.schedule.at).toDateString() === today);
  return { n: list.length, titles: [...new Set(list.map(x => x.title + ' | ' + x.body))] }; })()`);
check('crown-ready reminders: no «لسه ما خلصتش» / «مين هيخلّص الدرس الأول»', r.titles.every(t => !/لسه ما خلصتش|هيخلّص الدرس الأول/.test(t)), JSON.stringify(r).slice(0, 400));
const errs2 = p.errors.filter(e => !/githubusercontent|vibrate|_capacitor_file_/.test(e));
check('part 2: zero console errors', errs2.length === 0, errs2.join(' | ').slice(0, 500));
await p.close();
console.log(results.join('\n'));
console.log(results.every(x => x.startsWith('PASS')) ? 'ALL PASS' : 'SOME FAILED');
