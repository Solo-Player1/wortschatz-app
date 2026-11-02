#!/usr/bin/env python3
"""Build www/data/videos.json (lesson videos of Nicos Weg, served from DW's own download server).

Usage:
  python tools/fetch_videos.py            # writes www/data/videos.json from tools/videos_index.json
  python tools/fetch_videos.py --download # also downloads the chosen files into tools/videos/ (local testing only)

videos_index.json is produced from the DW lesson pages (Video objects in window.__APOLLO_STATE__); every lesson has
two videos: "plain" (no subtitles) and "sub" (burnt-in German subtitles). Each has several mp4 renditions.
The app streams them (or caches them on the phone with FileTransfer); nothing is bundled into the APK.
"""
import json, os, sys, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'tools', 'videos_index.json')
OUT = os.path.join(ROOT, 'www', 'data', 'videos.json')
# preferred renditions, first available wins (phone screens: 360p is plenty, ~5 MB per video)
PREF_SUB = ['AVC_640x360', 'AVC_512x288', 'AVC_960x540', 'AVC_480x270']
PREF_PLAIN = ['sd', 'AVC_640x360', 'AVC_512x288', 'AVC_960x540', 'hd']

def pick(files, prefs):
    for r in prefs:
        f = files.get(r)
        if f and f.get('ok') and f.get('bytes'):
            return {'url': f['url'], 'bytes': f['bytes'], 'q': r}
    return None

def main():
    idx = json.load(open(IDX, encoding='utf-8'))
    out = []
    for L in idx:
        n = L['n']
        sub = pick(L['sub']['files'], PREF_SUB) if 'sub' in L else None
        plain = pick(L['plain']['files'], PREF_PLAIN) if 'plain' in L else None
        src = L.get('sub') or L.get('plain')
        title = src['name'].split(': ', 1)[-1].replace(' (mit Untertiteln)', '').strip()
        entry = {
            'n': n,
            'title': title,                      # German episode title
            'duration': src['duration'],         # seconds
            'poster': f'img/posters/L{n}.webp',  # bundled, 480x270
        }
        if plain: entry['video'] = plain              # primary: no burnt-in subtitles, use the VTT track
        if sub: entry['sub'] = sub                    # optional: burnt-in German subtitles (not every lesson has one)
        vtt = os.path.join(ROOT, 'www', 'data', 'subs', f'L{n}.vtt')
        if os.path.exists(vtt): entry['vtt'] = f'data/subs/L{n}.vtt'   # bundled German subtitles (from DW)
        if not plain:
            print(f'WARNING: lesson {n} has no reachable mp4', file=sys.stderr)
        out.append(entry)
    data = {'version': 1, 'source': 'DW Nicos Weg (tv-download.dw.com)', 'videos': out}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    tot = sum(e['video']['bytes'] for e in out if 'video' in e)
    print(f'wrote {OUT}: {len(out)} lessons, total {tot/1048576:.1f} MB, with vtt: {sum(1 for e in out if "vtt" in e)}')
    if '--download' in sys.argv:
        d = os.path.join(ROOT, 'tools', 'videos'); os.makedirs(d, exist_ok=True)
        for e in out:
            for k in ('video',):
                if k not in e: continue
                dst = os.path.join(d, f'L{e["n"]}_{k}.mp4')
                if os.path.exists(dst) and os.path.getsize(dst) == e[k]['bytes']: continue
                print('downloading', dst)
                subprocess.run(['curl', '-sL', '-C', '-', '-A', 'Mozilla/5.0', '-o', dst, e[k]['url']], check=False)

if __name__ == '__main__':
    main()
