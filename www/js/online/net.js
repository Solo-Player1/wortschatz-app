// online/net.js — الاتصال ببوّابة اللعب (WebSocket). البوّابة بتوصّل تليفونين في غرفة بس:
// بتبعت رسايلنا لبعض ومش بتخزّن ولا بتقرا أي حاجة. كل بيانات اللعبة (الأسئلة، النقط) بتتبني عندنا على
// التليفون وبتتبعت كـ blob الطرف التاني بيفكّه — البوّابة بتمرّره زي ما هو.
import { store } from '../store.js';
import { UPDATE_MANIFEST_URL } from '../version.js';

// عنوان السيرفر: يدوي من الإعدادات، وإلا اللي جه من ملف التحديثات على GitHub، وإلا نجيبه مرة
export async function serverUrl() {
  const manual = (store.state.settings && store.state.settings.wsUrl || '').trim();
  if (manual) return normalize(manual);
  const cached = store.state.updates && store.state.updates.wsUrl;
  if (cached) return normalize(cached);
  try {
    const sep = UPDATE_MANIFEST_URL.includes('?') ? '&' : '?';
    const r = await fetch(`${UPDATE_MANIFEST_URL}${sep}t=${Date.now()}`, { cache: 'no-store' });
    const m = await r.json();
    if (m && typeof m.wsUrl === 'string' && m.wsUrl) {
      (store.state.updates ||= {}).wsUrl = m.wsUrl;
      store.save();
      return normalize(m.wsUrl);
    }
  } catch (e) { /* مفيش نت أو مفيش عنوان */ }
  return '';
}
function normalize(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^wss?:\/\//i.test(u)) return u;
  if (/^https:\/\//i.test(u)) return 'wss://' + u.slice(8);
  if (/^http:\/\//i.test(u)) return 'ws://' + u.slice(7);
  return 'wss://' + u.replace(/^\/+/, '');
}

export function hasServer() {
  const manual = (store.state.settings && store.state.settings.wsUrl || '').trim();
  return !!(manual || (store.state.updates && store.state.updates.wsUrl));
}

// جلسة اتصال واحدة: host(game,pool) أو join(code)، send(d)، أحداث عن طريق on(type, fn)
export function connect() {
  let ws = null, url = '', closed = false, pingT = null;
  const handlers = {};   // type -> Set<fn>
  const on = (type, fn) => { (handlers[type] ||= new Set()).add(fn); return () => handlers[type] && handlers[type].delete(fn); };
  const emit = (type, data) => { (handlers[type] || []).forEach(fn => { try { fn(data); } catch (e) { console.warn('[net]', e); } }); (handlers['*'] || []).forEach(fn => { try { fn(type, data); } catch (e) { /* ignore */ } }); };
  const raw = o => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) { /* ignore */ } };

  const api = {
    on,
    get ready() { return ws && ws.readyState === 1; },
    send(d) { raw({ t: 'game', d }); },                 // بيانات اللعبة (opaque للسيرفر)
    host(game, pool, name) { api._intent = { k: 'host', game, pool, name }; return api._open(); },
    join(code, name) { api._intent = { k: 'join', code: String(code || '').trim().toUpperCase(), name }; return api._open(); },
    bye() { raw({ t: 'bye' }); api.close(); },
    close() { closed = true; if (pingT) clearInterval(pingT); try { ws && ws.close(); } catch (e) { /* ignore */ } },

    async _open() {
      url = await serverUrl();
      if (!url) { emit('status', 'noserver'); return api; }
      emit('status', 'connecting');
      try { ws = new WebSocket(url); } catch (e) { emit('status', 'error'); return api; }
      ws.addEventListener('open', () => {
        emit('status', 'online');
        const i = api._intent;
        if (i && i.k === 'host') raw({ t: 'host', game: i.game, pool: i.pool, name: i.name });
        else if (i && i.k === 'join') raw({ t: 'join', code: i.code, name: i.name });
        pingT = setInterval(() => raw({ t: 'ping' }), 20000);
      });
      ws.addEventListener('message', e => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (!m || !m.t) return;
        if (m.t === 'pong') return;
        if (m.t === 'game') emit('game', m.d);          // بيانات الطرف التاني
        else emit(m.t, m);                              // room / joined / peer / peerLeft / err
      });
      ws.addEventListener('close', () => { if (pingT) clearInterval(pingT); emit('status', closed ? 'closed' : 'dropped'); });
      ws.addEventListener('error', () => emit('status', 'error'));
      return api;
    },
  };
  return api;
}
