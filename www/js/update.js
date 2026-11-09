// update.js — فحص التحديثات من manifest.json (GitHub) + بانر الرئيسية + كارت الإعدادات
// نوعين تحديث:
//  web: ملفات الأبلكيشن بس (ألعاب، محتوى، شاشات) → zip بيتنزّل جوه الأبلكيشن (plugin «Updater») والأبلكيشن
//       بيفتح من جديد متحدّث على طول.
//  apk: إصدار أندرويد جديد (حاجات native) → بيتنزّل جوه الأبلكيشن ويفتح شاشة التثبيت بتاعة أندرويد.
// في المتصفح أو في APK قديم من غير الـ plugin → رابط الـ APK بيتفتح في المتصفح زي الأول.
import { APP_VERSION, VERSION_CODE, WEB_BUILD, UPDATE_MANIFEST_URL } from './version.js';
import { DATA } from './data.js';
import { store, today } from './store.js';
import { el, esc, toast } from './ui.js';
import { openExternal, isNative, plugin } from './native.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

// ---------- state ----------
// الحالة الافتراضية + هجرة للنسخ القديمة اللي مفيهاش updates
function upd() {
  const st = store.state;
  if (!st.updates || typeof st.updates !== 'object') st.updates = { lastCheck: 0, available: null, dismissed: 0 };
  const u = st.updates;
  if (!Number.isFinite(+u.lastCheck)) u.lastCheck = 0;
  if (!isNewer(u.available)) u.available = null;   // الأبلكيشن اتحدّث فعلاً → مفيش تحديث معلّق
  return u;
}

const validManifest = m => !!(m && typeof m === 'object' && Number.isFinite(+m.versionCode) && typeof m.apk === 'string' && m.apk);
const webOf = m => (m && m.web && Number.isFinite(+m.web.build) && typeof m.web.zip === 'string' && m.web.zip ? m.web : null);
// الزرار هيعمل إيه: 'apk' (إصدار أندرويد جديد) | 'web' (ملفات بس — بيتحدّث مكانه) | null
export function updateKind(m) {
  if (!m) return null;
  if (+m.versionCode > VERSION_CODE) return 'apk';
  const w = webOf(m);
  if (w && +w.build > WEB_BUILD && (+w.minVersionCode || 0) <= VERSION_CODE) return 'web';
  return null;
}
export const isNewer = m => !!updateKind(m);
const keyOf = m => `${+m.versionCode}.${webOf(m) ? +webOf(m).build : 0}`;          // «لاحقاً» بتتفتكر للإصدار ده بس
const versionOf = m => (updateKind(m) === 'web' ? webOf(m).version || m.version : m.version) || '';
const notesOf = m => (updateKind(m) === 'web' ? webOf(m).notes : m.notes) || '';
const updater = () => (isNative() ? plugin('Updater') : null);
// رقم الإصدار: تحديثات الويب بتزوّد الرقم بالترتيب (1.4 ، 1.5 …) — أنضف من «1.1.0 · تحديث 4»
export const versionLabel = () => (WEB_BUILD ? `1.${WEB_BUILD}` : APP_VERSION);

// ---------- check ----------
// بترجّع المانيفست لو فيه إصدار أجدد، غير كده null. أي خطأ شبكة → null بصمت.
export async function checkForUpdate({ force = false } = {}) {
  const u = upd();
  const now = Date.now();
  if (!force && u.lastCheck > 0 && now - u.lastCheck < DAY_MS) return u.available;   // throttle 24h

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const sep = UPDATE_MANIFEST_URL.includes('?') ? '&' : '?';
    const r = await fetch(`${UPDATE_MANIFEST_URL}${sep}t=${now}`, { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = await r.json();
    if (!validManifest(m)) throw new Error('bad manifest');
    m.versionCode = +m.versionCode;
    u.lastCheck = now;
    u.available = isNewer(m) ? m : null;
    if (typeof m.wsUrl === 'string') u.wsUrl = m.wsUrl;     // عنوان سيرفر اللعب أونلاين (ييجي من نفس الملف)
    store.save();
    console.info('[update] checked:', keyOf(m), u.available ? `(${updateKind(m)} update available)` : '(up to date)');
    return u.available;
  } catch (e) {
    console.info('[update] check skipped:', e && e.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- التحديث نفسه ----------
// web: بينزّل ويطبّق والـ WebView بيفتح من جديد بالملفات الجديدة · apk: بينزّل ويفتح شاشة التثبيت
async function runUpdate(m, btn) {
  const kind = updateKind(m);
  const U = updater();
  if (!kind) return;
  if (!U || (kind === 'web' && !U.applyWeb) || (kind === 'apk' && !U.installApk)) {
    openExternal(m.apk);
    toast('الملف بيتنزّل في المتصفح — افتحه لما يخلص وسطّبه');
    return;
  }
  if (navigator.onLine === false) { toast('مفيش نت — جرّب لما يبقى عندك اتصال'); return; }
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'بينزّل…'; }
  let sub = null;
  try {
    sub = await U.addListener('progress', ev => { if (btn && ev && ev.pct >= 0) btn.textContent = `بينزّل… ${ev.pct}%`; });
  } catch (e) { /* من غير نسبة */ }
  const done = () => {
    if (sub && sub.remove) sub.remove();
    if (btn) { btn.disabled = false; btn.textContent = label; }
  };
  if (kind === 'web') {
    const w = webOf(m);
    const u = upd();
    u.applied = +w.build;               // بعد ما يفتح من جديد بنقول «اتحدّث»
    store.save();
    try {
      if (btn) btn.textContent = 'بيتحدّث…';
      await U.applyWeb({ url: w.zip, sha256: w.sha256 || '', build: +w.build });
      // الـ WebView بيفتح من جديد دلوقتي بالنسخة الجديدة
    } catch (e) {
      u.applied = 0; store.save();
      console.warn('[update] web update failed', e);
      toast('التحديث ما نزلش — اتأكد من النت وجرّب تاني');
      done();
    }
    return;
  }
  try {
    await U.installApk({ url: m.apk });
    toast('دوس «تحديث» في شاشة التثبيت — تقدّمك مش هيضيع');
  } catch (e) {
    if (e && e.code === 'PERMISSION') toast('اسمح لـ Wortschatz بتثبيت التطبيقات من الشاشة اللي اتفتحت، وارجع دوس «حدّث» تاني');
    else { console.warn('[update] apk failed', e); toast('التنزيل وقف — اتأكد من النت وجرّب تاني'); }
  }
  done();
}

// أول ما الأبلكيشن يفتح: النسخة الجديدة اشتغلت تمام (لو ما اتقالش ده، أول فتحة جاية بترجع للنسخة اللي في الـ APK)
export function confirmBoot() {
  const U = updater();
  if (U && U.ready) U.ready().catch(() => {});
  const u = upd();
  if (u.applied) {
    toast(u.applied === WEB_BUILD ? `اتحدّث — الإصدار ${versionLabel()}` : 'التحديث ما اشتغلش ورجعنا للنسخة اللي قبله');
    u.applied = 0;
    store.save();
  }
}

// ---------- home banner ----------
// بيحط البانر أعلى المحتوى. بيرجّع true لو اترسم.
export function renderUpdateBanner(container) {
  if (!container) return false;
  const u = upd();
  const m = u.available;
  if (!m || u.dismissed === keyOf(m)) return false;
  const kind = updateKind(m);

  const banner = el(`
  <section class="card up-banner" role="status" aria-label="تحديث متاح">
    <div class="up-head">
      <span class="up-ico" aria-hidden="true">🆕</span>
      <div class="grow">
        <h2 class="up-title">تحديث جديد <bdi class="de up-ver">${esc(versionOf(m))}</bdi></h2>
        ${notesOf(m) ? `<p class="up-notes">${esc(notesOf(m))}</p>` : ''}
        <p class="up-date muted small">${kind === 'web' ? 'بيتنزّل ويتطبّق جوه الأبلكيشن — هيفتح من جديد متحدّث' : 'إصدار أندرويد جديد — هيفتحلك شاشة التثبيت'}</p>
      </div>
    </div>
    <div class="up-actions">
      <button type="button" class="btn btn-primary up-dl">حدّث دلوقتي</button>
      <button type="button" class="btn btn-ghost up-later">لاحقاً</button>
    </div>
  </section>`);

  const dl = banner.querySelector('.up-dl');
  dl.addEventListener('click', () => runUpdate(m, dl));
  banner.querySelector('.up-later').addEventListener('click', () => {
    u.dismissed = keyOf(m);
    store.save();
    banner.classList.add('up-out');
    setTimeout(() => banner.remove(), 200);
    toast('ماشي، هفكرك لما يطلع تحديث أجدد');
  });

  container.prepend(banner);
  return true;
}

// ---------- settings card ----------
function lastCheckText(ts) {
  if (!ts) return 'لسه ما اتفحصش';
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = today(d);
  return day === today() ? `آخر فحص: النهارده <bdi class="de">${hm}</bdi>` : `آخر فحص: <bdi class="de">${day}</bdi>`;
}

export function renderUpdateSettings(container) {
  if (!container) return null;
  const u = upd();
  const m = u.available;
  const U = updater();

  const card = el(`
  <section class="card up-settings">
    <h2 class="sec-title">التحديثات</h2>
    <p class="up-version">الإصدار <bdi class="de">${esc(versionLabel())}</bdi> <span class="muted">(<bdi class="de">${VERSION_CODE}</bdi>)</span> · البيانات <bdi class="de">v${esc(DATA.version)}</bdi></p>
    <p class="up-last muted small">${lastCheckText(u.lastCheck)}</p>
    ${m ? `
    <div class="up-inline">
      <span class="grow">تحديث <bdi class="de">${esc(versionOf(m))}</bdi> متاح</span>
      <button type="button" class="btn btn-primary up-dl">حدّث</button>
    </div>` : ''}
    <button type="button" class="btn up-check">اتحقق من تحديثات</button>
    <p class="hint up-help">${U ? 'زرار «حدّث» بينزّل التحديث ويفتح الأبلكيشن من جديد متحدّث. لو التحديث إصدار أندرويد جديد، هتظهرلك شاشة التثبيت — دوس «تحديث».' : 'التحديث ملف <bdi class="de">APK</bdi> بيتنزّل في المتصفح. افتحه وسطّبه فوق النسخة القديمة.'} كل كلماتك ونقاطك وإعداداتك بتفضل زي ما هي.</p>
    ${U && WEB_BUILD ? '<button type="button" class="btn btn-ghost up-reset">رجّع نسخة الـ APK الأصلية</button>' : ''}
  </section>`);

  const rerender = () => { const fresh = renderUpdateSettings(container); if (fresh) card.replaceWith(fresh); };

  const dl = card.querySelector('.up-dl');
  if (dl) dl.addEventListener('click', () => runUpdate(m, dl));

  const reset = card.querySelector('.up-reset');
  if (reset) reset.addEventListener('click', () => {
    if (!confirm('ترجع لنسخة الأبلكيشن اللي جوه الـ APK؟ تقدّمك مش هيتأثر.')) return;
    U.reset().catch(() => toast('مقدرتش أرجّعها'));
  });

  const btn = card.querySelector('.up-check');
  btn.addEventListener('click', async () => {
    if (navigator.onLine === false) { toast('مفيش نت — جرّب لما يبقى عندك اتصال'); return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'بفحص…';
    const before = u.lastCheck;
    const a = await checkForUpdate({ force: true });
    const ok = upd().lastCheck > before;   // الفحص وصل للسيرفر فعلاً
    if (a) {
      upd().dismissed = 0;   // المستخدم طلب الفحص بنفسه → ورّيه البانر تاني
      store.save();
      toast('في تحديث جديد — دوس «حدّث»');
    } else if (ok) {
      toast('أنت على آخر إصدار');
    } else {
      toast('مقدرت أوصل لسيرفر التحديثات — جرّب تاني بعدين');
    }
    btn.disabled = false;
    btn.textContent = label;
    rerender();
  });

  container.appendChild(card);
  return card;
}
