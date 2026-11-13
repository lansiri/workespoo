# Builds the verification cases for finding render-B1a. Run with: python3 -B build.py
# orig.json: b-en-09 with prompt B verbatim from the spec.
# fix.json:  b-en-09 + regression cases (b-sv-07, b-en-08, b-fi-01) with ONLY the R7 line replaced (the finding's fixPatch).
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import build_cases as bc

OLD = "R7. Never mention the interview, speaking, typing, translation, accent or language."
NEW = 'R7. Never mention the interview or how the person spoke or typed: no speaking, typing, accent or interview language. If their work was translating or interpreting, say so, and write "between two languages" instead of naming the languages.'
assert bc.B_SYSTEM.count(OLD) == 1
FIX = bc.B_SYSTEM.replace(OLD, NEW)

rows = {r[0]: r for r in bc.B + bc.B2}
exp = {"B": {}, "C": {}}
orig = bc.build_b([rows["b-en-09"]], exp)
fix = bc.build_b([rows[k] for k in ("b-en-09", "b-sv-07", "b-en-08", "b-fi-01")], exp, FIX)
for c in fix: c["id"] = "fix-" + c["id"]
def dump(name, item, cases):
    json.dump({"item": item, "role": "analyst", "schema": None, "maxTokens": 800, "temperature": 0.2, "cases": cases},
              open(os.path.join(HERE, name), "w"), ensure_ascii=False, indent=1)
dump("orig.json", "card-render-verify-B1a", orig)
dump("fix.json", "card-render-verify-B1a-fix", fix)
json.dump(exp, open(os.path.join(HERE, "expected.json"), "w"), ensure_ascii=False, indent=1)
# Baseline for the regression check: b-en-08 with the original prompt.
dump("orig-08.json", "card-render-verify-B1a", bc.build_b([rows["b-en-08"]], {"B": {}, "C": {}}))
