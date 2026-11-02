// 🔁 صرّف الفعل — ضمير + فعل في المصدر (du ___ (wohnen)) وانت تقول الفعل متصرّف في المضارع. كل غلطة = قلب.
// أول ٤ أسئلة اختيار (٤ صيغ من نفس الفعل)، وبعد كده كتابة — والأفعال اللي بتنفصل (rufe … an) دايمًا اختيار.
// لو غلطت بيظهر تصريف الفعل كله (٦ صيغ) علشان تراجعه.
import { choiceGrid, typeBox } from './rounds.js';
import { injectCss } from './engine.js';
import { PERSONS } from '../content.js';
import { normDe } from '../exercises.js';

export const meta = {
  id: 'verbs',
  title: 'صرّف الفعل',
  icon: '🔁',
  short: 'صرّف الفعل مع كل ضمير صح',
  desc: 'هتشوف الضمير والفعل في المصدر — قول الفعل متصرّف صح. كل غلطة بقلب!',
  how: [
    'أول ٤ أسئلة اختيار، وبعد كده هتكتب الفعل بنفسك ✍️',
    'الأفعال اللي بتنفصل دايمًا اختيار — الجزء التاني بيروح آخر الجملة',
    'لو غلطت هتشوف تصريف الفعل كله تراجعه',
  ],
  hearts: 3,
  minItems: 4,
  unit: 'تصريف',
  rounds: 15,
  count: pool => pool.verbs().length * 6,
};

const CSS = `
.gm-verbs-p { display: grid; gap: 8px; justify-items: center; width: 100%; }
.gm-verbs-tag { font-size: 13px; }
.gm-verbs-q { margin: 0; font-family: var(--font-de); font-size: 30px; font-weight: 700; line-height: 1.5; overflow-wrap: anywhere; }
.gm-prompt .gm-verbs-q .de { font-size: inherit; font-weight: inherit; line-height: inherit; }
.gm-verbs-pron { color: var(--blue); }
.gm-verbs-blank { display: inline-block; min-width: 3em; padding: 0 8px; line-height: 1.3; text-align: center; white-space: pre;
  border-bottom: 3px dashed var(--blue); border-radius: 8px 8px 0 0; background: var(--blue-tint); color: var(--blue); }
.gm-verbs-blank.ok { border-bottom-style: solid; border-color: var(--good); background: var(--good-tint); color: var(--good-text); }
.gm-verbs-inf { color: var(--muted); font-size: .62em; font-weight: 600; white-space: nowrap; }
.gm-verbs-ar { margin: 0; font-size: 17px; color: var(--ink-2); line-height: 1.6; overflow-wrap: anywhere; }
.gm-verbs-ar b { font-family: var(--font-head); color: var(--ink); }
.gm-verbs-table { display: grid; grid-template-columns: repeat(2, max-content); gap: 2px 18px; justify-content: end; direction: ltr; margin-top: 6px; font-size: 14px; line-height: 1.6; color: var(--ink-2); }
.gm-verbs-table .de, .gm-fb-ans .gm-verbs-table .de { font-size: 14px; font-weight: 500; }
.gm-verbs-table .me { color: var(--ink); }
.gm-verbs-table .me .de, .gm-fb-ans .gm-verbs-table .me .de { font-weight: 800; text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 340px) { .gm-verbs-table { grid-template-columns: max-content; } }
`;

const CHOICE_PTS = 10, TYPE_PTS = 15;
const CHOICE_ROUNDS = 4;
// الضمير اللي بيتعرض: er = er (هو) أو sie (هي) — sie = sie (هما) أو Sie (حضرتك)
const personAr = key => (PERSONS.find(p => p.key === key) || {}).ar || key;
const SHOW = {
  ich: [{ de: 'ich', ar: personAr('ich') }],
  du: [{ de: 'du', ar: personAr('du') }],
  er: [{ de: 'er', ar: 'هو' }, { de: 'sie', ar: 'هي' }],
  wir: [{ de: 'wir', ar: personAr('wir') }],
  ihr: [{ de: 'ihr', ar: personAr('ihr') }],
  sie: [{ de: 'sie', ar: 'هما' }, { de: 'Sie', ar: 'حضرتك (رسمي)' }],
};
// ترتيب جدول التصريف (عمودين): ich | wir — du | ihr — er/sie/es | sie/Sie
const TABLE = ['ich', 'wir', 'du', 'ihr', 'er', 'sie'];
const TABLE_LABEL = { ich: 'ich', du: 'du', er: 'er/sie/es', wir: 'wir', ihr: 'ihr', sie: 'sie/Sie' };
// "rufe … an" → "rufe an" (للنطق)
const spoken = f => String(f).replace(/\s*…\s*/g, ' ').trim();

// صيغ غلط معقولة لو صيغ الفعل نفسه أقل من ٤ (heißen: heiße/heißt/heißen → heißst)
function fakeForms(v) {
  const [base, ...rest] = String(v.forms.wir || v.inf).split(/\s*…\s*/);
  const tail = rest.length ? ' … ' + rest.join(' … ') : '';
  const stem = base.endsWith('en') ? base.slice(0, -2) : base.endsWith('n') ? base.slice(0, -1) : base;
  return ['st', 'e', 't', 'en', 'est', 'et'].map(end => stem + end + tail);
}

export function start(g) {
  injectCss('verbs', CSS);
  const verbs = g.verbs().filter(v => v && v.inf && v.forms && PERSONS.every(p => v.forms[p.key]));
  if (!verbs.length) { g.end({ win: true }); return; }

  // الجولات: كل فعل مرة بضمير عشوائي، وبعدين لفّة تانية بضمير تاني … لحد ١٥
  const picked = [], used = new Map(verbs.map(v => [v, new Set()]));
  for (let pass = 0; pass < PERSONS.length && picked.length < meta.rounds; pass++) {
    for (const v of g.shuffle(verbs)) {
      if (picked.length >= meta.rounds) break;
      const free = PERSONS.filter(p => !used.get(v).has(p.key));
      if (!free.length) continue;
      const p = free[Math.floor(Math.random() * free.length)];
      used.get(v).add(p.key);
      const variants = SHOW[p.key];
      picked.push({ v, key: p.key, pron: variants[Math.floor(Math.random() * variants.length)] });
    }
  }
  // الترتيب: عمر ما نفس الفعل ييجي مرتين ورا بعض (لو فيه أكتر من فعل) — بنختار كل مرة الفعل اللي فاضله أكتر
  const rounds = [], left = g.shuffle(picked);
  while (left.length) {
    const prev = rounds.length ? rounds[rounds.length - 1].v : null;
    const cnt = new Map();
    for (const r of left) cnt.set(r.v, (cnt.get(r.v) || 0) + 1);
    let best = -1;
    left.forEach((r, k) => { if (r.v !== prev && (best < 0 || cnt.get(r.v) > cnt.get(left[best].v))) best = k; });
    rounds.push(left.splice(Math.max(0, best), 1)[0]);
  }

  // ٤ صيغ من نفس الفعل (الصح + ٣)، من غير تكرار
  const formOptions = (v, key) => {
    const out = [], add = f => { if (f && !out.some(x => normDe(x) === normDe(f))) out.push(f); };
    add(v.forms[key]);
    for (const p of g.shuffle(PERSONS)) add(v.forms[p.key]);
    for (const f of fakeForms(v)) { if (out.length >= 4) break; add(f); }
    return g.shuffle(out.slice(0, 4));
  };
  const tableHtml = (v, key) => `<div class="gm-verbs-table">${TABLE.map(k => `<span${k === key ? ' class="me"' : ''}><bdi class="de">${g.esc(TABLE_LABEL[k])} ${g.esc(v.forms[k])}</bdi></span>`).join('')}</div>`;

  const ask = ({ v, key, pron }, typing) => new Promise(resolve => {
    const form = v.forms[key];
    g.stage.innerHTML = '';
    const q = g.el(`<div class="gm-q"><div class="gm-prompt"><div class="gm-verbs-p" data-inf="${g.esc(v.inf)}" data-key="${key}" data-mode="${typing ? 'type' : 'choice'}">
        <span class="chip ${typing ? 'warn' : 'blue'} gm-verbs-tag">${typing ? '✍️ اكتب الفعل متصرّف' : '🔁 اختار الصيغة الصح'}</span>
        <p class="gm-verbs-q"><bdi class="de"><span class="gm-verbs-pron">${g.esc(pron.de)}</span> <span class="gm-verbs-blank"> </span> <span class="gm-verbs-inf">(${g.esc(v.inf)})</span></bdi></p>
        <p class="gm-verbs-ar"><b>${g.esc(pron.ar)}</b> · ${g.esc(v.ar || '')}</p>
      </div></div></div>`);
    g.stage.appendChild(q);
    const blank = q.querySelector('.gm-verbs-blank');
    const itemId = `v:${v.inf}:${key}`;
    const finish = async (ok, { msg, label } = {}) => {
      blank.textContent = form;
      blank.classList.add('ok');
      g.say(`${pron.de} ${spoken(form)}`);
      const go = ok
        ? await g.correct({ points: typing ? TYPE_PTS : CHOICE_PTS, itemId, msg })
        : await g.wrong({ itemId, correctHtml: `<bdi class="de">${g.esc(pron.de)} ${g.esc(form)}</bdi>${tableHtml(v, key)}`, label });
      resolve(go);
    };
    if (typing) {
      const tb = typeBox(g, {
        placeholder: 'اكتب الفعل بس',
        onSubmit: val => {
          tb.disable();
          let r = g.checkTyped(form, val), msg;
          if (r.ok && r.almost) msg = `صح تقريبًا — الكتابة الصح: ${form}`;
          if (!r.ok) {   // كتب الضمير كمان (du wohnst) → صح، بس ننبّهه
            r = g.checkTyped(`${pron.de} ${form}`, val);
            if (r.ok) msg = 'صح 👍 — المرة الجاية اكتب الفعل بس';
          }
          finish(r.ok, { msg, label: `${v.ar || v.inf} · كتبت: ${val}` });
        },
      });
      g.on(tb.input, 'input', () => { if (!tb.input.disabled) blank.textContent = tb.input.value.trim() || ' '; });
      g.stage.appendChild(tb.el);
      tb.focus();
    } else {
      const opts = formOptions(v, key);
      g.stage.appendChild(choiceGrid(g, opts.map(f => ({ html: `<bdi class="de">${g.esc(f)}</bdi>`, value: f, correct: normDe(f) === normDe(form) })),
        o => finish(o.correct, { label: `${v.ar || v.inf} · اخترت: ${o.value}` }), { cols: opts.length === 4 ? 2 : 1 }));
    }
  });

  let i = 0;
  const next = async () => {
    if (!g.alive) return;
    if (i >= rounds.length) { g.end({ win: true }); return; }
    const r = rounds[i++];
    g.setProgress(i - 1, rounds.length);
    const typing = i > CHOICE_ROUNDS && r.v.type !== 'separable';
    if (await ask(r, typing)) next();
  };
  next();
}
