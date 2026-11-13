"""Tabulate latency / attempts / tokens / failures for a results dir. Usage: python3 -I lens.py <dir> [maxTokens]"""
import glob, json, sys

d = sys.argv[1]
cap = int(sys.argv[2]) if len(sys.argv) > 2 else 1800
rows = []
for f in sorted(glob.glob(d + "/*.json")):
    if f.endswith("_summary.json"):
        continue
    r = json.load(open(f))
    m = r.get("meta") or {}
    err = r.get("error") or ""
    kind = "ok" if r["ok"] else ("429" if "429" in err else "timeout" if "timed out" in err else "network" if "network" in err else "invalid")
    rows.append((f.split("/")[-1], kind, m.get("latencyMs"), m.get("attempts"), m.get("tokensOut")))
    print(f"{rows[-1][0]:32} {kind:8} lat={m.get('latencyMs')} att={m.get('attempts')} out={m.get('tokensOut')} {err[-70:] if not r['ok'] else ''}")
n = len(rows)
fails = [x for x in rows if x[1] != "ok"]
single = [x[2] for x in rows if x[1] == "ok" and x[3] == 1]
retried = [x for x in rows if (x[3] or 1) > 1]
toks = [x[4] for x in rows if x[4]]
print(f"\ncalls={n} failed={len(fails)} ({', '.join(x[1] for x in fails)}) needed_retry={len(retried)}")
if single:
    s = sorted(single)
    print(f"single-attempt ok latency ms: min={s[0]} median={s[len(s)//2]} max={s[-1]} n={len(s)}  >25s: {sum(v>25000 for v in s)}")
if toks:
    print(f"tokensOut max={max(toks)} ({max(toks)/cap:.0%} of {cap}); >=90% cap: {sum(t>=0.9*cap for t in toks)}")
