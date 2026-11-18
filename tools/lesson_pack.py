#!/usr/bin/env python3
"""Print the source pack of one Nicos Weg lesson — everything a content author needs, from local files only.

  python tools/lesson_pack.py 24            # meta + lesson words + episode dialogue (subtitles) + new verbs
  python tools/lesson_pack.py 24 --vocab    # + every word the learner knows up to lesson 24 (the vocabulary rule)

Sources: www/data/lessons.json (DW words, grammar topics), www/data/subs/L<n>.vtt (official German subtitles,
downloaded by tools/fetch_subs.py), content/L<n-1>.json (previous lesson, for story continuity).
"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def load_json(p):
    return json.load(io.open(p, encoding='utf-8'))


def is_verb(w):
    """DW tags many verbs as word/phrase: separable 'auf|stehen', modals ('muss, musste'), sein/wissen/feiern…"""
    k, de, sub = w.get('k'), w.get('de', ''), w.get('sub') or ''
    if k == 'noun':
        return False
    return (k == 'verb' or '|' in de
            or re.search(r',\s*(hat|ist)\s+[^,]+$', sub) is not None
            or (k == 'word' and re.match(r'^\S+,\s*\S+te\b', sub) is not None))


def dialogue(n):
    """Clean dialogue lines of the episode subtitles (one entry per cue, speaker turns start with '–')."""
    p = os.path.join(ROOT, 'www', 'data', 'subs', f'L{n}.vtt')
    if not os.path.exists(p):
        return None
    txt = io.open(p, encoding='utf-8').read()
    txt = re.sub(r'STYLE\s*\n(?:.*\n)*?\s*\n', '\n', txt)          # drop the STYLE block
    cues, cur = [], []
    for line in txt.splitlines():
        line = line.strip()
        if not line or line == 'WEBVTT' or re.match(r'^\d+$', line) or '-->' in line or line.startswith('::cue') or line in ('}', '{'):
            if cur:
                cues.append(' '.join(cur)); cur = []
            continue
        line = re.sub(r'<[^>]+>', '', line).strip()
        if re.match(r'^(color|background-color|font-size|line-height|font-family)\s*:', line):
            continue
        if line:
            cur.append(line)
    if cur:
        cues.append(' '.join(cur))
    return cues


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args or not args[0].isdigit():
        print(__doc__); sys.exit(1)
    n = int(args[0])
    vocab = load_json(os.path.join(ROOT, 'www', 'data', 'lessons.json'))
    lessons = {l['n']: l for l in vocab['lessons']}
    words = vocab['words']
    L = lessons.get(n)
    if not L:
        print(f'lesson {n} not found'); sys.exit(1)
    first = lambda w: min(w.get('lessons') or [99])

    print(f'===== LESSON {n}: {L.get("title")} =====')
    print(f'goal (communication aim): {L.get("goal")}')
    print(f'DW grammar topic: {L.get("gram") or "-"}')
    print(f'DW grammar pages: {", ".join(p.strip() for p in L.get("gramPages") or []) or "-"}')
    print(f'DW page: {L.get("url")}')
    prev = lessons.get(n - 1)
    if prev:
        print(f'previous lesson: {n-1} {prev.get("title")}  |  next: {n+1} {(lessons.get(n+1) or {}).get("title", "-")}')

    lw = [w for w in words if n in (w.get('lessons') or [])]
    print(f'\n--- words of this lesson ({len(lw)}; "new" = first met here) ---')
    for w in lw:
        tag = 'new' if first(w) == n else f'from L{first(w)}'
        extra = ''
        if w.get('k') == 'noun':
            extra = f'  [art={w.get("art")}, pl={w.get("pl") or "-"}]'
        print(f'{w["de"]}  =  {w.get("ar","")}  ({w.get("k")}, {tag}){extra}')

    verbs = [w for w in lw if is_verb(w) and first(w) == n]
    if verbs:
        print('\n--- new verbs in this lesson ---')
        print(', '.join(w['de'] for w in verbs))

    cues = dialogue(n)
    print('\n--- episode dialogue (official German subtitles) ---')
    if cues is None:
        print('(no subtitles file — run: python tools/fetch_subs.py %d)' % n)
    else:
        for c in cues:
            print(c)

    if '--vocab' in sys.argv:
        known = sorted({w['de'] for w in words if first(w) <= n}, key=str.lower)
        print(f'\n--- all words known up to lesson {n} ({len(known)}) ---')
        print(' | '.join(known))


if __name__ == '__main__':
    main()
