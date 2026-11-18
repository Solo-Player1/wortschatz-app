#!/usr/bin/env python3
"""Validate content/verbs.json (+ content/wwords.json) before tools/build_content.py.

  python tools/check_verbs.py            # everything
  python tools/check_verbs.py --quiet    # summary + ERROR/WARN only

ERROR = must fix (wrong German form, broken entry).  WARN = should fix (type label, coverage, first lesson).
INFO  = examples with words outside the vocabulary rule of the verb's lesson — GUESSED like check_content.py
        (names, correct participles, declined adjectives can be false alarms). Exit code 1 if any ERROR.

The Präsens check is rule-based (regular endings, -est/-et after t/d/consonant+m/n, du -t after s/ß/x/z, -eln/-ern,
separable particle at the end, a table of strong-verb vowel changes and of sein/haben/werden/wissen/tun/modals):
a mismatch means "look at it", the rules can't know every verb.
"""
import glob, io, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_content as C

ROOT = C.ROOT
P = ['ich', 'du', 'er', 'wir', 'ihr', 'sie']
TYPES = {'regular', 'irregular', 'modal', 'separable', 'mixed'}
TABLES = {
    'sein': 'bin bist ist sind seid sind', 'haben': 'habe hast hat haben habt haben',
    'werden': 'werde wirst wird werden werdet werden', 'wissen': 'weiß weißt weiß wissen wisst wissen',
    'tun': 'tue tust tut tun tut tun', 'können': 'kann kannst kann können könnt können',
    'müssen': 'muss musst muss müssen müsst müssen', 'dürfen': 'darf darfst darf dürfen dürft dürfen',
    'sollen': 'soll sollst soll sollen sollt sollen', 'wollen': 'will willst will wollen wollt wollen',
    'mögen': 'mag magst mag mögen mögt mögen', 'möchten': 'möchte möchtest möchte möchten möchtet möchten',
}
VOWEL_CHANGE = {   # Präsens du, er
    'fahren': 'fährst fährt', 'schlafen': 'schläfst schläft', 'laufen': 'läufst läuft', 'tragen': 'trägst trägt',
    'waschen': 'wäschst wäscht', 'braten': 'brätst brät', 'halten': 'hältst hält', 'fallen': 'fällst fällt',
    'lassen': 'lässt lässt', 'lesen': 'liest liest', 'sehen': 'siehst sieht', 'nehmen': 'nimmst nimmt',
    'geben': 'gibst gibt', 'essen': 'isst isst', 'vergessen': 'vergisst vergisst', 'treffen': 'triffst trifft',
    'sprechen': 'sprichst spricht', 'helfen': 'hilfst hilft', 'empfehlen': 'empfiehlst empfiehlt',
    'sterben': 'stirbst stirbt', 'werfen': 'wirfst wirft', 'laden': 'lädst lädt', 'raten': 'rätst rät',
    'schlagen': 'schlägst schlägt', 'fangen': 'fängst fängt', 'stoßen': 'stößt stößt', 'brechen': 'brichst bricht',
    'wachsen': 'wächst wächst', 'befehlen': 'befiehlst befiehlt', 'stehlen': 'stiehlst stiehlt', 'messen': 'misst misst',
    'treten': 'trittst tritt', 'gelten': 'giltst gilt',
}
BOTH = {'backen': [('backst', 'backt'), ('bäckst', 'bäckt')]}          # both forms are standard
STRONG = set('''gehen kommen schreiben fliegen heißen helfen sprechen trinken nehmen essen geben lesen sehen fahren
schlafen laufen tragen waschen backen braten halten fallen finden stehen sitzen liegen singen beginnen gewinnen
schwimmen bleiben frieren gießen schneiden streiten scheinen treffen vergessen rufen treiben biegen schießen springen
verlieren leiden steigen ziehen tun sein werden haben wissen empfehlen raten lassen fangen leihen bitten genießen
riechen schieben verbieten hängen sterben werfen laden schlagen stoßen brechen wachsen schließen fließen greifen
pfeifen reiten schreien schweigen befehlen stehlen messen treten heben lügen wiegen gelten'''.split())
STRONG |= set(VOWEL_CHANGE) | {'gleichen', 'scheiden'}
MIXED = set('kennen denken bringen nennen rennen brennen senden wenden'.split())
MODAL = set('können müssen dürfen sollen wollen mögen möchten'.split())
INSEP = ('be', 'ge', 'er', 'ver', 'emp', 'ent', 'zer', 'miss', 'über', 'unter', 'wieder', 'hinter')
REFL = re.compile(r'\s+(mich|dich|sich|uns|euch|mir|dir)\b')
# the reflexive pronoun that belongs to each person (accusative / dative)
REFL_OK = {'ich': {'mich', 'mir'}, 'du': {'dich', 'dir'}, 'er': {'sich'}, 'wir': {'uns'}, 'ihr': {'euch'}, 'sie': {'sich'}}


def regular(base):
    if base.endswith(('eln', 'ern')):
        stem = base[:-1]
        ich = (stem[:-2] + 'le') if base.endswith('eln') else stem + 'e'
        return [ich, stem + 'st', stem + 't', base, stem + 't', base]
    stem = base[:-2] if base.endswith('en') else base[:-1]
    # -e- after t/d and after consonant + m/n (atmen, öffnen, regnen, zeichnen: «ch» is a consonant), not after l/r/h/m/n
    ins = bool(re.search(r'[td]$', stem) or re.search(r'(?:[^aeiouäöülrhmn]|ch)[mn]$', stem))
    du = stem + ('est' if ins else 't' if re.search(r'(s|ß|x|z)$', stem) else 'st')
    er = stem + ('et' if ins else 't')
    return [stem + 'e', du, er, base, er, base]


def predict(base):
    if base in TABLES:
        return [TABLES[base].split()]
    for key in [base] + [base[len(p):] for p in INSEP if base.startswith(p) and len(base) > len(p) + 3]:
        if key in VOWEL_CHANGE:
            pre = base[:len(base) - len(key)]
            du, er = VOWEL_CHANGE[key].split()
            f = regular(base)
            f[1], f[2] = pre + du, pre + er
            return [f]
    out = [regular(base)]
    for du, er in BOTH.get(base, []):
        f = regular(base); f[1], f[2] = du, er; out.append(f)
    if base.endswith('eln'):
        out.append([base[:-1] + 'e'] + regular(base)[1:])      # ich angele (also standard)
    return out


def split_forms(v):
    forms = [REFL.sub('', str(v['forms'][p])).strip() for p in P]
    parts = [f.split('…') for f in forms]
    particle = parts[0][1].strip() if len(parts[0]) > 1 else ''
    return forms, parts, particle


def form_problem(v):
    forms, parts, particle = split_forms(v)
    if particle and any((p[1].strip() if len(p) > 1 else None) != particle for p in parts):
        return f'separable particle differs between persons: {forms}'
    inf = v['inf'].replace('|', '')
    if particle and not inf.startswith(particle):
        return f'particle «{particle}» is not the start of «{inf}»'
    base = inf[len(particle):] if particle else inf
    got = [p[0].strip() for p in parts]
    cands = predict(base)
    if any(got == c for c in cands):
        return None
    return f'forms {got} — rules predict {cands[0]}'


def expected_type(v):
    _, _, particle = split_forms(v)
    inf = v['inf']
    base = inf[len(particle):] if particle and inf.startswith(particle) else inf
    core = base
    for p in INSEP:
        if base.startswith(p) and base[len(p):] in STRONG | MIXED:
            core = base[len(p):]
    if core.endswith('stehen'):
        core = 'stehen'
    return 'separable' if particle else 'modal' if base in MODAL else 'mixed' if core in MIXED else 'irregular' if core in STRONG else 'regular'


def main():
    quiet = '--quiet' in sys.argv
    words = C.load(os.path.join(ROOT, 'www', 'data', 'lessons.json'))['words']
    verbs = C.load(os.path.join(ROOT, 'content', 'verbs.json')).get('verbs', [])
    wwords = C.load(os.path.join(ROOT, 'content', 'wwords.json')).get('wwords', [])
    err, warn, info = [], [], []
    seen = {}
    dw_separable = {}                         # einkaufen → «ein|kaufen» (DW's own separable mark)
    for w in words:
        if w.get('k') != 'noun':
            core = re.sub(r'\([^)]*\)', ' ', w.get('de', '')).strip().split()
            if core and '|' in core[-1]:
                dw_separable[core[-1].replace('|', '').lower()] = core[-1]
    for v in verbs:
        inf = str(v.get('inf', ''))
        if inf.lower() in seen:
            err.append(f'{inf}: duplicate entry')
        seen[inf.lower()] = v
        if set(v.get('forms') or {}) != set(P) or not all(str(v['forms'][p]).strip() for p in P):
            err.append(f'{inf}: forms must have exactly {P}'); continue
        if v.get('type') not in TYPES:
            err.append(f'{inf}: type {v.get("type")!r} not in {sorted(TYPES)}')
        if not isinstance(v.get('lesson'), int) or not 1 <= v['lesson'] <= 76:
            err.append(f'{inf}: lesson {v.get("lesson")!r}')
        if not v.get('examples') or not all(e.get('de') and e.get('ar') for e in v['examples']):
            err.append(f'{inf}: examples need de + ar')
        fp = form_problem(v)
        if fp:
            err.append(f'{inf}: {fp}')
        elif v.get('type') in TYPES and v['type'] != expected_type(v):
            warn.append(f'{inf}: type {v["type"]} — expected {expected_type(v)} (kennen = mixed, gehen = irregular, separable wins)')
        for pk in P:                          # a reflexive pronoun in a form must belong to that person
            for pron in re.findall(r'\s(mich|dich|sich|uns|euch|mir|dir)\b', ' ' + str(v['forms'][pk])):
                if pron not in REFL_OK[pk]:
                    err.append(f'{inf}: «{v["forms"][pk]}» — {pk} takes {"/".join(sorted(REFL_OK[pk]))}, not {pron}')
        if inf.lower() in dw_separable and not split_forms(v)[2]:
            err.append(f'{inf}: DW marks it separable ({dw_separable[inf.lower()]}) but the forms are not split with «…»')
        n = v['lesson'] if isinstance(v.get('lesson'), int) else 99
        allow = C.allowed_vocab(n, words, verbs)
        for e in v.get('examples') or []:
            bad = C.unknown_tokens(e.get('de', ''), allow)
            if bad:
                info.append(f'{inf} (L{n}): «{e["de"]}» — outside the vocabulary rule? {bad}')
    # coverage: every verb-like DW word has an entry, with the right first lesson
    first = {}
    for w in words:
        if C.is_verb(w):
            parts = C.clean_entry(w['de']).replace('|', '').split()
            if parts:
                first[parts[-1].lower()] = min(first.get(parts[-1].lower(), 99), min(w['lessons']))
    for inf, n in sorted(first.items(), key=lambda x: x[1]):
        if inf not in seen:
            warn.append(f'DW verb «{inf}» (lesson {n}) has no entry')
        elif isinstance(seen[inf].get('lesson'), int) and seen[inf]['lesson'] > n:   # earlier is fine: sein/haben… are used in phrases before DW lists them
            warn.append(f'{inf}: lesson {seen[inf]["lesson"]} but DW teaches it already in lesson {n}')
    # every verb:<inf> focus tag of the lessons has an entry
    for p in sorted(glob.glob(os.path.join(ROOT, 'content', 'L*.json'))):
        for m in set(re.findall(r'"verb:([^"]+)"', io.open(p, encoding='utf-8').read())):
            if m.lower() not in seen:
                warn.append(f'{os.path.basename(p)}: focus tag verb:{m} has no verbs.json entry')
    # question words
    wseen = set()
    for w in wwords:
        k = str(w.get('w', '')).strip().lower()
        if k in wseen:
            err.append(f'question word {w.get("w")}: duplicate')
        wseen.add(k)
        if not (w.get('ar') and w.get('examples') and isinstance(w.get('lesson'), int)):
            err.append(f'question word {w.get("w")}: needs ar, lesson, examples')
    print(f'verbs.json: {len(verbs)} verbs · wwords.json: {len(wwords)} question words — '
          f'{len(err)} ERROR, {len(warn)} WARN, {len(info)} INFO')
    for tag, items in (('ERROR', err), ('WARN ', warn)) + ((('INFO ', info),) if not quiet else ()):
        for x in items:
            print(f'  {tag} {x}')
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
