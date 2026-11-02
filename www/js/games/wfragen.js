// ❓ أدوات الاستفهام — كمّل السؤال بالأداة الصح (Wie / Wo / Woher …)، وبعد الإجابة الصح بتشوف الرد عليه.
// حوالي تلت الجولات بالعكس: بتشوف الرد ولازم تختار السؤال بتاعه («إيه السؤال؟»). كل غلطة = قلب.
import { choiceGrid } from './rounds.js';
import { injectCss } from './engine.js';
import { wfragenUpTo } from '../content.js';
import { normDe } from '../exercises.js';

export const meta = {
  id: 'wfragen',
  title: 'أدوات الاستفهام',
  icon: '❓',
  short: 'اختار أداة السؤال الصح',
  desc: 'كمّل السؤال بالأداة الصح، واعرف السؤال من الرد عليه — كل غلطة بقلب!',
  how: [
    'المعنى بالعربي تحت السؤال بيقولك بنسأل عن إيه',
    'أحيانًا هتشوف الرد ولازم تختار السؤال بتاعه 🔄',
    '📒 عايز تراجع؟ «كل أدوات الاستفهام» في صفحة المراجع',
  ],
  // لينك صفحة المراجع (لو الإنجن عرض meta.links في شاشة البداية)
  links: [{ href: '#/ref/wwords', label: '📒 كل أدوات الاستفهام' }],
  hearts: 3,
  minItems: 3,     // الدرس الأول فيه ٣ أسئلة بس
  unit: 'سؤال',
  rounds: 12,
  count: pool => pool.wfragen().length,
};

const CSS = `
.gm-wfragen-p { display: grid; gap: 10px; justify-items: center; width: 100%; }
.gm-wfragen-tag { font-size: 13px; }
.gm-wfragen-q { margin: 0; font-family: var(--font-de); font-size: 28px; font-weight: 700; line-height: 1.6; overflow-wrap: anywhere; }
.gm-prompt .gm-wfragen-q .de { font-size: inherit; font-weight: inherit; line-height: inherit; }
.gm-wfragen-blank { display: inline-block; min-width: 2.4em; padding: 0 8px; line-height: 1.3; text-align: center;
  border-bottom: 3px dashed var(--blue); border-radius: 8px 8px 0 0; background: var(--blue-tint); color: var(--blue); }
.gm-wfragen-blank.ok { border-bottom-style: solid; border-color: var(--good); background: var(--good-tint); color: var(--good-text); }
.gm-wfragen-p .gm-ar { font-size: 19px; color: var(--ink-2); overflow-wrap: anywhere; }
.gm-wfragen-reply { position: relative; display: grid; gap: 2px; justify-items: center; max-width: 100%; margin-top: 4px; padding: 12px 20px 10px; border-radius: 18px;
  background: var(--surface-2); border: 1px solid var(--line-strong); }
.gm-wfragen-reply.ok { background: var(--good-tint); border-color: var(--good); animation: gm-wfragen-pop .25s ease-out; }
.gm-prompt .gm-wfragen-reply .de { font-size: 20px; line-height: 1.5; overflow-wrap: anywhere; color: var(--ink); }
.gm-prompt .gm-wfragen-reply.big .de { font-size: 24px; }
.gm-wfragen-reply small { font-size: 14.5px; color: var(--ink-2); line-height: 1.6; }
.gm-wfragen-ico { position: absolute; top: -12px; inset-inline-start: 12px; font-size: 21px; line-height: 1; }
@keyframes gm-wfragen-pop { from { opacity: 0; transform: scale(.88); } to { opacity: 1; transform: none; } }
`;

const A_PTS = 10, B_PTS = 15;
const valid = it => it && typeof it.q === 'string' && it.q.includes('___') && it.answer && Array.isArray(it.opts) && it.opts.includes(it.answer);
const fullQ = it => it.q.replace('___', it.answer);
const qKey = it => normDe(fullQ(it));
// أول كلمة بعد الفراغ (غالبًا الفعل): «Wie heißt du?» و«Wie heißen Sie?» نفس السؤال تقريبًا
const verbKey = it => normDe((String(it.q).split('___')[1] || '').trim().split(/\s+/)[0] || '').slice(0, 4);
// كلمات المحتوى (من غير الضماير والأدوات وحروف الجر) — أول ٤ حروف، وتصريفات sein / haben كلمة واحدة
const STOP = new Set(('ich du er sie es wir ihr man mich dich mir dir ihm ihn uns euch ihnen mein meine meinen meinem meiner dein deine deinen deinem deiner '
  + 'sein seine seinen ihre ihren ihrem unser unsere euer eure der die das den dem des ein eine einen einem einer kein keine keinen und oder aber auch nicht '
  + 'noch schon sehr gern gerne hier da dort jetzt heute so ja nein bitte danke denn mal doch nur in im an am auf aus bei mit nach von vom zu zum zur für '
  + 'über vor wie was wo wer woher wohin wann warum welche welcher welches welchen viel viele').split(' '));
const FORMS = { bin: '=sein', bist: '=sein', ist: '=sein', sind: '=sein', seid: '=sein', habe: '=haben', hast: '=haben', hat: '=haben', haben: '=haben', habt: '=haben' };
// #name: السؤال عن الاسم (heißen / Name) — والرد اللي فيه كلمة بحرف كبير في نص الجملة (Ich bin Emma.) ممكن يرد عليه
const stems = (s, reply = false) => {
  const raw = String(s || '').replace('___', ' ');
  const out = new Set(normDe(raw).split(' ').map(w => FORMS[w] || w).filter(w => w.length >= 3 && !STOP.has(w)).map(w => (w[0] === '=' ? w : w.slice(0, 4))));
  if (out.has('heiß') || out.has('name')) out.add('#name');
  if (out.has('wohn') || out.has('adre')) out.add('#addr');          // «Wo wohnen Sie?» بيترد عليه بـ«Meine Adresse ist …»
  if (/nummer/.test(normDe(raw))) out.add('#num');                   // Nummer / Telefonnummer / Handynummer / Hausnummer
  if (reply) raw.split(/\s+/).forEach((w, k, a) => { if (k > 0 && !/[.!?]$/.test(a[k - 1]) && /^\p{Lu}/u.test(w)) out.add('#name'); });
  return out;
};
const shares = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };
// «Wer bist du? / Wer sind Sie?» = سؤال عن الشخص → «Ich heiße Nico.» بيرد عليه برضه (Wer في STOP فبنشوفه من السؤال نفسه)
const WHO = /^\s*___\s+(bist\s+du|sind\s+sie)\s*\?\s*$/i;
const qStemsOf = o => { const s = stems(o.q); if (normDe(o.answer) === 'wer' && WHO.test(o.q)) s.add('#name'); return s; };
const OPEN = /^\s*___\s+ist\s+mit\s+(dir|ihnen)\b/i;
// رد فيه فعل (مش اسم بس زي «Pizza Hawaii.» أو «Zehn Personen.» اللي ينفعوا لأسئلة كتير)
const hasVerb = r => String(r).split(/\s+/).slice(1).some(w => /^[a-zäöüß]{3,}[.,!?]*$/.test(w) && !STOP.has(normDe(w)));

export function start(g) {
  injectCss('wfragen', CSS);
  const items = g.shuffle(g.wfragen().filter(valid));
  if (!items.length) { g.end({ win: true }); return; }
  // أسئلة التمويه في «إيه السؤال؟»: من اللعبة + كل أسئلة الدروس لحد الدرس ده
  const byId = new Map(items.map(it => [it.id, it]));
  for (const it of wfragenUpTo(g.maxLesson()).filter(valid)) if (!byId.has(it.id)) byId.set(it.id, it);
  const bank = [...byId.values()];

  // ٣ أسئلة غلط مالهاش علاقة بالرد ده: ولا سؤال فيه كلمة من الرد (Wo wohnt Yara? مع «Ich wohne in Kairo.»)،
  // الأول أداة استفهام مختلفة، وبعدين نفس الأداة بس فعل تاني
  const qStems = new Map(bank.map(o => [o, qStemsOf(o)]));
  const distractorsFor = it => {
    const mine = qKey(it), myReply = normDe(it.reply), myAns = normDe(it.answer), myVerb = verbKey(it), replyStems = stems(it.reply, true);
    const strong = [], weak = [], seen = new Set([mine]);
    for (const o of g.shuffle(bank)) {
      const k = qKey(o);
      if (OPEN.test(o.q)) continue;          // «Was ist mit dir?» بينفع لأي رد بيتكلم فيه عن نفسه
      if (o.id === it.id || seen.has(k) || (o.reply && normDe(o.reply) === myReply) || shares(qStems.get(o) || qStemsOf(o), replyStems)) continue;
      if (normDe(o.answer) !== myAns) { strong.push(o); seen.add(k); }
      else if (verbKey(o) !== myVerb) { weak.push(o); seen.add(k); }
    }
    return strong.concat(weak).slice(0, 3);
  };
  // «إيه السؤال؟» بس لو الرد خاص بالسؤال ده (فيه كلمة منه) — ردود زي «Keine Ahnung.» تنفع لأي سؤال
  const canB = it => !!(it.reply && String(it.reply).trim()) && hasVerb(it.reply) && shares(stems(it.q), stems(it.reply, true)) && distractorsFor(it).length >= 3;

  // خطة الجولات: كل تالت جولة «إيه السؤال؟» (لو فيه رد) — ولو الأسئلة قليلة نفس السؤال يرجع بالعكس بعد جولتين على الأقل
  const N = meta.rounds, plan = [];
  if (items.length >= N) {
    const chosen = items.slice(0, N);
    const bList = chosen.filter(canB).slice(0, Math.round(N / 3));
    const aList = chosen.filter(it => !bList.includes(it));
    for (let k = 0; k < N; k++) {
      if ((k % 3 === 2 && bList.length) || !aList.length) plan.push({ it: bList.shift(), type: 'B' });
      else plan.push({ it: aList.shift(), type: 'A' });
    }
  } else {
    const aList = items.slice(), bList = items.filter(canB), askedAt = new Map();
    while (plan.length < N && (aList.length || bList.length)) {
      const k = plan.length;
      const ready = bList.findIndex(it => askedAt.has(it.id) && k - askedAt.get(it.id) >= 2);
      if ((k % 3 === 2 && ready >= 0) || !aList.length) plan.push({ it: bList.splice(Math.max(0, ready), 1)[0], type: 'B' });
      else { const it = aList.shift(); askedAt.set(it.id, k); plan.push({ it, type: 'A' }); }
    }
  }

  // وقفة قصيرة نشوف فيها الرد — دوسة على الشاشة بتعدّيها
  let skip = null;
  const pause = ms => new Promise(res => { const fin = () => { if (skip === fin) skip = null; res(); }; skip = fin; g.after(ms, fin); });
  g.on(g.stage, 'click', () => { if (skip) skip(); });

  const replyHtml = (it, cls) => `<div class="gm-wfragen-reply ${cls}">
      <span class="gm-wfragen-ico" aria-hidden="true">💬</span><bdi class="de">${g.esc(it.reply)}</bdi>
      ${it.reply_ar ? `<small>${g.esc(it.reply_ar)}</small>` : ''}
    </div>`;
  const qHtml = it => `<bdi class="de">${g.esc(fullQ(it))}</bdi>`;

  // «كمّل السؤال»
  const askA = it => new Promise(resolve => {
    g.stage.innerHTML = '';
    const parts = it.q.split('___');
    const q = g.el(`<div class="gm-q"><div class="gm-prompt"><div class="gm-wfragen-p" data-wid="${g.esc(it.id)}" data-type="A">
        <span class="chip blue gm-wfragen-tag">❓ كمّل السؤال</span>
        <p class="gm-wfragen-q"><bdi class="de">${g.esc(parts[0])}<span class="gm-wfragen-blank">?</span>${g.esc(parts.slice(1).join('___'))}</bdi></p>
        <p class="gm-ar">${g.esc(it.ar || '')}</p>
        <div class="gm-wfragen-slot"></div>
      </div></div></div>`);
    g.stage.appendChild(q);
    const blank = q.querySelector('.gm-wfragen-blank');
    const opts = g.shuffle(it.opts).map(o => ({ html: `<bdi class="de">${g.esc(o)}</bdi>`, value: o, correct: o === it.answer }));
    g.stage.appendChild(choiceGrid(g, opts, async o => {
      blank.textContent = it.answer;
      blank.classList.add('ok');
      g.say(fullQ(it));
      if (!o.correct) {
        resolve(await g.wrong({ itemId: it.id, correctHtml: qHtml(it), label: it.ar || '' }));
        return;
      }
      const hasReply = !!(it.reply && String(it.reply).trim());
      if (hasReply) q.querySelector('.gm-wfragen-slot').outerHTML = replyHtml(it, 'ok');
      const go = await g.correct({ points: A_PTS, itemId: it.id });
      if (go && hasReply) await pause(Math.min(2600, 1100 + 30 * String(it.reply).length));
      resolve(go);
    }, { cols: 2 }));
  });

  // «إيه السؤال؟» — الرد ظاهر و٤ أسئلة كاملة
  const askB = it => new Promise(resolve => {
    g.stage.innerHTML = '';
    g.stage.appendChild(g.el(`<div class="gm-q"><div class="gm-prompt"><div class="gm-wfragen-p" data-wid="${g.esc(it.id)}" data-type="B">
        <span class="chip warn gm-wfragen-tag">🔄 إيه السؤال؟</span>
        ${replyHtml(it, 'big')}
        <p class="hint center">ده الرد — اختار السؤال بتاعه</p>
      </div></div></div>`));
    const opts = g.shuffle([it, ...distractorsFor(it)]).map(o => ({ html: qHtml(o), value: o.id, correct: o === it }));
    g.stage.appendChild(choiceGrid(g, opts, async o => {
      g.say(fullQ(it));
      const go = o.correct
        ? await g.correct({ points: B_PTS, itemId: it.id })
        : await g.wrong({ itemId: it.id, correctHtml: `${qHtml(it)}${it.ar ? ` <span class="muted">(${g.esc(it.ar)})</span>` : ''}`, label: it.reply_ar || '' });
      resolve(go);
    }, { cols: 1, cls: 'gm-wfragen-qs' }));
  });

  let i = 0;
  const next = async () => {
    if (!g.alive) return;
    if (i >= plan.length) { g.end({ win: true }); return; }
    const { it, type } = plan[i++];
    g.setProgress(i - 1, plan.length);
    if (await (type === 'B' ? askB(it) : askA(it))) next();
  };
  next();
}
