# Approximate pg_trgm similarity over fixtures/esco/subset.json to pick realistic candidates.
import json, re, sys
d = json.load(open('fixtures/esco/subset.json'))
skills = [c for c in d['concepts'] if c['type'] == 'skill' and not c['retired']]
def tg(s):
    out = set()
    for w in re.findall(r'[\w]+', s.lower()):
        w = '  ' + w + ' '
        for i in range(len(w) - 2): out.add(w[i:i+3])
    return out
def sim(a, b):
    A, B = tg(a), tg(b)
    return len(A & B) / len(A | B) if A | B else 0
for q in sys.argv[1:]:
    lang = 'en'
    if q.startswith('fi:'): lang, q = 'fi', q[3:]
    rows = []
    for c in skills:
        s = sim(q, c['labelEn'])
        if lang == 'fi': s = max(s, sim(q, c['labelFi'] or ''))
        rows.append((s, c))
    rows.sort(key=lambda r: -r[0])
    print('==', q, lang)
    for s, c in rows[:8]: print(f"  {s:.2f} | {c['labelEn']} | {c['labelFi']}")
