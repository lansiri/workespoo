"""Rule-4 outcome-judgement check for picks-draft results. python3 judge.py <dir>..."""
import json, re, sys, pathlib
BANNED = re.compile(r"\b(he|she|him|her|his|hers|strong|excellent|great|impressive|perfect|ideal|expert|talented|skilled|qualified|senior|junior|fit|match(es|ed)?|best|top|highly|recommend(ed)?|score|percent)\b|%|\d+\s*/\s*\d+", re.I)
OUTCOME = re.compile(r"ahead of schedule|on time|on schedule|prais\w*|best[- ]perform\w*|named|award\w*|recogni[sz]\w*|success\w*|CEO|of the year", re.I)
for d in sys.argv[1:]:
    fails = 0; n = 0
    for p in sorted(pathlib.Path(d).glob("*.json")):
        if p.name.startswith("_"): continue
        r = json.loads(p.read_text()); n += 1
        m = r.get("meta") or {}
        bad = []
        print(f"{p.name} ok={r['ok']} ms={m.get('latencyMs')} att={m.get('attempts')}" + ("" if r["ok"] else " ERR " + str(r.get("error"))[:200]))
        for x in (r.get("data") or {}).get("reasons", []):
            o = OUTCOME.search(x["text"]); b = BANNED.search(x["text"])
            flags = ([f"OUTCOME:{o.group(0)}"] if o else []) + ([f"REGEX:{b.group(0)}"] if b else []) + ([f"LEN{len(x['text'])}"] if len(x['text'])>160 else [])
            if o: bad.append(o.group(0))
            print(f"   {x['req']},{x['signal']} ({len(x['text'])}) {x['text']} {flags or ''}")
        fails += bool(bad)
    print(f"== {d}: {fails}/{n} runs with an outcome judgement kept\n")
