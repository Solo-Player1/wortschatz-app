#!/usr/bin/env python3
"""Download the official German episode subtitles (WebVTT) of Nicos Weg lessons into www/data/subs/L<n>.vtt.

The subtitle link comes from the cached DW lesson page (tools/cache/L<id>.html, written by extract_dw.py):
window.__APOLLO_STATE__ -> Video (the plain one) -> subtitles[].subtitleUrl  (https://www.dw.com/media/subtitles/<id>)

Usage (from the project root):
  python tools/fetch_subs.py 16-77        # lessons 16..77 (skips files that already exist)
  python tools/fetch_subs.py 16 17 --force
Sequential with a short pause: DW answers 503 to parallel bursts.
"""
import io, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', 'cache')
SUBS = os.path.join(ROOT, 'www', 'data', 'subs')
LESSONS = os.path.join(ROOT, 'www', 'data', 'lessons.json')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'


def parse_args(argv):
    ns, force = set(), '--force' in argv
    for a in argv:
        if a.startswith('--'):
            continue
        m = re.match(r'^(\d+)-(\d+)$', a)
        if m:
            ns.update(range(int(m.group(1)), int(m.group(2)) + 1))
        elif a.isdigit():
            ns.add(int(a))
    return sorted(ns), force


def subtitle_url(html):
    m = re.search(r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\});\s*', html, re.S)
    if not m:
        return None
    d = json.loads(m.group(1))
    vids = [v for v in d.values() if isinstance(v, dict) and v.get('__typename') == 'Video']
    # prefer the plain video (the "mit Untertiteln" one has burnt-in subs and no subtitle track)
    vids.sort(key=lambda v: ('Untertiteln' in (v.get('name') or '')))
    for v in vids:
        for s in v.get('subtitles') or []:
            if s.get('subtitleUrl') and (s.get('srcLanguage') in (None, 'de') or s.get('language') == 'GERMAN'):
                return s['subtitleUrl']
    return None


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8', 'replace')


def main():
    ns, force = parse_args(sys.argv[1:])
    if not ns:
        print(__doc__)
        sys.exit(1)
    os.makedirs(SUBS, exist_ok=True)
    lessons = {l['n']: l for l in json.load(io.open(LESSONS, encoding='utf-8'))['lessons']}
    ok = miss = 0
    for n in ns:
        L = lessons.get(n)
        if not L:
            print(f'lesson {n}: not in lessons.json'); miss += 1; continue
        out = os.path.join(SUBS, f'L{n}.vtt')
        if os.path.exists(out) and not force:
            print(f'lesson {n}: exists'); ok += 1; continue
        page = os.path.join(CACHE, f'L{L["id"]}.html')
        if not os.path.exists(page):
            print(f'lesson {n}: no cached page {os.path.basename(page)} (run extract_dw.py first)'); miss += 1; continue
        url = subtitle_url(io.open(page, encoding='utf-8').read())
        if not url:
            print(f'lesson {n}: no subtitle link on the page'); miss += 1; continue
        try:
            vtt = fetch(url)
        except Exception as e:
            print(f'lesson {n}: download failed ({e})'); miss += 1; time.sleep(2); continue
        if 'WEBVTT' not in vtt[:200]:
            print(f'lesson {n}: not a WebVTT file ({vtt[:60]!r})'); miss += 1; continue
        io.open(out, 'w', encoding='utf-8', newline='\n').write(vtt)
        cues = vtt.count('-->')
        print(f'lesson {n}: {cues} cues -> {os.path.relpath(out, ROOT)}')
        ok += 1
        time.sleep(0.8)
    print(f'done: {ok} ok, {miss} missing')


if __name__ == '__main__':
    main()
