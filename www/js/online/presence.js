// online/presence.js — اتصال «دافئ» بالسيرفر في اللوبي: يفتح WebSocket، يقيس البنج (ping) كل 4 ثواني،
// ويقول حالة الاتصال عشان نوري مؤشر زي الألعاب الكبيرة. مش بيدخل غرفة — بس بيطمّن إن السيرفر جاهز.
import { serverUrl } from './net.js';

let ws = null, timer = null, retryT = null, pingAt = 0, backoffN = 0, want = false;
let state = { status: 'idle', ms: 0 };     // status: idle|connecting|online|weak|noserver|dropped
const subs = new Set();

function set(p) { state = { ...state, ...p }; subs.forEach(fn => { try { fn(state); } catch (e) { /* ignore */ } }); }
function qualityOf(ms) { return ms < 120 ? 'online' : ms < 300 ? 'online' : 'weak'; }

async function open() {
  if (!want) return;
  const url = await serverUrl();
  if (!want) return;
  if (!url) { set({ status: 'noserver', ms: 0 }); scheduleRetry(); return; }
  if (state.status !== 'online') set({ status: 'connecting' });
  try { ws = new WebSocket(url); } catch (e) { scheduleRetry(); return; }
  ws.addEventListener('open', () => { backoffN = 0; tick(); if (timer) clearInterval(timer); timer = setInterval(tick, 4000); });
  ws.addEventListener('message', e => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m && m.t === 'pong' && pingAt) { const ms = Date.now() - pingAt; set({ status: qualityOf(ms), ms }); }
  });
  ws.addEventListener('close', () => { if (timer) { clearInterval(timer); timer = null; } if (want) { set({ status: 'connecting' }); scheduleRetry(); } });
  ws.addEventListener('error', () => { /* close يتبعها */ });
}
function tick() { if (ws && ws.readyState === 1) { pingAt = Date.now(); try { ws.send('{"t":"ping"}'); } catch (e) { /* ignore */ } } }
function scheduleRetry() { if (!want) return; if (retryT) clearTimeout(retryT); retryT = setTimeout(open, Math.min(6000, 800 + backoffN++ * 800)); }

export function startPresence() { if (want) return; want = true; backoffN = 0; set({ status: 'connecting' }); open(); }
export function stopPresence() {
  want = false;
  if (timer) { clearInterval(timer); timer = null; }
  if (retryT) { clearTimeout(retryT); retryT = null; }
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  ws = null; set({ status: 'idle', ms: 0 });
}
export function onPresence(fn) { subs.add(fn); try { fn(state); } catch (e) { /* ignore */ } return () => subs.delete(fn); }
