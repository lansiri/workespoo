"""Mechanical check for finding extractor-F2: are phrases and note English?

  python3 lang_check.py <case-file.json> <results-dir>

A phrase or note is counted non-English if it has a/o/a-with-marks, a common Finnish or Swedish
function word, or a word sharing a 5-letter stem with a lower-case word in the person's own
(non-English) sentences. Proper nouns from the source (e.g. "Procountor") are allowed.
"""
import json, os, re, sys

cases = {c["id"]: c for c in json.load(open(sys.argv[1]))["cases"]}
rdir = sys.argv[2]
FUNC = re.compile(r"\b(ja|ei|on|kysy|ja|sekä|tai|och|med|för|fråga|att|är|som)\b", re.I)


def stems(case):
    user = case["messages"][-1]["content"]
    block = user.split("PERSON'S SENTENCES:")[1].split("KNOWN SIGNALS")[0]
    out = set()
    for line in block.splitlines():
        words = re.findall(r"[\wäöåÄÖÅ-]+", re.sub(r"^\[T\d+\.S\d+\]", "", line))
        for i, w in enumerate(words):
            if i > 0 and w[:1].isupper():
                continue  # proper noun
            if len(w) >= 5:
                out.add(w.lower()[:5])
    return out


def non_en(text, st):
    if re.search(r"[äöåÄÖÅ]", text) or FUNC.search(text):
        return True
    return any(len(w) >= 5 and w.lower()[:5] in st for w in re.findall(r"[\w-]+", text))


tot = {"runs": 0, "phrase_fail": 0, "note_fail": 0, "any_fail": 0, "invalid": 0}
lat = []
for f in sorted(os.listdir(rdir)):
    if not f.endswith(".json") or f.startswith("_"):
        continue
    r = json.load(open(os.path.join(rdir, f)))
    tot["runs"] += 1
    if not r["ok"]:
        tot["invalid"] += 1
        print(f"INVALID {f}: {str(r.get('error'))[:120]}")
        continue
    d, c = r["data"], cases[r["caseId"]]
    st = stems(c) if d["lang"] != "en" else set()
    bad_p = [s["phrase"] for s in d["signals"] if non_en(s["phrase"], st)]
    bad_n = non_en(d["note"], st)
    tot["phrase_fail"] += bool(bad_p)
    tot["note_fail"] += bad_n
    tot["any_fail"] += bool(bad_p) or bad_n
    lat.append(r["meta"]["latencyMs"])
    print(f"{'FAIL' if (bad_p or bad_n) else 'ok  '} {f} lang={d['lang']} attempts={r['meta'].get('attempts')} {r['meta']['latencyMs']}ms")
    print(f"     phrases={[s['phrase'] for s in d['signals']]} flags={d['flags']}")
    print(f"     note={d['note']!r} ({len(d['note'].split())} words)")
    if bad_p:
        print(f"     NON-EN phrases: {bad_p}")
    if bad_n:
        print("     NON-EN note")
lat.sort()
print(json.dumps(tot), "latency p50", lat[len(lat) // 2] if lat else None, "max", lat[-1] if lat else None)
