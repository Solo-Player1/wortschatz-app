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
try:
    sys.stdout.reconfigure(encoding='utf-8')      # Arabic/German titles on a cp1252 console or pipe
except Exception:
    pass

# DW typos in Knowledge.shortTitle (DW's own Knowledge.name is right) — the app must never teach wrong German
DE_FIX = {
    '40010560': 'etwas aus|ziehen',               # L61: DW wrote «ewas aus|ziehen»
    '38094240': '(jemandem) etwas empfehlen',     # L67: DW wrote «jemandem) etwas empfehlen)» (RTL-mangled brackets)
    '37836630': '(die) Sachen zum Anziehen',      # L57: DW's note «Plural» got into the German (sub already says «nur Plural»)
}
# same for Knowledge.subTitle (the forms/notes shown in a word's details); leading «?»/«.» moved by fixpunct()
SUB_FIX = {
    '37835968': 'schreibt, schrieb, hat geschrieben',   # L11 «(etwas) schreiben»: DW wrote «schreib» for the Präteritum
    '37836524': 'sieht, sah, hat gesehen',              # L26 «etwas/jemanden sehen»: DW copied the forms of an|sehen
    '37835819': 'Zeichen: €',                           # L16 «der Euro»: RTL-mangled «€ :Zeichen»
}

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
    s = re.sub(r'\s+', ' ', s or '').strip()      # L53: «jemanden/etwas  holen» (double space)
    m = re.match(r'^([.!?])(.+)$', s)
    if m and not re.search(r'[.!?…]$', s):
        s = m.group(2).strip() + m.group(1)
    return s


NOUN = re.compile(r'^(der|die|das)\s+([^,]+?)(?:,\s*(die\s+.+))?$')
# a verb with object / reflexive / prepositional markers, also stacked: «etwas suchen», «(sich) duschen»,
# «sich etwas teilen», «(jemandem) etwas empfehlen», «jemandem etwas vor|lesen», «(auf jemanden/etwas) warten»,
# «an etwas/jemanden denken», «etwas ändern», «etwas tun» — not «(sich) sicher sein» / «etwas klein schneiden» (phrases)
MARKED_VERB = re.compile(r'^(?:\(jemandem\)\s+|jemandem\s+|\(?sich\)?\s+)?\(?(?:(?:auf|über|von|an|mit|bei|für)\s+)?'
                         r'(?:sich|etwas|jemanden|jemandem|jemanden/etwas|etwas/jemanden)\)?\s+\S+n$')
# a bare verb: DW's sub lists the principal parts «feiert, feierte, hat gefeiert» / «zieht um, zog um, ist umgezogen»
# (sometimes followed by a note: «zahlt, zahlte, hat gezahlt, Kurzform von: bezahlen» — caught by «^\S+t,»)
BARE_VERB_SUB = re.compile(r',\s*(?:(?:hat|ist)\s+)?\S*(?:ge\S+(?:t|en)|iert)$|,\s*(?:hat|ist)\s+\S+$')


def classify(de, sub):
    m = NOUN.match(de)
    if m:
        # «die Eltern (Plural)»: plural-only noun — keep DW's note out of sg (the app would ask learners to type it)
        sg = re.sub(r'\s*\(Plural\)$', '', m.group(2).strip())
        return {'k': 'noun', 'art': m.group(1), 'sg': sg, 'pl': (m.group(3) or '').strip()}
    if MARKED_VERB.search(de) or re.search(r'^\S+n$', de) and sub and (BARE_VERB_SUB.search(sub) or re.search(r'^\S+t,', sub)):
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


REVERSED = re.compile(r'^[…?!.(]')


def looks_reversed(t):
    """DW stores some titles in RTL visual order: '… Ich habe kein', '?Zu spät!', '(Ich mag (nicht!'."""
    t = t or ''
    return bool(REVERSED.match(t)) or t.count('(') != t.count(')')


def video_title(d, n):
    """'Nicos Weg (A1) – Folge 23: Ich habe kein …' → 'Ich habe kein …' (only used when the index title looks reversed)."""
    for v in d.values():
        if isinstance(v, dict) and v.get('__typename') == 'Video':
            m = re.search(r'Folge\s+(\d+):\s*(.+?)(?:\s*\(mit Untertiteln?\))?\s*$', v.get('name') or '')
            if m and int(m.group(1)) == n:
                return m.group(2).strip()
    return None


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
        de = DE_FIX.get(str(k.get('id'))) or fixpunct(k.get('shortTitle'))
        name = fixpunct(k.get('name'))
        if '|' in name and '|' not in de and name.replace('|', '') == de:
            de = name        # DW marks the separable prefix only in Knowledge.name for some verbs: «etwas mit|schreiben»
        sub = SUB_FIX.get(str(k.get('id'))) or fixpunct(k.get('subTitle'))
        au = ''
        a = k.get('audios') or []
        if a and isinstance(a[0], dict):
            au = a[0].get('mp3Src') or ''
        w = {'id': str(k['id']), 'de': de, 'ar': clean(k.get('text')), 'sub': sub, 'audio': au}
        w.update(classify(de, sub))
        words.append(w)
    words.sort(key=lambda w: w['de'].lower().lstrip('(').lstrip())
    meta_info = les.get('learningMetaInfo') or {}
    title = fixpunct(meta['title'])
    if looks_reversed(title):
        title = video_title(d, n) or title
    return {
        'n': n, 'id': lid, 'title': title, 'goal': meta.get('goal') or '',
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
        if not ws:
            # e.g. lesson 77 «امتحان إنهاء دورة A1»: a DW test page without vocabulary — not a lesson for the app
            print('  no words (DW exam/test page) - skipped')
            lessons.pop(n, None)
            continue
        lesson['words'] = []
        for w in ws:
            if w['id'] in words:
                w0 = words[w['id']]
                # re-runs refresh the German, DW's note + classification (typo fixes, «(Plural)» cleanup); ar/audio stay
                for key in ('art', 'sg', 'pl'):
                    if key not in w:
                        w0.pop(key, None)
                w0.update({key: w[key] for key in ('de', 'sub', 'k', 'art', 'sg', 'pl') if key in w})
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
    tmp = OUT + '.tmp'                               # atomic: readers (app server, other tools) never see half a file
    with io.open(tmp, 'w', encoding='utf-8') as f:
        f.write(json.dumps(out, ensure_ascii=False, indent=1))
    for attempt in range(40):                        # Windows refuses the swap while a reader (serve.py) has it open
        try:
            os.replace(tmp, OUT)
            break
        except PermissionError:
            if attempt == 39:
                raise
            time.sleep(0.25)
    print(f'wrote {OUT}: {len(out["lessons"])} lessons, {len(out["words"])} words (version {out["version"]})')
    if '--no-audio' not in flags:
        download_audio(out['words'])


if __name__ == '__main__':
    main()
