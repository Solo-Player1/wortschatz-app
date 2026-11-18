#!/usr/bin/env python3
"""Arabic-letter pronunciation (www/data/translit.json) for words that don't have one yet — batching + merge.

  python tools/translit_todo.py --count [--size 60]     # how many batches of missing words
  python tools/translit_todo.py <batch> [--size 60]     # print one batch: "<id>\t<German as displayed in the app>"
  python tools/translit_todo.py --merge                 # merge tools/translit_parts/part_*.json into translit.json

Style + rules: tools/TRANSLIT_GUIDE.md. A part file is {"items": [{"id": "...", "de": "...", "ar": "..."}]}.
The merge only fills ids that are still missing and rejects entries with Latin letters, پ ڤ گ, or > 60 chars.
The order is stable (first lesson, then German), so batch numbers mean the same thing until the merge.
"""
import glob, io, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS = os.path.join(ROOT, 'www', 'data', 'lessons.json')
TRANSLIT = os.path.join(ROOT, 'www', 'data', 'translit.json')
PARTS = os.path.join(ROOT, 'tools', 'translit_parts')
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def display_de(w):
    """Same text the app shows (data.js displayDe), minus "(Plural)" notes."""
    if w.get('k') == 'noun' and w.get('sg'):
        s = f'{w.get("art") or ""} {w["sg"]}'.strip()
    else:
        s = re.sub(r'^\((etwas|jemanden|jemandem)\)\s*', '', w.get('de') or '').strip()
    return re.sub(r'\s*\(Plural\)', '', s).strip()


def missing():
    words = json.load(io.open(LESSONS, encoding='utf-8'))['words']
    have = json.load(io.open(TRANSLIT, encoding='utf-8')) if os.path.exists(TRANSLIT) else {}
    todo = [w for w in words if w['id'] not in have]
    todo.sort(key=lambda w: (min(w.get('lessons') or [99]), (w.get('de') or '').lower(), w['id']))
    return todo, have


def size_arg():
    if '--size' in sys.argv:
        return max(1, int(sys.argv[sys.argv.index('--size') + 1]))
    return 60


ALLOWED_AR = re.compile(r'[ء-غـ-ْ \-]+')   # Arabic letters ء..غ ـ ف..ي + harakat, space, hyphen


def bad(ar):
    """Reject anything that isn't Arabic letters/harakat, spaces, hyphens (so ä ö ü ß é and پ ڤ گ چ ژ too), or > 60 chars."""
    ar = unicodedata.normalize('NFC', ar or '')
    return not ar or len(ar) > 60 or not ALLOWED_AR.fullmatch(ar)


def merge():
    todo, have = missing()
    need = {w['id'] for w in todo}
    added, rejected = 0, []
    for p in sorted(glob.glob(os.path.join(PARTS, 'part_*.json'))):
        try:
            items = json.load(io.open(p, encoding='utf-8')).get('items', [])
        except Exception as e:
            rejected.append(f'{os.path.basename(p)}: invalid JSON ({e})'); continue
        for it in items:
            i, ar = str(it.get('id', '')), str(it.get('ar', '')).strip()
            if i not in need:
                continue
            if bad(ar):
                rejected.append(f'{i} {it.get("de")!r}: {ar!r}'); continue
            have[i] = ar
            need.discard(i)
            added += 1
    tmp = TRANSLIT + '.tmp'
    io.open(tmp, 'w', encoding='utf-8').write(json.dumps(have, ensure_ascii=False, indent=1))
    os.replace(tmp, TRANSLIT)
    print(f'merged {added}; translit.json now {len(have)} entries; still missing {len(need)}; rejected {len(rejected)}')
    for r in rejected[:40]:
        print('  REJECT', r)


def main():
    if '--merge' in sys.argv:
        merge(); return
    todo, _ = missing()
    size = size_arg()
    batches = (len(todo) + size - 1) // size
    if '--count' in sys.argv:
        print(f'{len(todo)} words without pronunciation -> {batches} batches of {size}'); return
    argv = sys.argv[1:]
    args = [a for i, a in enumerate(argv) if a.isdigit() and (i == 0 or argv[i - 1] != '--size')]   # skip the --size value
    if not args:
        print(__doc__); sys.exit(1)
    b = int(args[0])
    if b >= batches:
        sys.exit(f'batch {b} out of range: {len(todo)} words -> batches 0..{max(0, batches - 1)} of {size}')
    for w in todo[b * size:(b + 1) * size]:
        print(f'{w["id"]}\t{display_de(w)}')


if __name__ == '__main__':
    main()
