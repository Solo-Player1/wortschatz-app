// In-app update flow with a mocked native Updater plugin + mocked manifest (web update and APK update).
import { launch } from './cdp.mjs';
const URL = 'http://127.0.0.1:8131/index.html';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
const run = async (manifest, port) => {
  const p = await launch({ port, width: 390, height: 844 });
  await p.addInit(`(() => {
    window.__u = { calls: [], listeners: {} };
    const realFetch = window.fetch.bind(window);
    window.fetch = (u, o) => String(u).includes('raw.githubusercontent.com') ? Promise.resolve(new Response(JSON.stringify(${JSON.stringify(manifest)}), { status: 200 })) : realFetch(u, o);
    window.Capacitor = { isNativePlatform: () => true, convertFileSrc: u => u, Plugins: { Updater: {
      addListener: (ev, fn) => { window.__u.listeners[ev] = fn; return Promise.resolve({ remove() {} }); },
      applyWeb: o => { window.__u.calls.push(['applyWeb', o]); window.__u.listeners.progress && window.__u.listeners.progress({ kind: 'web', pct: 50 }); return new Promise(() => {}); },
      installApk: o => { window.__u.calls.push(['installApk', o]); return Promise.resolve(); },
      ready: () => { window.__u.calls.push(['ready']); return Promise.resolve(); },
      reset: () => Promise.resolve(),
    } } };
  })();`);
  await p.goto(URL + '#/home', 2500);
  await p.evaluate(`localStorage.removeItem('ws:v1')`);
  await p.goto(URL + '#/home', 4000);
  const r = await p.evaluate(`(async () => {
    const b = document.querySelector('.up-banner');
    const out = { banner: !!b, text: b ? b.innerText.replace(/\s+/g, ' ').slice(0, 200) : '', readyCalled: window.__u.calls.some(c => c[0] === 'ready') };
    if (b) { b.querySelector('.up-dl').click(); await new Promise(r => setTimeout(r, 300)); out.btn = b.querySelector('.up-dl').textContent; }
    out.calls = window.__u.calls.filter(c => c[0] !== 'ready');
    const { store } = await import('./js/store.js'); out.applied = store.state.updates.applied || 0;
    return out;
  })()`);
  const errs = p.errors.filter(e => !/githubusercontent/.test(e));
  await p.close();
  return { r, errs };
};
const web = { version: '1.1.0', versionCode: 2, apk: 'https://x/v1.1.0.apk', web: { build: 1, version: '1.1.0 · تحديث 1', zip: 'https://x/www-1.zip', sha256: 'abc', size: 10, minVersionCode: 2, notes: 'تجربة' } };
let a = await run(web, 9495);
check('web update: banner + «حدّث دلوقتي» → applyWeb(url, sha256, build) with progress', a.r.banner && /في الأبلكيشن|جوه الأبلكيشن/.test(a.r.text) && a.r.calls.length === 1 && a.r.calls[0][0] === 'applyWeb' && a.r.calls[0][1].build === 1 && a.r.calls[0][1].url === 'https://x/www-1.zip' && /50%|بيتحدّث/.test(a.r.btn) && a.r.applied === 1, JSON.stringify(a.r));
check('boot reports ready() to the native side', a.r.readyCalled, '');
check('web update: no console errors', a.errs.length === 0, a.errs.join(' | ').slice(0, 300));
const apk = { version: '1.2.0', versionCode: 3, apk: 'https://x/v1.2.0.apk' };
a = await run(apk, 9496);
check('APK update: «حدّث دلوقتي» → installApk(url)', a.r.banner && a.r.calls.length === 1 && a.r.calls[0][0] === 'installApk' && a.r.calls[0][1].url === 'https://x/v1.2.0.apk', JSON.stringify(a.r));
const none = { version: '1.1.0', versionCode: 2, apk: 'https://x/v1.1.0.apk', web: { build: 0, zip: 'https://x/www-0.zip', minVersionCode: 2 } };
a = await run(none, 9497);
check('up to date: no banner', !a.r.banner, JSON.stringify(a.r));
console.log(results.join('\n'));
console.log(results.every(x => x.startsWith('PASS')) ? 'ALL PASS' : 'SOME FAILED');
