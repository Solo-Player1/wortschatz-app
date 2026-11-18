// Typed-answer grading in the games/exam path (games/engine.js expectedFor + checkTyped, and the online qgen) for DW
// notations from lesson 16 on: auf|stehen, an|rufen, mein(e), euer/eure, Lieber/Liebe, die Eltern (Plural), etwas sagen.
// Needs: python tests/e2e/serve.py 8131   ·   run: node tests/e2e/t_grading.mjs
import { launch } from './cdp.mjs';
const p = await launch({ port: 9481 });
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
await p.goto('http://127.0.0.1:8131/index.html#/home', 3000);
const r = await p.evaluate(`(async () => {
  const { DATA } = await import('./js/data.js');
  const eng = await import('./js/games/engine.js');
  const q = await import('./js/online/qgen.js');
  const find = re => DATA.words.find(w => re.test(w.de));
  const cases = [
    [/^auf\\|stehen$/, 'aufstehen', true], [/^auf\\|stehen$/, 'stehen', false],
    [/an\\|rufen$/, 'anrufen', true],
    [/^mein\\(e\\)$/, 'mein', true], [/^mein\\(e\\)$/, 'meine', true], [/^mein\\(e\\)$/, 'dein', false],
    [/^euer\\/eure$/, 'eure', true], [/^Lieber\\/Liebe/, 'Liebe', true],
    [/^die Eltern/, 'die Eltern', true], [/^etwas sagen$/, 'sagen', true],
  ];
  const out = [];
  for (const [re, typed, want] of cases) {
    const w = find(re);
    if (!w) { out.push({ de: String(re), missing: true }); continue; }
    const game = eng.checkTyped(eng.expectedFor(w).accept, typed).ok;
    const online = eng.checkTyped(q.typeWordQ(w).accept, typed).ok;
    out.push({ de: w.de, typed, want, game, online });
  }
  return out;
})()`);
for (const c of r) {
  if (c.missing) { check(`word ${c.de} exists`, false); continue; }
  check(`games/exam: ${c.de} ← «${c.typed}» → ${c.want}`, c.game === c.want, `got ${c.game}`);
  check(`online race: ${c.de} ← «${c.typed}» → ${c.want}`, c.online === c.want, `got ${c.online}`);
}
const errs = p.errors.filter(e => !/githubusercontent|vibrate|tv-download|static\.dw\.com/.test(e));
check('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await p.close();
for (const x of results) console.log(x);
const fails = results.filter(x => x.startsWith('FAIL')).length;
console.log(`t_grading: ${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
