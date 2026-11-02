// update.js — فحص التحديثات من manifest.json (GitHub) + بانر الرئيسية + كارت الإعدادات
// الروابط الخارجية بتتفتح عن طريق native.js (Capacitor → المتصفح، الويب → تاب جديد)
import { APP_VERSION, VERSION_CODE, UPDATE_MANIFEST_URL } from './version.js';
import { DATA } from './data.js';
import { store, today } from './store.js';
import { el, esc, toast } from './ui.js';
import { openExternal } from './native.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
export const RELEASES_URL = 'https://github.com/Solo-Player1/wortschatz-app/releases';

// ---------- state ----------
// الحالة الافتراضية + هجرة للنسخ القديمة اللي مفيهاش updates
function upd() {
  const st = store.state;
  if (!st.updates || typeof st.updates !== 'object') st.updates = { lastCheck: 0, available: null, dismissed: 0 };
  const u = st.updates;
  if (!Number.isFinite(+u.lastCheck)) u.lastCheck = 0;
  if (!Number.isFinite(+u.dismissed)) u.dismissed = 0;
  if (!isNewer(u.available)) u.available = null;   // الأبلكيشن اتحدّث فعلاً → مفيش تحديث معلّق
  return u;
}

const validManifest = m => !!(m && typeof m === 'object' && Number.isFinite(+m.versionCode) && typeof m.apk === 'string' && m.apk);
export const isNewer = m => !!(m && Number.isFinite(+m.versionCode) && +m.versionCode > VERSION_CODE);

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
    store.save();
    console.info('[update] checked: latest versionCode', m.versionCode, u.available ? '(update available)' : '(up to date)');
    return u.available;
  } catch (e) {
    console.info('[update] check skipped:', e && e.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- home banner ----------
// بيحط البانر أعلى المحتوى. بيرجّع true لو اترسم.
export function renderUpdateBanner(container) {
  if (!container) return false;
  const u = upd();
  const m = u.available;
  if (!m || u.dismissed === m.versionCode) return false;

  const banner = el(`
  <section class="card up-banner" role="status" aria-label="تحديث متاح">
    <div class="up-head">
      <span class="up-ico" aria-hidden="true">🆕</span>
      <div class="grow">
        <h2 class="up-title">إصدار جديد <bdi class="de up-ver">${esc(m.version || '')}</bdi></h2>
        ${m.notes ? `<p class="up-notes">${esc(m.notes)}</p>` : ''}
        ${m.date ? `<p class="up-date muted small">نزل يوم <bdi class="de">${esc(m.date)}</bdi></p>` : ''}
      </div>
    </div>
    <div class="up-actions">
      <button type="button" class="btn btn-primary up-dl">نزّل التحديث</button>
      <button type="button" class="btn btn-ghost up-later">لاحقاً</button>
    </div>
  </section>`);

  banner.querySelector('.up-dl').addEventListener('click', () => {
    openExternal(m.apk);
    toast('الملف بيتنزّل في المتصفح — افتحه لما يخلص وسطّبه');
  });
  banner.querySelector('.up-later').addEventListener('click', () => {
    u.dismissed = m.versionCode;
    store.save();
    banner.classList.add('up-out');
    setTimeout(() => banner.remove(), 200);
    toast('ماشي، هفكرك لما يطلع إصدار أجدد');
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

  const card = el(`
  <section class="card up-settings">
    <h2 class="sec-title">التحديثات</h2>
    <p class="up-version">الإصدار <bdi class="de">${esc(APP_VERSION)}</bdi> <span class="muted">(<bdi class="de">${VERSION_CODE}</bdi>)</span> · البيانات <bdi class="de">v${esc(DATA.version)}</bdi></p>
    <p class="up-last muted small">${lastCheckText(u.lastCheck)}</p>
    ${m ? `
    <div class="up-inline">
      <span class="grow">الإصدار <bdi class="de">${esc(m.version || '')}</bdi> متاح</span>
      <button type="button" class="btn btn-primary up-dl">نزّل</button>
    </div>` : ''}
    <div class="grid2 up-settings-actions">
      <button type="button" class="btn up-check">اتحقق من تحديثات</button>
      <button type="button" class="btn up-releases">صفحة التحديثات</button>
    </div>
    <p class="hint up-help">التحديث ملف <bdi class="de">APK</bdi> بيتنزّل في المتصفح. افتحه وسطّبه فوق النسخة القديمة — كل كلماتك ونقاطك وإعداداتك بتفضل زي ما هي.</p>
  </section>`);

  const rerender = () => { const fresh = renderUpdateSettings(container); if (fresh) card.replaceWith(fresh); };

  const dl = card.querySelector('.up-dl');
  if (dl) dl.addEventListener('click', () => { openExternal(m.apk); toast('الملف بيتنزّل في المتصفح — افتحه لما يخلص وسطّبه'); });

  card.querySelector('.up-releases').addEventListener('click', () => openExternal(RELEASES_URL));

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
      toast('في إصدار جديد! شوف الرئيسية');
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
