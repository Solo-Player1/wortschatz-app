#!/usr/bin/env python3
"""Refresh tools/lessons_index.json (ordered list of all Nicos Weg lessons) from the DW course hub."""
import io, json, os, re, sys, urllib.request
TOOLS = os.path.dirname(os.path.abspath(__file__))
HUB = 'https://learngerman.dw.com/ar/nicos-weg/c-36519911'
src = sys.argv[1] if len(sys.argv) > 1 else None
if src and os.path.exists(src):
    s = io.open(src, encoding='utf-8').read()
else:
    req = urllib.request.Request(HUB, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    s = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
d = json.loads(re.search(r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\});\s*', s, re.S).group(1))
course = [v for v in d.values() if isinstance(v, dict) and v.get('__typename') == 'Course'][0]
links = course['contentLinks({"targetTypes":"LESSON"})']
out = []
for i, l in enumerate(links, 1):
    t = d[d[l['__ref']]['target']['__ref']]
    out.append({'n': i, 'id': str(t['id']), 'url': t['namedUrl'], 'title': (lambda x: (x[1:].strip()+x[0]) if re.match(r'^[.!?]',x) and not re.search(r'[.!?]$',x) else x)(t['shortTitle'].strip()),
                'goal': t.get('learningTargetHeadline') or '', 'gram': t.get('grammarDescription') or ''})
io.open(os.path.join(TOOLS, 'lessons_index.json'), 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1))
print(f'index: {len(out)} lessons')
