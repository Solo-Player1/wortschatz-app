#!/usr/bin/env python3
"""
Build www/data/lessons.json (+ download audio) from DW "Nicos Weg" lesson pages.

Usage (run from the project root):
  python tools/extract_dw.py 1-15            # lessons 1..15 (uses tools/cache, fetches missing pages)
  python tools/extract_dw.py 16 17           # add lessons 16 and 17 (merged into the existing JSON)
  python tools/extract_dw.py 1-15 --no-audio # skip mp3 download
  python tools/extract_dw.py --audio-only    # only download missing mp3 files listed in lessons.json

The lesson order/ids come from tools/course.json (the course hub of learngerman.dw.com).
Word ids are the DW "Knowledge" ids, so they stay stable across updates and user progress is kept.
"""
import io, json, os, re, sys, html, urllib.request, urllib.parse, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, 'tools')
CACHE = os.path.join(TOOLS, 'cache')
OUT = os.path.join(ROOT, 'www', 'data', 'lessons.json')
AUDIO_DIR = os.path.join(ROOT, 'www', 'audio')
DW = 'https://learngerman.dw.com'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

os.makedirs(CACHE, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)


def fetch(url, binary=False):
    url = urllib.parse.quote(url, safe=':/%?=&')   # DW has a few file names with spaces
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode('utf-8', 'replace')


def clean(t):
    t = re.sub(r'<figure.*?</figure>', '', t or '', flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t).replace(' ', ' ')
    for ch in '‏‎‪‫‬':
        t = t.replace(ch, '')
    t = t.replace('ی', 'ي').replace('ک', 'ك')   # Persian yeh/kaf -> Arabic
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'\s+([،.؟!])', r'\1', t)
    return t.strip(' .')


def fixpunct(s):
    s = (s or '').strip()
    m = re.match(r'^([.!?])(.+)$', s)
    if m and not re.search(r'[.!?…]$', s):
        s = m.group(2).strip() + m.group(1)
    return s


NOUN = re.compile(r'^(der|die|das)\s+([^,]+?)(?:,\s*(die\s+.+))?$')


def classify(de, sub):
    m = NOUN.match(de)
    if m:
        return {'k': 'noun', 'art': m.group(1), 'sg': m.group(2).strip(), 'pl': (m.group(3) or '').strip()}
    if re.search(r'^\(?(etwas|jemanden|jemandem|jemanden/etwas|etwas/jemanden|mit jemandem)\)?\s+\S+en$', de) or re.search(r'^\S+en$', de) and sub and re.search(r'^\S+t,', sub):
        return {'k': 'verb'}
    if re.search(r'[.!?…]$', de) or ' ' in de.strip():
        return {'k': 'phrase'}
    return {'k': 'word'}


def course_index():
    c = json.load(io.open(os.path.join(TOOLS, 'course.json'), encoding='utf-8'))
    links = c['contentLinks({"targetTypes":"LESSON"})']
    # course.json only holds refs; the hub page state was flattened into tools/lessons_index.json
    idx_path = os.path.join(TOOLS, 'lessons_index.json')
    if os.path.exists(idx_path):
        return json.load(io.open(idx_path, encoding='utf-8'))
    raise SystemExit('tools/lessons_index.json missing - run tools/build_index.py first')


def parse_lesson(n, meta):
    lid = str(meta['id'])
    path = os.path.join(CACHE, f'L{lid}.html')
    if not os.path.exists(path):
        print(f'  fetching lesson {n} ({lid}) from DW ...')
        page = fetch(DW + urllib.request.quote(meta['url']))
        io.open(path, 'w', encoding='utf-8').write(page)
    s = io.open(path, encoding='utf-8').read()
    m = re.search(r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\});\s*', s, re.S)
    if not m:
        raise SystemExit(f'no apollo state in lesson {lid}')
    d = json.loads(m.group(1))
    les = [v for v in d.values() if isinstance(v, dict) and v.get('__typename') == 'Lesson'][0]
    kn = [v for v in d.values() if isinstance(v, dict) and v.get('__typename') == 'Knowledge']
    words, gram = [], []
    for k in kn:
        if k.get('knowledgeType') == 'GRAMMAR':
            gram.append(k.get('name') or k.get('shortTitle'))
            continue
        if k.get('knowledgeType') != 'VOCABULARY':
            continue
        de = fixpunct(k.get('shortTitle'))
        sub = (k.get('subTitle') or '').strip()
        au = ''
        a = k.get('audios') or []
        if a and isinstance(a[0], dict):
            au = a[0].get('mp3Src') or ''
        w = {'id': str(k['id']), 'de': de, 'ar': clean(k.get('text')), 'sub': sub, 'audio': au}
        w.update(classify(de, sub))
        words.append(w)
    words.sort(key=lambda w: w['de'].lower().lstrip('(').lstrip())
    meta_info = les.get('learningMetaInfo') or {}
    return {
        'n': n, 'id': lid, 'title': fixpunct(meta['title']), 'goal': meta.get('goal') or '',
        'gram': meta.get('gram') or '', 'gramPages': gram, 'url': DW + meta['url'],
        'exercises': meta_info.get('exerciseCount', 0),
    }, words


def parse_range(args):
    ns = set()
    for a in args:
        if re.match(r'^\d+-\d+$', a):
            lo, hi = map(int, a.split('-'))
            ns.update(range(lo, hi + 1))
        elif a.isdigit():
            ns.add(int(a))
    return sorted(ns)


def download_audio(words):
    missing = [w for w in words if w.get('audio') and not os.path.exists(os.path.join(AUDIO_DIR, w['file']))]
    print(f'audio: {len(words)} words, {len(missing)} files to download')
    for i, w in enumerate(missing, 1):
        try:
            data = fetch(w['audio'], binary=True)
            io.open(os.path.join(AUDIO_DIR, w['file']), 'wb').write(data)
        except Exception as e:
            print(f'  FAILED {w["file"]}: {e}')
        if i % 25 == 0:
            print(f'  {i}/{len(missing)}')
            time.sleep(0.5)
    print('audio done')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    existing = json.load(io.open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {'lessons': [], 'words': []}

    if '--audio-only' in flags:
        download_audio(existing['words'])
        return

    ns = parse_range(args) or [l['n'] for l in existing['lessons']]
    index = course_index()
    by_n = {l['n']: l for l in index}
    lessons = {l['n']: l for l in existing['lessons']}
    words = {w['id']: w for w in existing['words']}
    for n in ns:
        if n not in by_n:
            print(f'lesson {n} not in course index, skipping'); continue
        print(f'lesson {n}: {by_n[n]["title"]}')
        lesson, ws = parse_lesson(n, by_n[n])
        lesson['words'] = []
        for w in ws:
            if w['id'] in words:
                w0 = words[w['id']]
                if n not in w0['lessons']:
                    w0['lessons'].append(n)
            else:
                w['lessons'] = [n]
                w['file'] = os.path.basename(w['audio']).replace(' ', '_') if w['audio'] else ''
                words[w['id']] = w
            lesson['words'].append(w['id'])
        lessons[n] = lesson
        print(f'  {len(ws)} words, {len(lesson["gramPages"])} grammar pages')

    out = {
        'version': (existing.get('version') or 0) + 1,
        'source': 'learngerman.dw.com - Nicos Weg A1',
        'lessons': [lessons[k] for k in sorted(lessons)],
        'words': sorted(words.values(), key=lambda w: (w['lessons'][0], w['de'].lower())),
    }
    io.open(OUT, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1))
    print(f'wrote {OUT}: {len(out["lessons"])} lessons, {len(out["words"])} words (version {out["version"]})')
    if '--no-audio' not in flags:
        download_audio(out['words'])


if __name__ == '__main__':
    main()
