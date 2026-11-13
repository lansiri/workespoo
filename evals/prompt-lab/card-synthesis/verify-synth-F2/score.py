"""Scores synth-F2 criteria. python3 -I score.py <resultsDir>
Uses data when ok, else rawOnFailure (marked raw) if it parses."""
import json, re, sys
from pathlib import Path
TRAIT = re.compile(r"communicat|problem|leader|team|people person|motivat|customer (service )?excellence|customer focus|collaborat", re.I)
PERSONALITY = re.compile(r"team player|people person|motivated|results-driven|passion|thrive|extra mile|self-motivated|driven", re.I)
PRAISE = re.compile(r"strength|excellen|key\b", re.I)
PREF = re.compile(r"independen|autonom|supervis|on their own|alone", re.I)
for f in sorted(Path(sys.argv[1]).glob("*.json")):
    if f.name.startswith("_"): continue
    r = json.loads(f.read_text())
    d, src = r.get("data"), "ok"
    if not r["ok"]:
        try: d, src = json.loads(r.get("rawOnFailure") or ""), "RAW"
        except Exception: d, src = None, "FAIL"
    if d is None:
        print(f"{f.name:40} {src} {r.get('error','')[:80]}"); continue
    texts = [d.get("headline",""), d.get("summary","")] + [s["phrase"]+" | "+s["rendering"] for s in d["signals"]]
    sig = d["signals"]
    traits = [s["phrase"] for s in sig if TRAIT.search(s["phrase"])]
    pers = [t for t in texts if PERSONALITY.search(t)]
    praise = [t for t in texts if PRAISE.search(t)]
    pref = [s["phrase"]+" -> "+s["rendering"] for s in sig if PREF.search(s["phrase"]+" "+s["rendering"]) or "s5" in s["from"] and r["caseId"].startswith("sv-exp")]
    lat = (r.get("meta") or {}).get("latencyMs"); att = (r.get("meta") or {}).get("attempts")
    print(f"{f.name:40} {src} att={att} lat={lat} n={len(sig)} traits={len(traits)} personality={len(pers)} praise={len(praise)} pref={len(pref)} H={d.get('headline')!r}")
    for x in pers + praise + pref: print("     !", x[:160])
    for s in sig: print("      *", s["phrase"], "->", s["rendering"][:120])
