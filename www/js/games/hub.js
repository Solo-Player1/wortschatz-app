// games/hub.js — تاب «الألعاب» + راوت اللعبة #/game/:id
import { el, esc } from '../ui.js';
import { loadAllGames, loadGame } from './index.js';
import { runGame, defaultSel, selLabel } from './engine.js';
import { gameRecord } from '../progress.js';
import { currentLesson, allPassed, lessonStatus, nextStep } from '../mastery.js';

// كارت الامتحان فوق: امتحان الدرس اللي عليه الدور — ولو كل الامتحانات خلصت: التثبيت 👑 لو جاهز، غير كده مفيش كارت
function examCard() {
  const n = currentLesson();
  if (!allPassed()) return `<a class="card list-item link" href="#/exam/${n}"><span class="gh-ico" aria-hidden="true" style="font-size:30px">🏁</span><div class="grow"><b>امتحان الدرس ${n}</b><p class="muted small">الوحش النهائي: كل كلمات الدرس + جمل — بـ ٣ قلوب</p></div><span aria-hidden="true">‹</span></a>`;
  const step = nextStep(n, lessonStatus(n));
  if (step.key !== 'crown') return '';
  return `<a class="card list-item link" href="${step.href}"><span class="gh-ico" aria-hidden="true" style="font-size:30px">👑</span><div class="grow"><b>امتحان تثبيت الدرس ${n}</b><p class="muted small">اتأكد إنك لسه فاكر الدرس وخد التاج</p></div><span aria-hidden="true">‹</span></a>`;
}

export function renderGames(root) {
  root.innerHTML = `<section class="card gh-hero">
      <span class="gh-big" aria-hidden="true">🎮</span>
      <div class="grow"><h1>الألعاب</h1><p class="hint">كل لعبة ليها قلوب ونقط — العب على الدرس اللي بتذاكره أو على كل اللي حفظته. أي غلطة الكلمة بترجعلك في المراجعة.</p></div>
    </section>
    ${examCard()}
    <div class="gh-grid" aria-busy="true"><p class="hint">ثواني…</p></div>`;
  const grid = root.querySelector('.gh-grid');
  loadAllGames().then(mods => {
    if (!grid.isConnected) return;
    grid.removeAttribute('aria-busy');
    grid.innerHTML = mods.map(m => {
      const r = gameRecord(m.meta.id);
      return `<a class="card gh-card${r.plays ? '' : ' new'}" href="#/game/${esc(m.meta.id)}">
        <span class="gh-ico" aria-hidden="true">${m.meta.icon || '🎮'}</span>
        <b>${esc(m.meta.title)}</b>
        <span class="gh-desc">${esc(m.meta.short || m.meta.desc || '')}</span>
        ${r.best ? `<span class="chip blue gh-best">🏆 ${r.best}</span>` : ''}
      </a>`;
    }).join('') || '<p class="hint">مفيش ألعاب متحمّلة.</p>';
  });
}

export function renderGameRoute(root, id, params = {}) {
  root.innerHTML = '<section class="card"><div class="empty"><div class="big">🎮</div><p>ثواني…</p></div></section>';
  const token = location.hash;
  loadGame(id).then(mod => {
    if (location.hash !== token) return;            // المستخدم راح صفحة تانية قبل ما اللعبة تتحمّل
    if (!mod) { root.innerHTML = '<section class="card"><div class="empty"><div class="big">🤔</div><p>اللعبة دي مش موجودة</p></div><a class="btn btn-primary btn-big" href="#/games">الألعاب</a></section>'; return; }
    runGame(root, mod, params);
  });
}

export { defaultSel, selLabel };
