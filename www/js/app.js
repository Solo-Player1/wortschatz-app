// تشغيل الأبلكيشن + الراوتر
import { loadData } from './data.js';
import { loadContent } from './content.js';
import { store, today } from './store.js';
import { applyTheme, toast } from './ui.js';
import * as screens from './screens.js';
import * as session from './session.js';
import * as video from './video.js';
import * as update from './update.js';
import * as library from './library.js';
import * as games from './games/hub.js';
import * as exam from './exam.js';
import * as ref from './reference.js';
import * as notify from './notify.js';

const TITLES = {
  home: 'Wortschatz', lessons: 'الدروس', lesson: 'الدرس', session: 'مذاكرة', match: 'لعبة التوصيل', stats: 'إحصائياتي',
  settings: 'الإعدادات', video: 'فيديو الدرس', library: 'المكتبة', lib: 'المكتبة', games: 'الألعاب', game: 'لعبة',
  exam: 'امتحان الدرس', drill: 'جمل الدرس', ref: 'مراجع',
};
const IMMERSIVE = new Set(['session', 'match', 'video', 'lib', 'exam', 'drill']);
const TAB_OF = { lesson: 'lessons', video: 'lessons', lib: 'library', game: 'games', exam: 'lessons', drill: 'lessons', ref: 'lessons', stats: 'home' };

function parseRoute() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = {};
  if (qs) for (const kv of qs.split('&')) { const [k, v] = kv.split('='); params[decodeURIComponent(k)] = decodeURIComponent(v || ''); }
  return { name: parts[0] || 'home', arg: parts[1], params };
}

let renderedDay = '';
function render() {
  const view = document.getElementById('view');
  const r = parseRoute();
  renderedDay = today();
  const name = TITLES[r.name] ? r.name : 'home';
  document.body.classList.toggle('immersive', IMMERSIVE.has(name));
  document.body.dataset.route = name;
  document.getElementById('topbarTitle').textContent = TITLES[name];
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === (TAB_OF[name] || name)));
  view.innerHTML = '';
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    switch (name) {
      case 'lessons': screens.renderLessons(view); break;
      case 'lesson': screens.renderLesson(view, +r.arg); break;
      case 'session': session.renderSession(view, { lesson: r.params.lesson ? +r.params.lesson : null }); break;
      case 'match': session.renderMatch(view, { lesson: r.params.lesson ? +r.params.lesson : null }); break;
      case 'video': video.renderVideo(view, { lesson: +r.arg }); break;
      case 'stats': screens.renderStats(view); break;
      case 'settings': screens.renderSettings(view); break;
      case 'library': library.renderLibrary(view); break;
      case 'lib': library.renderLibItem(view, { id: r.arg }); break;
      case 'games': games.renderGames(view); break;
      case 'game': games.renderGameRoute(view, r.arg, r.params); break;
      case 'exam': exam.renderExam(view, { lesson: +r.arg, kind: r.params.kind === 'crown' ? 'crown' : 'exam' }); break;
      case 'drill': exam.renderDrill(view, { lesson: +r.arg }); break;
      case 'ref': ref.renderRef(view, { page: r.arg || '', params: r.params }); break;
      default: screens.renderHome(view);
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><p>حصلت مشكلة في عرض الصفحة.</p><p class="muted de" dir="ltr">${String(e && e.message || e)}</p><button class="btn btn-primary" onclick="location.hash='#/home'">الرئيسية</button></div>`;
  }
}

export function go(hash) { location.hash = hash; }

async function boot() {
  store.load();
  applyTheme(store.state.settings.theme);
  store.refreshStreak();
  try {
    await Promise.all([loadData(), loadContent()]);
  } catch (e) {
    document.getElementById('view').innerHTML = `<div class="card"><p>مش قادر أحمّل بيانات الدروس.</p><p class="muted">${String(e.message || e)}</p></div>`;
    return;
  }
  window.addEventListener('hashchange', render);
  // رابط لنفس الصفحة اللي إحنا فيها (زي «🧱 كمّل جمل الدرس» بعد التدريب) → نعيد رسمها بدل ما الضغطة تضيع
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); render(); }
  });
  if (!location.hash) location.replace('#/home');
  render();
  update.confirmBoot();       // النسخة دي فتحت تمام (بعد تحديث من جوه الأبلكيشن) + رسالة «اتحدّث»
  // فحص التحديثات بعد أول رسم (مرة في اليوم، ومش بيأخّر التشغيل)
  setTimeout(() => update.checkForUpdate().then(a => { if (a && (location.hash || '#/home').startsWith('#/home')) render(); }), 1500);
  // التذكير كل ساعة: بيتجدول تاني كل ما الأبلكيشن يتقفل أو يتفتح
  setTimeout(() => { notify.clearShown(); notify.replan(); }, 2500);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      store.refreshStreak();
      notify.clearShown();
      // الصفحة اترسمت يوم تاني (مهمة امبارح «خلصت») → نرسمها من جديد، إلا لو في نص امتحان أو جلسة
      if (today() !== renderedDay && !document.body.classList.contains('immersive')) render();
    }
    notify.replan();
  });
}

boot().catch(e => { console.error(e); toast('حصلت مشكلة عند التشغيل'); });
