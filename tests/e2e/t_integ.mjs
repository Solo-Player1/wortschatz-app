// Integration smoke test: video + update wired into home / lesson / settings, web and mocked-native modes.
import { launch } from './cdp.mjs';
import path from 'node:path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'shots');
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8131/index.html';
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const noise = e => /raw\.githubusercontent|404 \(Not Found\)|tv-download\.dw\.com/i.test(e);

const NATIVE_MOCK = `
(() => {
  const files = {};
  const listeners = [];
  window.Capacitor = {
    isNativePlatform: () => true,
    convertFileSrc: u => 'https://localhost/_capacitor_file_' + u.replace('file://', ''),
    Plugins: {
      Filesystem: {
        mkdir: async () => ({}),
        getUri: async ({ path }) => ({ uri: 'file:///data/user/0/app/files/' + path }),
        stat: async ({ path }) => { if (!(path in files)) throw new Error('File does not exist'); return { size: files[path], uri: 'file:///data/user/0/app/files/' + path, type: 'file' }; },
        deleteFile: async ({ path }) => { if (!(path in files)) throw new Error('File does not exist'); delete files[path]; },
        readdir: async () => ({ files: Object.keys(files).map(p => ({ name: p.split('/').pop(), size: files[p], type: 'file', uri: 'file:///data/user/0/app/files/' + p })) }),
      },
      FileTransfer: {
        addListener: async (ev, fn) => { listeners.push(fn); return { remove: async () => { listeners.splice(listeners.indexOf(fn), 1); } }; },
        downloadFile: async ({ url, path }) => {
          const r = window.__videosJson.videos.find(v => v.video.url === url); const total = r.video.bytes;
          for (let i = 1; i <= 4; i++) { await new Promise(r => setTimeout(r, 40)); listeners.forEach(f => f({ type: 'download', url, bytes: total * i / 4, contentLength: total, lengthComputable: true })); }
          files[path.replace('file:///data/user/0/app/files/', '')] = total; return { path };
        },
      },
    },
  };
})();`;

async function run(mode, dark) {
  const p = await launch({ port: mode === 'web' ? 9341 : 9342, dark });
  if (mode === 'native') {
    await p.addInit(`window.__videosJson = null; fetch('data/videos.json').then(r=>r.json()).then(j=>window.__videosJson=j);` + NATIVE_MOCK);
  }
  // fake pending update, already checked (no network)
  await p.addInit(`try{ if(!localStorage.getItem('ws:v1')) localStorage.setItem('ws:v1', JSON.stringify({version:1, settings:{theme:'${dark ? 'dark' : 'light'}'}, progress:{}, days:{}, streak:{current:0,best:0,lastDay:''}, xp:0, lastSession:null, updates:{lastCheck:Date.now(), available:{version:'1.1.0',versionCode:2,apk:'https://example.com/a.apk',notes:'تجربة بانر التحديث',date:'2026-11-02'}, dismissed:0}})); }catch(e){}`);
  await p.goto(BASE + '#/home', 2000);
  const tag = `${mode}-${dark ? 'dark' : 'light'}`;
  const home = await p.evaluate(`({banner: !!document.querySelector('.up-banner'), teaser: !!document.querySelector('.vd-teaser.compact'), ow: document.documentElement.scrollWidth - innerWidth})`);
  check(`${tag} home: update banner`, home.banner);
  check(`${tag} home: video teaser`, home.teaser);
  check(`${tag} home: no h-overflow`, home.ow <= 0, 'overflow=' + home.ow);
  await p.shot(path.join(OUT, `home-${tag}.png`));

  await p.hash('#/lesson/3', 900);
  const les = await p.evaluate(`({teaser: !!document.querySelector('.vd-teaser:not(.compact)'), href: document.querySelector('.vd-teaser')?.getAttribute('href'), ow: document.documentElement.scrollWidth - innerWidth})`);
  check(`${tag} lesson: teaser → #/video/3`, les.teaser && les.href === '#/video/3', JSON.stringify(les));
  await p.shot(path.join(OUT, `lesson-${tag}.png`));

  await p.hash('#/video/3', 1500);
  const vid = await p.evaluate(`(() => { const v=document.querySelector('video.vd-video'); return {v: !!v, src: v&&v.getAttribute('src'), poster: v&&v.getAttribute('poster'), track: !!(v&&v.querySelector('track')), immersive: document.body.classList.contains('immersive'), dl: !!document.querySelector('[data-act=download]'), ow: document.documentElement.scrollWidth - innerWidth}; })()`);
  check(`${tag} video: element + track + poster`, vid.v && vid.track && /L3\.webp/.test(vid.poster || ''), JSON.stringify(vid));
  check(`${tag} video: immersive`, vid.immersive);
  check(`${tag} video: download button only native`, mode === 'native' ? vid.dl : !vid.dl);
  check(`${tag} video: no h-overflow`, vid.ow <= 0, 'overflow=' + vid.ow);
  await p.shot(path.join(OUT, `video-${tag}.png`));

  if (mode === 'native') {
    await p.evaluate(`document.querySelector('[data-act=download]').click()`);
    await p.sleep(900);
    const after = await p.evaluate(`({saved: !!JSON.parse(localStorage.getItem('ws:v1')).videos?.[3], src: document.querySelector('video.vd-video')?.getAttribute('src'), del: !!document.querySelector('[data-act=delete]')})`);
    check(`${tag} video: download saves + switches to local src`, after.saved && after.del && /_capacitor_file_/.test(after.src || ''), JSON.stringify(after));
    await p.shot(path.join(OUT, `video-saved-${tag}.png`));
  }

  await p.hash('#/settings', 1000);
  const set = await p.evaluate(`({vd: document.querySelector('#videoSettings')?.textContent.trim().slice(0,80), up: !!document.querySelector('.up-settings'), ver: document.querySelector('.up-version')?.textContent.trim(), all: !!document.querySelector('[data-act=all]'), ow: document.documentElement.scrollWidth - innerWidth})`);
  check(`${tag} settings: video section`, !!set.vd && (mode === 'native' ? set.all : true), JSON.stringify(set));
  check(`${tag} settings: update card`, set.up && /1\.0\.0/.test(set.ver || ''), set.ver);
  check(`${tag} settings: no h-overflow`, set.ow <= 0, 'overflow=' + set.ow);
  await p.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
  await p.shot(path.join(OUT, `settings-${tag}.png`));

  // backup export should not carry device-only keys
  const exp = await p.evaluate(`import('./js/store.js').then(m => { const j = JSON.parse(m.store.exportJSON()); return {videos: 'videos' in j.state, updates: 'updates' in j.state}; })`);
  check(`${tag} backup excludes videos/updates`, !exp.videos && !exp.updates, JSON.stringify(exp));

  const errs = p.errors.filter(e => !noise(e));
  check(`${tag} zero console errors`, errs.length === 0, errs.join(' | ').slice(0, 600));
  await p.close();
}

await run('web', false);
await run('native', true);
console.log(results.join('\n'));
console.log(results.some(r => r.startsWith('FAIL')) ? 'SOME FAILED' : 'ALL PASS');
