#!/usr/bin/env python3
"""Merge content/L01..L15.json + verbs.json + wwords.json + alphabet.json into www/data/content.json.

Usage:  python tools/build_content.py [--out path/to/content.json] [--strict]

Validates every item (ids, tiles, cloze word, options), links sentences to the vocabulary of
www/data/lessons.json (field "words": ids of lesson words that appear in the sentence) and keeps
lessons 1-15 only. Problems are printed as WARN lines; --strict turns them into a non-zero exit.
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'content')
MAX_LESSON = 15
PUNCT = re.compile(r'[.,!?;:…"„“”«»()]+')

def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)

def norm(s):
    return PUNCT.sub('', str(s)).strip().lower()

def main():
    out = os.path.join(ROOT, 'www', 'data', 'content.json')
    args = sys.argv[1:]
    if '--out' in args:
        out = os.path.abspath(args[args.index('--out') + 1])
    strict = '--strict' in args
    warns = []
    warn = warns.append

    vocab = load(os.path.join(ROOT, 'www', 'data', 'lessons.json'))
    words = {w['id']: w for w in vocab['words']}
    lesson_words = {l['n']: l['words'] for l in vocab['lessons']}

    # verb forms → word id (so "heißt" links to heißen)
    verbs = load(os.path.join(SRC, 'verbs.json')).get('verbs', []) if os.path.exists(os.path.join(SRC, 'verbs.json')) else []
    def core(w):
        if w.get('k') == 'noun' and w.get('sg'):
            return [w['sg']]
        de = re.sub(r'^\((etwas|jemanden|jemandem|das)\)\s*', '', w.get('de', ''))
        de = re.sub(r'^(etwas|jemanden|jemandem)\s+', '', de)
        return [de] if de and len(de.split()) == 1 else []
    form_of = {}            # verb form -> (lesson, word id) — only linked for lessons >= the verb's lesson
    for v in verbs:
        wid = next((i for i, w in sorted(words.items()) if w.get('k') == 'verb' and v['inf'] in core(w)), None)
        if wid:
            v['wordId'] = wid
            for f in v.get('forms', {}).values():
                for part in str(f).replace('…', ' ').split():
                    form_of.setdefault(norm(part), (int(v.get('lesson', 99)), wid))

    sentences, wfragen, grammar = [], [], {}
    seen = set()
    for path in sorted(glob.glob(os.path.join(SRC, 'L*.json'))):
        d = load(path)
        n = int(d.get('n') or re.search(r'L(\d+)', path).group(1))
        if n < 1 or n > MAX_LESSON:
            warn(f'{os.path.basename(path)}: lesson {n} outside 1..{MAX_LESSON} skipped')
            continue
        allowed = set()
        for k in range(1, n + 1):
            allowed.update(lesson_words.get(k, []))
        index = {}
        for wid in sorted(allowed):                       # sorted → same links on every build
            for c in core(words[wid]):
                index.setdefault(norm(c), wid)
        for s in d.get('sentences', []):
            sid = s.get('id')
            if not sid or sid in seen:
                warn(f'L{n}: missing/duplicate sentence id {sid}'); continue
            de = str(s.get('de', '')).strip()
            if not de or '  ' in de or re.search(r'\s[.,!?;:]', de) or not re.search(r'[.!?]$', de):
                warn(f'{sid}: bad spacing/punctuation: {de!r}')
            tiles = de.split(' ')
            cl = s.get('cloze')
            if cl:
                if norm(cl.get('word', '')) not in [norm(t) for t in tiles]:
                    warn(f'{sid}: cloze word {cl.get("word")!r} not a tile'); cl = None
                elif cl.get('word') not in cl.get('opts', []) or len(set(cl.get('opts', []))) != len(cl.get('opts', [])) or len(cl.get('opts', [])) < 3:
                    warn(f'{sid}: bad cloze opts {cl.get("opts")}'); cl = None
            linked = []
            for t in tiles:
                fv = form_of.get(norm(t))
                wid = index.get(norm(t)) or (fv[1] if fv and fv[0] <= n else None)
                if wid and wid not in linked:
                    linked.append(wid)
            padded = ' ' + ' '.join(norm(t) for t in tiles) + ' '
            for ph in (w for w in (words[i] for i in sorted(allowed)) if w.get('k') == 'phrase'):
                key = ' '.join(norm(x) for x in ph['de'].split())
                if key and (' ' + key + ' ') in padded and ph['id'] not in linked:   # whole words only
                    linked.append(ph['id'])
            seen.add(sid)
            sentences.append({
                'id': sid, 'lesson': n, 'de': de, 'ar': s.get('ar', ''), 'kind': s.get('kind', 'statement'),
                'focus': s.get('focus', []), 'alts': [a for a in s.get('alts', []) if a and a != de],
                'cloze': cl, 'src': s.get('src', ''), 'words': linked,
            })
        for q in d.get('wfragen', []):
            qid = q.get('id')
            if not qid or qid in seen:
                warn(f'L{n}: missing/duplicate wfrage id {qid}'); continue
            if q.get('q', '').count('___') != 1 or q.get('answer') not in q.get('opts', []) or len(set(q.get('opts', []))) != len(q.get('opts', [])):
                warn(f'{qid}: bad question/options'); continue
            seen.add(qid)
            wfragen.append({'id': qid, 'lesson': n, 'q': q['q'], 'answer': q['answer'], 'opts': q['opts'], 'ar': q.get('ar', ''),
                            'reply': q.get('reply', ''), 'reply_ar': q.get('reply_ar', '')})
        g = [p for p in d.get('grammar', []) if p.get('h') and p.get('body')]
        if g:
            grammar[str(n)] = g

    wwords = load(os.path.join(SRC, 'wwords.json')).get('wwords', []) if os.path.exists(os.path.join(SRC, 'wwords.json')) else []
    alphabet = load(os.path.join(SRC, 'alphabet.json')) if os.path.exists(os.path.join(SRC, 'alphabet.json')) else {'letters': [], 'spelling': []}
    for v in verbs:
        if len(v.get('forms', {})) != 6:
            warn(f'verb {v.get("inf")}: needs 6 forms')
    verbs = [v for v in verbs if int(v.get('lesson', 99)) <= MAX_LESSON]

    data = {'version': 1, 'sentences': sentences, 'wfragen': wfragen, 'grammar': grammar,
            'verbs': verbs, 'wwords': [w for w in wwords if int(w.get('lesson', 99)) <= MAX_LESSON], 'alphabet': alphabet}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    for w in warns:
        print('WARN', w)
    per = {}
    for s in sentences:
        per[s['lesson']] = per.get(s['lesson'], 0) + 1
    print(f'content.json: {len(sentences)} sentences {dict(sorted(per.items()))}, {len(wfragen)} wfragen, '
          f'{len(grammar)} lessons with grammar, {len(verbs)} verbs, {len(data["wwords"])} question words, '
          f'{len(alphabet.get("letters", []))} letters -> {out}')
    if strict and warns:
        sys.exit(1)

if __name__ == '__main__':
    main()
