#!/usr/bin/env python3
"""Validate content/L<NN>.json files before tools/build_content.py: structure, vocabulary rule, episode claims.

  python tools/check_content.py 24          # one lesson
  python tools/check_content.py 16-77       # a range
  python tools/check_content.py all         # every content/L*.json

ERROR = must fix (the app would drop or break the item).  WARN = should fix (spec CONTENT_SPEC.md).
INFO  = review hint only: tokens outside the vocabulary rule are GUESSED (inflections are approximated), so a
        flagged word may be fine — a human/agent decides. Exit code 1 if any ERROR.
"""
import glob, io, json, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

KINDS = {'statement', 'question', 'answer', 'greeting'}
SRCS = {'episode', 'authored'}
EDGE = '.,!?;:…"„“”«»()[]–—\'‚‘’'


def load(p):
    return json.load(io.open(p, encoding='utf-8'))


APOS = re.compile(r"[’‘ʼ´`]")          # DW subtitles write geht’s — the same word as geht's


def tok(t):
    return APOS.sub("'", t).strip(EDGE).lower()


def is_verb(w):
    """DW tags many verbs as word/phrase: separable 'auf|stehen', modals ('muss, musste'), sein/wissen/feiern…"""
    k, de, sub = w.get('k'), w.get('de', ''), w.get('sub') or ''
    if k == 'noun':
        return False
    return (k == 'verb' or '|' in de
            or re.search(r',\s*(hat|ist)\s+[^,]+$', sub) is not None
            or re.search(r',\s*\S*(ge\S+(t|en)|iert)$', sub) is not None      # «bringt mit, brachte mit, mitgebracht» (DW left out hat)
            or (k == 'word' and re.match(r'^\S+,\s*\S+te\b', sub) is not None))


def tokens(s):
    return [x for x in (tok(t) for t in str(s).split()) if x]


# ---------------- vocabulary ----------------
IRREG = {
    'sein': 'bin bist ist sind seid war warst waren wart gewesen',
    'haben': 'habe hast hat haben habt hatte hattest hatten hattet gehabt',
    'werden': 'werde wirst wird werden werdet wurde wurden geworden',
    'essen': 'esse isst esst essen gegessen', 'nehmen': 'nehme nimmst nimmt nehmen nehmt genommen',
    'lesen': 'lese liest lest lesen gelesen', 'sehen': 'sehe siehst sieht sehen seht gesehen',
    'fahren': 'fahre fährst fährt fahren fahrt gefahren', 'schlafen': 'schlafe schläfst schläft schlafen schlaft geschlafen',
    'laufen': 'laufe läufst läuft laufen lauft gelaufen', 'geben': 'gebe gibst gibt geben gebt gegeben',
    'helfen': 'helfe hilfst hilft helfen helft geholfen', 'treffen': 'treffe triffst trifft treffen trefft getroffen',
    'sprechen': 'spreche sprichst spricht sprechen sprecht gesprochen', 'tragen': 'trage trägst trägt tragen tragt getragen',
    'waschen': 'wasche wäschst wäscht waschen wascht gewaschen', 'vergessen': 'vergesse vergisst vergesst vergessen',
    'wissen': 'weiß weißt wissen wisst gewusst', 'mögen': 'mag magst mögen mögt möchte möchtest möchten möchtet',
    'möchten': 'möchte möchtest möchten möchtet', 'können': 'kann kannst können könnt konnte konnten',
    'müssen': 'muss musst müssen müsst musste mussten', 'dürfen': 'darf darfst dürfen dürft durfte',
    'wollen': 'will willst wollen wollt wollte wollten', 'sollen': 'soll sollst sollen sollt sollte',
    'gehen': 'gehe gehst geht gehen gegangen ging', 'kommen': 'komme kommst kommt kommen gekommen kam',
    'tun': 'tue tust tut tun getan', 'finden': 'finde findest findet finden gefunden', 'heißen': 'heiße heißt heißen',
    'gefallen': 'gefällt gefallen gefällst', 'halten': 'halte hältst hält halten', 'lassen': 'lasse lässt lassen',
    'denken': 'denke denkst denkt denken dachte', 'bringen': 'bringe bringst bringt bringen brachte',
    'schreiben': 'schreibe schreibst schreibt schreiben geschrieben', 'trinken': 'trinke trinkst trinkt trinken getrunken',
    'singen': 'singe singst singt singen gesungen', 'bleiben': 'bleibe bleibst bleibt bleiben geblieben',
    'liegen': 'liege liegst liegt liegen gelegen', 'stehen': 'stehe stehst steht stehen gestanden',
    'sitzen': 'sitze sitzt sitzen gesessen', 'rufen': 'rufe rufst ruft rufen gerufen',
    'verstehen': 'verstehe verstehst versteht verstehen verstanden', 'beginnen': 'beginne beginnst beginnt beginnen',
    'gewinnen': 'gewinne gewinnst gewinnt gewinnen gewonnen', 'tanzen': 'tanze tanzt tanzen getanzt',
    'heißen ': '', 'mögen ': '',
}
SEP_PREFIXES = ('zurück', 'kennen', 'fern', 'nach', 'weg', 'los', 'mit', 'aus', 'auf', 'ein', 'vor', 'an', 'ab', 'um', 'zu')

CORE = set('''
ich du er sie es wir ihr mich dich mir dir ihn ihm uns euch ihnen man jemand niemand etwas nichts alles alle
der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner keines dieser diese dieses diesen diesem
und aber oder denn sondern nicht ja nein auch sehr gern gerne hier da dort jetzt heute noch schon nur so dann also doch mal bitte danke
in im ins aus mit von vom zu zum zur für bei beim nach an am ans auf um über unter vor hinter neben zwischen durch ohne gegen bis seit
wie was wo woher wohin wer wen wem wann warum welche welcher welches welchen welchem wieviel viel viele
hallo okay ok tschüss hey hmm ah oh na genau prima super toll
herr frau nico emma lisa max yara pedro inge sebastian nina nawin lotte selin jan lukas anna paul tim
deutschland spanien ägypten kairo berlin bonn köln münchen hamburg frankfurt wien österreich schweiz europa syrien türkei
null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn
neunzehn zwanzig dreißig vierzig fünfzig sechzig siebzig achtzig neunzig hundert tausend einhundert million
'''.split())
for base in ('mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'eur'):
    CORE.update({base, base + 'e', base + 'en', base + 'em', base + 'er', base + 'es'})
for v in ('sein', 'haben', 'heißen', 'kommen', 'wohnen', 'sprechen', 'möchten'):
    CORE.update(IRREG.get(v, v).split())
CORE.update('wohne wohnst wohnt wohnen'.split())
NUM_COMPOUND = re.compile(r'^(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)und(zwanzig|dreißig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)$')


def clean_entry(de):
    de = re.sub(r'\((etwas|jemandem|jemanden|jemand|das|der|die|Plural|von)\)', ' ', de)
    de = re.sub(r'\b(jemanden/etwas|etwas/jemanden|jemandem|jemanden|etwas|sich)\b', ' ', de)
    return re.sub(r'\s+', ' ', de).strip()


def verb_forms(base):
    base = base.strip().lower().replace('|', '')
    out = {base}
    prefix = ''
    if base not in IRREG:
        for p in SEP_PREFIXES:
            if base.startswith(p) and len(base) > len(p) + 3:
                prefix, base_core = p, base[len(p):]
                out.add(p)
                out.update(verb_forms(base_core))
                out.add('ge'.join([p, base_core[:-2] + 't']) if base_core.endswith('en') else p + 'ge' + base_core)
                break
    if base in IRREG:
        out.update(IRREG[base].split())
    stem = base[:-2] if base.endswith('en') else base[:-1] if base.endswith(('n', 'l', 'r')) else base
    out.update({stem + 'e', stem + 'st', stem + 't', stem + 'en', stem + 'est', stem + 'et', 'ge' + stem + 't', stem + 'te', stem + 'ten'})
    return out


def word_forms(w):
    k, de = w.get('k'), w.get('de', '')
    out = set()
    if k == 'noun':
        sg = re.sub(r'\(.*?\)', '', w.get('sg') or '').strip().lower()
        pl = re.sub(r'^die\s+', '', (w.get('pl') or '')).strip().lower()
        for s in (sg, pl):
            if s:
                out.update({s, s + 'n', s + 'en', s + 's', s + 'es'})
        for part in re.split(r'\s+', sg):
            if part:
                out.add(part)
        return out
    core = clean_entry(de)
    if is_verb(w):
        parts = core.split()
        if parts:
            out.update(verb_forms(parts[-1]))
        out.update(tokens(core))
        return out
    toks = tokens(core)
    out.update(toks)
    if len(toks) == 1:                       # adjectives / adverbs: declension + comparison
        b = toks[0]
        out.update({b + 'e', b + 'en', b + 'er', b + 'es', b + 'em', b + 'ste', b + 'sten'})
    return out


def allowed_vocab(n, words, verbs):
    allow = set(CORE)
    for w in words:
        if min(w.get('lessons') or [99]) <= n:
            allow |= word_forms(w)
    for v in verbs:
        try:
            ln = int(v.get('lesson', 99))
        except (TypeError, ValueError):       # a broken entry is reported by check_verbs.py, not a crash here
            continue
        if ln <= n:
            allow.add(str(v.get('inf', '')).lower())
            for f in (v.get('forms') or {}).values():
                allow.update(tokens(str(f).replace('…', ' ')))
    return allow


def unknown_tokens(s, allow):
    bad = []
    for raw in str(s).split():
        t = tok(raw)
        if not t or re.search(r'\d', t) or t in allow or NUM_COMPOUND.match(t):
            continue
        if '-' in t and all(p in allow for p in t.split('-') if p):
            continue
        bad.append(raw.strip(EDGE))
    return bad


# ---------------- subtitles ----------------
def dialogue_cues(n):
    p = os.path.join(ROOT, 'www', 'data', 'subs', f'L{n}.vtt')
    if not os.path.exists(p):
        return None
    cues, cur = [], []
    for line in io.open(p, encoding='utf-8').read().splitlines():
        line = line.strip()
        if '-->' in line or re.match(r'^\d+$', line) or not line or line == 'WEBVTT':
            if cur:
                cues.append(' '.join(cur)); cur = []
            continue
        line = re.sub(r'<[^>]+>', '', line)
        if ':' in line and re.match(r'^[a-z-]+\s*:', line):
            continue
        cur.append(line)
    if cur:
        cues.append(' '.join(cur))
    return cues


def found_in_episode(de, cues, full):
    nd = ' '.join(tokens(de))
    if nd and f' {nd} ' in full:          # word-bounded ("Er ist da." must not match inside "teuer ist das")
        return True
    ts = tokens(de)
    if not ts:
        return False
    for i, c in enumerate(cues):
        window = set(tokens(c + ' ' + (cues[i + 1] if i + 1 < len(cues) else '')))
        if sum(1 for t in ts if t in window) >= 0.8 * len(ts):
            return True
    return False


# ---------------- checks ----------------
def check_lesson(n, words, verbs, lesson_ids):
    path = os.path.join(ROOT, 'content', f'L{n:02d}.json')
    errs, warns, infos = [], [], []
    if not os.path.exists(path):
        return None
    try:
        d = load(path)
    except Exception as e:
        return [f'invalid JSON: {e}'], [], [], {}
    NN = f'{n:02d}'
    if int(d.get('n') or 0) != n:
        errs.append(f'"n" is {d.get("n")} but file is L{NN}')
    allow = allowed_vocab(n, words, verbs)
    cues = dialogue_cues(n)
    full = ' ' + ' '.join(' '.join(tokens(c)) for c in cues) + ' ' if cues else ''
    sents = d.get('sentences') or []
    seen_ids, seen_de = set(), Counter()
    cloze_n = episode_n = 0
    for s in sents:
        sid = s.get('id', '?')
        if not re.match(rf'^s{NN}-\d{{3}}$', str(sid)):
            errs.append(f'{sid}: id must look like s{NN}-001')
        if sid in seen_ids:
            errs.append(f'{sid}: duplicate id')
        seen_ids.add(sid)
        de = str(s.get('de', ''))
        seen_de[de.strip().lower()] += 1
        if not de.strip():
            errs.append(f'{sid}: empty de'); continue
        if '  ' in de or re.search(r'\s[.,!?;:]', de) or not re.search(r'[.!?]$', de):
            errs.append(f'{sid}: spacing/punctuation (single spaces, no space before punctuation, end with . ! ?): {de!r}')
        if not str(s.get('ar', '')).strip():
            errs.append(f'{sid}: empty ar')
        if s.get('kind') not in KINDS:
            errs.append(f'{sid}: kind must be one of {sorted(KINDS)}')
        f = s.get('focus')
        if not isinstance(f, list) or not 1 <= len(f) <= 3:
            warns.append(f'{sid}: focus should be 1-3 short tags')
        if s.get('src') not in SRCS:
            errs.append(f'{sid}: src must be "episode" or "authored"')
        tiles = de.split(' ')
        ntiles = [tok(t) for t in tiles]
        for a in s.get('alts') or []:
            if sorted(tokens(a)) != sorted(t for t in ntiles if t):
                warns.append(f'{sid}: alt does not use the same words as de: {a!r}')
        cl = s.get('cloze')
        if cl:
            cloze_n += 1
            w, opts = cl.get('word', ''), cl.get('opts') or []
            if tok(w) not in ntiles:
                errs.append(f'{sid}: cloze word {w!r} is not a tile of de')
            if w not in opts or len(set(opts)) != len(opts) or len(opts) < 3:
                errs.append(f'{sid}: cloze opts must contain the word once, be unique, 3-4 items: {opts}')
            if w != w.strip(EDGE):
                errs.append(f'{sid}: cloze word must be written without punctuation: {w!r}')
        if s.get('src') == 'episode':
            episode_n += 1
            if cues is not None and not found_in_episode(de, cues, full):
                warns.append(f'{sid}: marked "episode" but not found in the subtitles: {de!r}')
        unk = unknown_tokens(de, allow)
        if unk:
            infos.append(f'{sid}: outside vocab ≤L{n}? {unk}  — {de}')
    for de, c in seen_de.items():
        if c > 1:
            warns.append(f'duplicate sentence x{c}: {de!r}')
    if len(sents) < 10:
        errs.append(f'only {len(sents)} sentences (minimum 10)')
    elif not 15 <= len(sents) <= 22:
        warns.append(f'{len(sents)} sentences (target 18-22)')
    if sents and cloze_n < 0.6 * len(sents):
        warns.append(f'cloze on {cloze_n}/{len(sents)} sentences (need ≥ 60%)')
    if cues is not None and sents and episode_n < 0.3 * len(sents):
        warns.append(f'only {episode_n}/{len(sents)} sentences from the episode (aim ~40%; mine the subtitles)')

    wf = d.get('wfragen') or []
    for q in wf:
        qid = q.get('id', '?')
        if not re.match(rf'^w{NN}-\d{{2}}$', str(qid)):
            errs.append(f'{qid}: id must look like w{NN}-01')
        if qid in seen_ids:
            errs.append(f'{qid}: duplicate id')
        seen_ids.add(qid)
        if str(q.get('q', '')).count('___') != 1:
            errs.append(f'{qid}: q must contain ___ exactly once')
        opts = q.get('opts') or []
        ans = q.get('answer')
        if (not isinstance(ans, str) or not ans.strip()
                or any(not isinstance(o, str) or not o.strip() for o in opts)
                or ans not in opts or len(set(opts)) != len(opts)):
            errs.append(f'{qid}: answer/opts must be non-empty strings, answer in opts, opts unique')
            ans = ans if isinstance(ans, str) else ''
        elif len(opts) != 4:
            warns.append(f'{qid}: give exactly 4 opts')
        if not str(q.get('ar', '')).strip():
            errs.append(f'{qid}: empty ar')
        unk = unknown_tokens(str(q.get('q', '')).replace('___', ans), allow)
        if unk:
            infos.append(f'{qid}: outside vocab ≤L{n}? {unk}')

    gr = d.get('grammar') or []
    if not 1 <= len(gr) <= 4:
        warns.append(f'{len(gr)} grammar points (aim 2-4)')
    for g in gr:
        gid = g.get('id', '?')
        if not re.match(rf'^g{NN}-\d$', str(gid)):
            errs.append(f'{gid}: id must look like g{NN}-1')
        if not str(g.get('h', '')).strip() or not str(g.get('body', '')).strip():
            errs.append(f'{gid}: needs h and body')
        if len(str(g.get('body', ''))) > 450:
            warns.append(f'{gid}: body is {len(str(g.get("body","")))} chars (max 450)')
        ex = g.get('examples') or []
        if not 2 <= len(ex) <= 4 or any(not e.get('de') or not e.get('ar') for e in ex):
            warns.append(f'{gid}: 2-4 examples, each with de and ar')
        t = g.get('table')
        if t is not None and (not isinstance(t, list) or any(not isinstance(r, list) for r in t)):
            errs.append(f'{gid}: table must be a list of rows (lists)')
    stats = {'sentences': len(sents), 'cloze': cloze_n, 'episode': episode_n, 'wfragen': len(wf), 'grammar': len(gr),
             'subs': cues is not None}
    return errs, warns, infos, stats


def parse_targets(args):
    if not args or args == ['all']:
        return sorted(int(re.search(r'L(\d+)\.json$', p).group(1)) for p in glob.glob(os.path.join(ROOT, 'content', 'L*.json')))
    out = set()
    for a in args:
        m = re.match(r'^(\d+)-(\d+)$', a)
        if m:
            out.update(range(int(m.group(1)), int(m.group(2)) + 1))
        elif a.isdigit():
            out.add(int(a))
    return sorted(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    quiet = '--quiet' in sys.argv
    vocab = load(os.path.join(ROOT, 'www', 'data', 'lessons.json'))
    words = vocab['words']
    lesson_ids = {l['n']: l for l in vocab['lessons']}
    vp = os.path.join(ROOT, 'content', 'verbs.json')
    verbs = load(vp).get('verbs', []) if os.path.exists(vp) else []
    total_err = 0
    for n in parse_targets(args):
        r = check_lesson(n, words, verbs, lesson_ids)
        if r is None:
            print(f'L{n:02d}: (no file)'); continue
        errs, warns, infos, st = r
        total_err += len(errs)
        head = (f'L{n:02d}: {st.get("sentences",0)} sentences (cloze {st.get("cloze",0)}, episode {st.get("episode",0)}'
                f'{"" if st.get("subs") else ", no subs"}), {st.get("wfragen",0)} wfragen, {st.get("grammar",0)} grammar'
                f' — {len(errs)} ERROR, {len(warns)} WARN, {len(infos)} INFO')
        print(head)
        for e in errs:
            print('  ERROR', e)
        for w in warns:
            print('  WARN ', w)
        if not quiet:
            for i in infos:
                print('  INFO ', i)
    sys.exit(1 if total_err else 0)


if __name__ == '__main__':
    main()
