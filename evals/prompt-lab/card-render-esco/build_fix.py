# Variant of prompt B with the proposed wording fixes (fix id B1). Writes cases-fix-B1.json.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_cases as bc

REPL = [
    ('If it is already English, return it unchanged except for removing quality words.',
     'If it is already English, return it unchanged except for removing quality words and any names of employers, schools, people, cities, regions or countries. Skills read as activities ("Driving forklifts"), not job titles.'),
    ('R4. No praise, levels, years, durations, or comparisons.',
     'R4. No praise, levels, years, durations, or comparisons, and no claims about how well they did it (such as "without accidents" or "always on time").'),
    ('R7. Never mention the interview, speaking, typing, translation, accent or language.',
     'R7. Never mention the interview or how the person spoke or typed: no speaking, typing, accent or interview language. If their work was translating or interpreting, say so, and write "between two languages" instead of naming the languages.'),
]
system = bc.B_SYSTEM
for old, new in REPL:
    assert system.count(old) == 1, old
    system = system.replace(old, new)

expected = json.load(open(os.path.join(bc.HERE, 'expected.json')))
rows = [r for r in bc.B + bc.B2 if r[0] in ('b-en-04', 'b-en-09', 'b-en-03', 'b-sv-07')]
cases = bc.build_b(rows, {"B": {}, "C": {}}, system)
for c in cases: c['id'] = 'fix-B1-' + c['id']
bc.dump('cases-fix-B1.json', 'card-render-fix-B1', 'analyst', 800, 0.2, cases)
