// 🫧 الكلمة الناقصة — جملة من الدرس فيها كلمة ناقصة: الأول تختارها، وفي النص التاني من اللعبة تكتبها بنفسك.
// كل غلطة = قلب، وبعد كل إجابة الجملة كاملة بتتقال بصوت.
import { choiceGrid, typeBox } from './rounds.js';
import { injectCss } from './engine.js';
import { tilesOf } from '../content.js';
import { normDe } from '../exercises.js';

export const meta = {
  id: 'cloze',
  title: 'الكلمة الناقصة',
  icon: '🫧',
  short: 'كمّل الجملة بالكلمة الصح',
  desc: 'في كل جملة كلمة ناقصة — اختارها، وبعدين اكتبها بنفسك. كل غلطة بقلب!',
  how: [
    'المعنى بالعربي تحت الجملة بيقولك الكلمة الناقصة إيه',
    'النص الأول اختيار، والنص التاني هتكتب الكلمة بنفسك',
    'بعد كل إجابة هتسمع الجملة كاملة',
  ],
  hearts: 3,
  minItems: 4,
  unit: 'جملة',
  rounds: 12,
  count: pool => pool.sentences({ cloze: true }).length,
};

const CSS = `
.gm-cloze-p { display: grid; gap: 10px; justify-items: center; width: 100%; }
.gm-cloze-tag { font-size: 13px; }
.gm-cloze-de { margin: 0; font-family: var(--font-de); font-size: 24px; font-weight: 700; line-height: 1.75; overflow-wrap: anywhere; }
.gm-prompt .gm-cloze-de .de { font-size: inherit; font-weight: inherit; line-height: inherit; }
.gm-cloze-blank { display: inline-block; min-width: 3.4em; min-height: 1.35em; padding: 0 8px; margin: 0 2px; vertical-align: baseline; line-height: 1.35;
  border-bottom: 3px dashed var(--blue); border-radius: 8px 8px 0 0; background: var(--blue-tint); color: var(--blue); text-align: center; white-space: pre; }
.gm-cloze-blank.ok { border-bottom-style: solid; border-color: var(--good); background: var(--good-tint); color: var(--good-text); }
.gm-cloze-p .gm-ar { font-size: 18px; color: var(--ink-2); overflow-wrap: anywhere; }
.gm-cloze-hl { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.gm-speaker.sm.gm-cloze-say { width: 48px; height: 48px; }
`;

const CHOICE_PTS = 10, TYPE_PTS = 15;
// في الكتابة: كلمات تانية بتنفع في نفس المكان (gern = gerne) + cloze.accept من المحتوى («Danke ___!» → schön / sehr)
const SAME = { gern: ['gerne'], gerne: ['gern'] };
const acceptOf = (s, word) => [word, ...((s.cloze && Array.isArray(s.cloze.accept)) ? s.cloze.accept : []), ...(SAME[normDe(word)] || [])];
const PUNCT = /[.,!?;:…"„“”«»()]+/g;
const strip = t => String(t).replace(PUNCT, '');
// كلمة واحدة بحروف بس (ينفع تتكتب): Morgen، heiße، E-Mail … مش أرقام
const typeable = w => /^\p{L}[\p{L}’'\-]*$/u.test(w);

// الجملة متقسّمة حوالين الكلمة الناقصة — الترقيم اللازق في الكلمة بيفضل جنب الفراغ ("Morgen," → "___,")
function splitCloze(s) {
  const word = s.cloze && s.cloze.word;
  if (!word) return null;
  const tiles = tilesOf(s);
  let idx = tiles.findIndex(t => strip(t) === word);
  if (idx < 0) idx = tiles.findIndex(t => normDe(t) === normDe(word));
  if (idx < 0) return null;
  const tile = tiles[idx];
  let pre = '', post = '';
  const at = tile.indexOf(word);
  if (at >= 0) { pre = tile.slice(0, at); post = tile.slice(at + word.length); }
  else { const m = tile.match(/^([^\p{L}\p{N}]*)[\s\S]*?([^\p{L}\p{N}]*)$/u); pre = m ? m[1] : ''; post = m ? m[2] : ''; }
  return { word, before: tiles.slice(0, idx).join(' '), pre, post, after: tiles.slice(idx + 1).join(' ') };
}

export function start(g) {
  injectCss('cloze', CSS);
  const all = g.sentences({ cloze: true })
    .map(s => ({ s, parts: splitCloze(s) }))
    .filter(x => x.parts && Array.isArray(x.s.cloze.opts) && x.s.cloze.opts.length >= 2 && x.s.cloze.opts.includes(x.parts.word));
  const list = g.shuffle(all).slice(0, meta.rounds);
  if (!list.length) { g.end({ win: true }); return; }
  // الكتابة بتبدأ بعد الجملة السادسة (أو بعد نص اللعبة لو الجمل قليلة)
  const typeFrom = Math.min(6, Math.ceil(list.length / 2));

  // الجملة: الفراغ في النص (blankHtml) — أو الكلمة نفسها ملوّنة (للإجابة الصح تحت)
  const sentHtml = (p, mid) => `<bdi class="de">${g.esc(p.before)}${p.before ? ' ' : ''}${g.esc(p.pre)}${mid}${g.esc(p.post)}${p.after ? ' ' : ''}${g.esc(p.after)}</bdi>`;
  const answerHtml = p => sentHtml(p, `<b class="gm-cloze-hl">${g.esc(p.word)}</b>`);

  let i = 0, cur = null;
  g.on(g.stage, 'click', e => { if (e.target.closest('.gm-cloze-say') && cur) g.say(cur.de); });

  const ask = ({ s, parts }, typing) => new Promise(resolve => {
    g.stage.innerHTML = '';
    const q = g.el(`<div class="gm-q">
      <button type="button" class="gm-speaker sm gm-cloze-say" aria-label="اسمع الجملة" hidden>🔊</button>
      <div class="gm-prompt"><div class="gm-cloze-p" data-sid="${g.esc(s.id)}" data-mode="${typing ? 'type' : 'choice'}">
        <span class="chip ${typing ? 'warn' : 'blue'} gm-cloze-tag">${typing ? 'اكتب الكلمة الناقصة' : 'اختار الكلمة الناقصة'}</span>
        <p class="gm-cloze-de">${sentHtml(parts, '<span class="gm-cloze-blank" aria-label="كلمة ناقصة"> </span>')}</p>
        <p class="gm-ar">${g.esc(s.ar)}</p>
      </div></div>
    </div>`);
    g.stage.appendChild(q);
    const blank = q.querySelector('.gm-cloze-blank');
    // بعد الإجابة: الكلمة الصح في الفراغ + الجملة كاملة بالصوت
    const finish = async (ok, { almost = false, typed } = {}) => {
      blank.textContent = parts.word;
      blank.classList.add('ok');
      q.querySelector('.gm-cloze-say').hidden = false;
      g.say(s.de);
      const pts = typing ? TYPE_PTS : CHOICE_PTS;
      const go = ok
        ? await g.correct({ points: pts, itemId: s.id, msg: almost ? `صح تقريبًا — الكتابة الصح: ${parts.word}` : undefined })
        : await g.wrong({ itemId: s.id, correctHtml: answerHtml(parts), label: typed != null ? `كتبت: ${typed}` : s.ar });
      resolve(go);
    };
    if (typing) {
      const tb = typeBox(g, {
        placeholder: 'اكتب الكلمة الناقصة',
        onSubmit: v => { tb.disable(); const r = g.checkTyped(acceptOf(s, parts.word), v); finish(r.ok, { almost: r.almost, typed: v }); },
      });
      // اللي بيتكتب بيظهر جوه الفراغ على طول
      g.on(tb.input, 'input', () => { if (!tb.input.disabled) blank.textContent = tb.input.value.trim() || ' '; });
      g.stage.appendChild(tb.el);
      tb.focus();
    } else {
      const opts = g.shuffle(s.cloze.opts);
      const cols = opts.length === 4 ? 2 : 1;
      g.stage.appendChild(choiceGrid(g, opts.map(o => ({ html: `<bdi class="de">${g.esc(o)}</bdi>`, value: o, correct: o === parts.word })), o => finish(o.correct), { cols }));
    }
  });

  const next = async () => {
    if (!g.alive) return;
    if (i >= list.length) { g.end({ win: true }); return; }
    const item = list[i++];
    cur = item.s;
    g.setProgress(i - 1, list.length);
    const typing = i > typeFrom && typeable(item.parts.word);
    if (await ask(item, typing)) next();
  };
  next();
}
