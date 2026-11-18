#!/usr/bin/env python3
"""Validate content/topics/<id>.json — the grammar topic pages + their quiz (📚 قواعد مهمة).

  python tools/check_topics.py            # all topics
  python tools/check_topics.py articles   # one topic

ERROR = must fix (the page/game would break or a quiz item would be ambiguous). WARN = should fix.
INFO  = quiz/example German with words outside DW's vocabulary up to the item's lesson (heuristic, like
        check_content.py — names, correct inflections and participles can be false alarms).
Exit code 1 if any ERROR.
"""
import glob, io, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_content as C

ROOT = C.ROOT
IDS = ['articles', 'indefinite', 'family', 'possessive', 'daysmonths', 'prepositions', 'adjectives', 'ihr']


def norm(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip().lower()


def check(path, words, verbs):
    err, warn, info = [], [], []
    try:
        t = json.load(io.open(path, encoding='utf-8'))
    except Exception as e:
        return [f'not valid JSON: {e}'], [], []
    tid = os.path.splitext(os.path.basename(path))[0]
    if t.get('id') != tid:
        err.append(f'id {t.get("id")!r} must be the file name {tid!r}')
    for k in ('title', 'icon', 'summary'):
        if not str(t.get(k) or '').strip():
            err.append(f'missing {k}')
    if not isinstance(t.get('lesson'), int) or not 1 <= t['lesson'] <= 76:
        err.append(f'lesson {t.get("lesson")!r} must be the first DW lesson (1-76) that teaches it')
    secs = t.get('sections') or []
    if len(secs) < 3:
        warn.append(f'only {len(secs)} sections (aim 4-7)')
    for i, s in enumerate(secs):
        tag = f'section {i + 1}'
        if not str(s.get('h') or '').strip() or not str(s.get('body') or '').strip():
            err.append(f'{tag}: needs h + body')
        tab = s.get('table')
        if tab is not None:
            if not isinstance(tab, list) or not tab or not all(isinstance(r, list) for r in tab):
                err.append(f'{tag}: table must be a list of rows (lists)')
            elif len({len(r) for r in tab}) != 1:
                err.append(f'{tag}: table rows have different lengths {[len(r) for r in tab]}')
            elif len(tab[0]) > 5:
                warn.append(f'{tag}: {len(tab[0])} columns — too wide for a 360 px phone (max 4–5)')
        for e in s.get('examples') or []:
            if not (e.get('de') and e.get('ar')):
                err.append(f'{tag}: example needs de + ar')
            else:
                n = int(e.get('lesson') or t.get('lesson') or 76)
                bad = C.unknown_tokens(e['de'], C.allowed_vocab(max(n, 1), words, verbs))
                if bad:
                    info.append(f'{tag} «{e["de"]}» (L{n}) — outside the vocabulary rule? {bad}')
    quiz = t.get('quiz') or []
    if len(quiz) < 16:
        warn.append(f'only {len(quiz)} quiz items (aim 18–24)')
    seen = set()
    for i, q in enumerate(quiz):
        tag = f'quiz {i + 1}'
        qs, ans, opts = str(q.get('q') or ''), str(q.get('answer') or ''), q.get('opts') or []
        if qs.count('___') != 1:
            err.append(f'{tag}: q must contain exactly one ___ : {qs!r}')
        if not ans or not isinstance(opts, list) or not 3 <= len(opts) <= 4:
            err.append(f'{tag}: needs answer + 3–4 opts')
            continue
        if ans not in opts:
            err.append(f'{tag}: answer {ans!r} not in opts {opts}')
        if len({re.sub(r'\s+', ' ', str(o)).strip() for o in opts}) != len(opts):     # case matters: «Ihr» ≠ «ihr»
            err.append(f'{tag}: duplicate options {opts}')
        if not str(q.get('ar') or '').strip():
            err.append(f'{tag}: needs ar (the meaning of the full sentence, Egyptian)')
        if not str(q.get('why') or '').strip():
            warn.append(f'{tag}: no «why» (short Egyptian explanation shown after the answer)')
        if not isinstance(q.get('lesson'), int) or not 1 <= q['lesson'] <= 76:
            err.append(f'{tag}: lesson {q.get("lesson")!r}')
        full = qs.replace('___', ans)
        if norm(full) in seen:
            err.append(f'{tag}: duplicate item «{full}»')
        seen.add(norm(full))
        if isinstance(q.get('lesson'), int):
            bad = C.unknown_tokens(full, C.allowed_vocab(q['lesson'], words, verbs))
            if bad:
                info.append(f'{tag} «{full}» (L{q["lesson"]}) — outside the vocabulary rule? {bad}')
    if tid == 'daysmonths':
        L = t.get('lists') or {}
        if len(L.get('days') or []) != 7 or len(L.get('months') or []) != 12:
            err.append('lists.days must have 7 and lists.months 12 entries ({de, ar})')
        for x in (L.get('days') or []) + (L.get('months') or []):
            if not (isinstance(x, dict) and x.get('de') and x.get('ar')):
                err.append(f'lists entry needs de + ar: {x!r}')
    return err, warn, info


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    words = C.load(os.path.join(ROOT, 'www', 'data', 'lessons.json'))['words']
    vp = os.path.join(ROOT, 'content', 'verbs.json')
    verbs = C.load(vp).get('verbs', []) if os.path.exists(vp) else []
    ids = args or IDS
    total = 0
    for tid in ids:
        p = os.path.join(ROOT, 'content', 'topics', f'{tid}.json')
        if not os.path.exists(p):
            print(f'{tid}: MISSING {p}'); total += 1; continue
        e, w, i = check(p, words, verbs)
        t = json.load(io.open(p, encoding='utf-8')) if not e or 'JSON' not in e[0] else {}
        print(f'{tid}: {len(t.get("sections") or [])} sections, {len(t.get("quiz") or [])} quiz items — {len(e)} ERROR, {len(w)} WARN, {len(i)} INFO')
        for tag, xs in (('ERROR', e), ('WARN ', w), ('INFO ', i)):
            for x in xs:
                print(f'  {tag} {x}')
        total += len(e)
    sys.exit(1 if total else 0)


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    main()
