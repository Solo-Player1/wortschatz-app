// online/net.js — الاتصال ببوّابة اللعب (WebSocket). البوّابة بتوصّل تليفونين في غرفة بس:
// بتبعت رسايلنا لبعض ومش بتخزّن ولا بتقرا أي حاجة. كل بيانات اللعبة (الأسئلة، النقط) بتتبني عندنا على
// التليفون وبتتبعت كـ blob الطرف التاني بيفكّه — البوّابة بتمرّره زي ما هو.
import { store } from '../store.js';
import { UPDATE_MANIFEST_URL } from '../version.js';

// ملف صغير على GitHub بيكتب فيه السيرفر عنوانه الحالي لوحده (بيتحدّث مع كل تشغيل)
const ONLINE_JSON_URL = UPDATE_MANIFEST_URL.replace(/manifest\.json.*$/, 'online.json');
let fetched = { at: 0, url: '' };   // كاش بسيط للجلسة

// عنوان السيرفر: يدوي من الإعدادات أولاً، وإلا من online.json (الأحدث)، وإلا المحفوظ، وإلا المانيفست
export async function serverUrl() {
  const manual = (store.state.settings && store.state.settings.wsUrl || '').trim();
  if (manual) return normalize(manual);
  // online.json كل دقيقة بحد أقصى (العنوان بيتغيّر مع التونل المجاني)
  if (Date.now() - fetched.at > 60000) {
    const u = await grabJson(ONLINE_JSON_URL) || await grabJson(UPDATE_MANIFEST_URL);
    fetched = { at: Date.now(), url: u || fetched.url };
    if (u) { (store.state.updates ||= {}).wsUrl = u; store.save(); }
  }
  if (fetched.url) return normalize(fetched.url);
  const cached = store.state.updates && store.state.updates.wsUrl;
  return cached ? normalize(cached) : '';
}
async function grabJson(base) {
  try {
    const sep = base.includes('?') ? '&' : '?';
    const r = await fetch(`${base}${sep}t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return '';
    const m = await r.json();
    return m && typeof m.wsUrl === 'string' && m.wsUrl ? m.wsUrl : '';
  } catch (e) { return ''; }
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
  let sid = '', code = '', intentCode = '';          // حالة إعادة الاتصال
  let reconnecting = false, attempts = 0, giveUpT = null, retryT = null;
  let lastPingAt = 0, rtt = 0;
  const handlers = {};   // type -> Set<fn>
  const on = (type, fn) => { (handlers[type] ||= new Set()).add(fn); return () => handlers[type] && handlers[type].delete(fn); };
  const emit = (type, data) => { (handlers[type] || []).forEach(fn => { try { fn(data); } catch (e) { console.warn('[net]', e); } }); (handlers['*'] || []).forEach(fn => { try { fn(type, data); } catch (e) { /* ignore */ } }); };
  const raw = o => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) { /* ignore */ } };
  const clearPing = () => { if (pingT) clearInterval(pingT); pingT = null; };
  const backoff = () => Math.min(5000, 400 + attempts * 600);

  function endReconnect(ok) {
    reconnecting = false;
    if (giveUpT) { clearTimeout(giveUpT); giveUpT = null; }
    if (retryT) { clearTimeout(retryT); retryT = null; }
    if (!ok && !closed) emit('status', 'dropped');
  }
  function beginReconnect() {
    if (closed || reconnecting) return;
    reconnecting = true; attempts = 0;
    emit('status', 'reconnecting');
    giveUpT = setTimeout(() => endReconnect(false), 44000);   // يطابق مهلة السماح في السيرفر
    attemptReconnect();
  }
  function attemptReconnect() { if (closed || !reconnecting) return; attempts++; api._open(true); }

  const api = {
    on,
    get ready() { return ws && ws.readyState === 1; },
    get ping() { return rtt; },                         // آخر زمن ردّ (مللي ثانية)
    send(d) { raw({ t: 'game', d }); },                 // بيانات اللعبة (opaque للسيرفر)
    host(game, pool, name) { api._intent = { k: 'host', game, pool, name }; return api._open(); },
    join(c, name) { intentCode = String(c || '').trim().toUpperCase(); api._intent = { k: 'join', code: intentCode, name }; return api._open(); },
    bye() { closed = true; raw({ t: 'bye' }); api.close(); },
    close() { closed = true; endReconnect(true); clearPing(); try { ws && ws.close(); } catch (e) { /* ignore */ } },

    async _open(isReconnect) {
      if (!url || !isReconnect) url = await serverUrl();
      if (!url) { emit('status', 'noserver'); return api; }
      emit('status', isReconnect ? 'reconnecting' : 'connecting');
      try { ws = new WebSocket(url); } catch (e) {
        if (isReconnect) { retryT = setTimeout(attemptReconnect, backoff()); return api; }
        emit('status', 'error'); return api;
      }
      ws.addEventListener('open', () => {
        if (reconnecting && sid && code) { raw({ t: 'rejoin', code, sid }); }   // نرجع لنفس الغرفة
        else {
          const i = api._intent;
          if (i && i.k === 'host') raw({ t: 'host', game: i.game, pool: i.pool, name: i.name });
          else if (i && i.k === 'join') raw({ t: 'join', code: i.code, name: i.name });
        }
        clearPing();
        pingT = setInterval(() => { lastPingAt = Date.now(); raw({ t: 'ping' }); }, 4000);
        lastPingAt = Date.now(); raw({ t: 'ping' });
        if (!reconnecting) emit('status', 'online');
      });
      ws.addEventListener('message', e => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (!m || !m.t) return;
        if (m.t === 'pong') { if (lastPingAt) { rtt = Date.now() - lastPingAt; emit('rtt', rtt); } return; }
        if (m.t === 'room') { code = m.code; if (m.sid) sid = m.sid; }
        else if (m.t === 'joined') { code = intentCode || code; if (m.sid) sid = m.sid; }
        else if (m.t === 'rejoined') { endReconnect(true); emit('status', 'online'); emit('resumed', m); return; }
        else if (m.t === 'err' && reconnecting && m.code === 'gone') { endReconnect(false); return; }
        if (m.t === 'game') emit('game', m.d);          // بيانات الطرف التاني
        else emit(m.t, m);                              // room/joined/peer/peerAway/peerBack/peerLeft/err
      });
      ws.addEventListener('close', () => {
        clearPing();
        if (closed) { emit('status', 'closed'); return; }
        if (reconnecting) { retryT = setTimeout(attemptReconnect, backoff()); return; }
        if (sid && code) { beginReconnect(); return; }   // كنا في غرفة → نحاول نرجع
        emit('status', 'dropped');
      });
      ws.addEventListener('error', () => { /* 'close' هييجي بعدها */ });
      return api;
    },
  };
  return api;
}
