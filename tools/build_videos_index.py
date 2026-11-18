#!/usr/bin/env python3
"""Extend tools/videos_index.json with the episode videos of more Nicos Weg lessons (from the cached DW pages).

  python tools/build_videos_index.py 16-76             # lessons not yet in the index (HEAD-checks every mp4)
  python tools/build_videos_index.py 16 17 --force     # rebuild these entries
  python tools/build_videos_index.py 16-76 --posters   # + download the 480x270 poster to www/img/posters/L<n>.webp

Video objects come from window.__APOLLO_STATE__ of tools/cache/L<id>.html (written by extract_dw.py): the plain
episode (it carries the German subtitle track) and the "(mit Untertiteln)" one (burnt-in subtitles). The mp4
renditions are derived from the HLS master URL (…/i/<base>,sd,hd,.mp4.csmil/master.m3u8 → tv-download.dw.com/<base>sd.mp4)
and checked with HEAD — sequentially with a pause, because DW answers 503 to bursts.
Afterwards run:  python tools/fetch_videos.py   (writes www/data/videos.json, attaching data/subs/L<n>.vtt if present)
"""
import io, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', 'cache')
IDX = os.path.join(ROOT, 'tools', 'videos_index.json')
POSTERS = os.path.join(ROOT, 'www', 'img', 'posters')
LESSONS = os.path.join(ROOT, 'www', 'data', 'lessons.json')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
HLS = re.compile(r'^https?://hlsvod\.dw\.com/i/(?P<base>[^,]+),(?P<r>[^.]+?),?\.mp4\.csmil/master\.m3u8$')
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def parse_args(argv):
    ns = set()
    for a in argv:
        if a.startswith('--'):
            continue
        m = re.match(r'^(\d+)-(\d+)$', a)
        if m:
            ns.update(range(int(m.group(1)), int(m.group(2)) + 1))
        elif a.isdigit():
            ns.add(int(a))
    return sorted(ns)


def head(url, tries=2):
    for k in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA, method='HEAD'), timeout=40)
            n = int(r.headers.get('Content-Length') or 0)
            return {'url': url, 'bytes': n, 'ok': r.status == 200 and n > 10000}
        except urllib.error.HTTPError as e:
            if e.code == 503 and k + 1 < tries:
                time.sleep(3); continue
            return {'url': url, 'bytes': 0, 'ok': False}
        except Exception:
            if k + 1 < tries:
                time.sleep(2); continue
            return {'url': url, 'bytes': 0, 'ok': False}
        finally:
            time.sleep(0.35)


def video_entry(v):
    m = HLS.match(v.get('hlsVideoSrc') or '')
    files = {}
    if m:
        for r in [x for x in m.group('r').split(',') if x]:
            files[r] = head(f'https://tv-download.dw.com/{m.group("base")}{r}.mp4')
    e = {'id': v.get('id'), 'name': v.get('name'), 'duration': v.get('duration'), 'poster': v.get('posterImageUrl'),
         'hls': v.get('hlsVideoSrc'), 'files': files}
    subs = [s.get('subtitleUrl') for s in (v.get('subtitles') or []) if s.get('subtitleUrl')]
    if subs:
        e['subtitles'] = subs[0]
    return e


def page_videos(page):
    s = io.open(page, encoding='utf-8').read()
    m = re.search(r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\});\s*', s, re.S)
    if not m:
        return None, None
    d = json.loads(m.group(1))
    vids = [v for v in d.values() if isinstance(v, dict) and v.get('__typename') == 'Video']
    plain = next((v for v in vids if 'Untertiteln' not in (v.get('name') or '')), None)
    sub = next((v for v in vids if 'Untertiteln' in (v.get('name') or '')), None)
    return plain, sub


def fetch_poster(url, out):
    url = re.sub(r'_\d+\.(webp|jpg|png)$', '_302.webp', url or '')
    if not url:
        return False
    try:
        data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
        if len(data) < 2000:
            return False
        io.open(out, 'wb').write(data)
        return True
    except Exception:
        return False
    finally:
        time.sleep(0.35)


def main():
    ns = parse_args(sys.argv[1:])
    force, posters = '--force' in sys.argv, '--posters' in sys.argv
    if not ns:
        print(__doc__); sys.exit(1)
    lessons = {l['n']: l for l in json.load(io.open(LESSONS, encoding='utf-8'))['lessons']}
    idx = {e['n']: e for e in (json.load(io.open(IDX, encoding='utf-8')) if os.path.exists(IDX) else [])}
    os.makedirs(POSTERS, exist_ok=True)
    added = 0
    for n in ns:
        L = lessons.get(n)
        if not L:
            print(f'lesson {n}: not in lessons.json'); continue
        page = os.path.join(CACHE, f'L{L["id"]}.html')
        if not os.path.exists(page):
            print(f'lesson {n}: no cached page (run extract_dw.py {n})'); continue
        plain, sub = page_videos(page)
        if n not in idx or force:
            if not plain and not sub:
                print(f'lesson {n}: no video on the page'); continue
            e = {'n': n}
            if plain:
                e['plain'] = video_entry(plain)
            if sub:
                e['sub'] = video_entry(sub)
            idx[n] = e
            added += 1
            okp = [r for r, f in (e.get('plain', {}).get('files') or {}).items() if f['ok']]
            oks = [r for r, f in (e.get('sub', {}).get('files') or {}).items() if f['ok']]
            print(f'lesson {n}: plain ok {okp or "-"} | sub ok {oks or "-"}')
            tmp = IDX + '.tmp'
            io.open(tmp, 'w', encoding='utf-8').write(json.dumps([idx[k] for k in sorted(idx)], ensure_ascii=False, indent=1))
            os.replace(tmp, IDX)
        if posters:
            out = os.path.join(POSTERS, f'L{n}.webp')
            if not os.path.exists(out):
                src = (plain or sub or {}).get('posterImageUrl')
                print(f'  poster L{n}: {"ok" if fetch_poster(src, out) else "FAILED"}')
    print(f'done: {added} entries added/updated, index has {len(idx)} lessons')


if __name__ == '__main__':
    main()
