"""Mechanical checks on picks-draft results.  python3 check.py <results dir> [...]"""
import json, re, sys, pathlib, collections

HERE = pathlib.Path(__file__).parent
META = json.loads((HERE / "cases-meta.json").read_text())

# Copied verbatim from docs/specs/prompts/picks-draft.md, "Code checks after parsing", step 2.
BANNED = re.compile(r"\b(he|she|him|her|his|hers|strong|excellent|great|impressive|perfect|ideal|expert|talented|skilled|qualified|senior|junior|fit|match(es|ed)?|best|top|highly|recommend(ed)?|score|percent)\b|%|\d+\s*/\s*\d+", re.I)
# Extra checks from the brief (not in the spec regex)
NUMBER = re.compile(r"\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|several|many|few)\b", re.I)
COMPARE = re.compile(r"\b(other (candidates|people|applicants)|than most|more than|unlike|compared|stands out|above)\b", re.I)
PRAISE = re.compile(r"\b(proven|outstanding|exceptional|solid|extensive|deep|well|successful(ly)?|ahead of schedule|praised|award|named|demonstrat\w*|shows? (that|ability)|capable|able to|ready|meets?|satisf\w*|fulfil\w*|qualif\w*|competen\w*|clear(ly)?)\b", re.I)
SHAPE = re.compile(r"^(The card|This person)\b.*\bwhich relates to\b", re.I)
NON_EN = re.compile(r"[äöåÄÖÅ]|\b(ja|och|kokemus|taito|kunskaper|erfarenhet)\b", re.I)


def check(path):
    r = json.loads(path.read_text())
    cid = r["caseId"]; m = META[cid]
    allowed = {(f"R{a}", f"S{b}") for a, b in m["pairs"]}
    out = {"case": cid, "run": r["run"], "ok": r["ok"], "ms": (r.get("meta") or {}).get("latencyMs"),
           "attempts": (r.get("meta") or {}).get("attempts"), "reasons": [], "hard": [], "soft": []}
    if not r["ok"]:
        out["hard"].append("schema:" + (r.get("error") or "")[:120]); return out
    reasons = r["data"]["reasons"]
    n_pairs = len(allowed)
    want = (2, 3) if n_pairs >= 2 else (1, 1)
    if not (want[0] <= len(reasons) <= want[1]):
        out["hard"].append(f"count {len(reasons)} want {want}")
    reqs = [x["req"] for x in reasons]
    if len(set(reqs)) < len(reqs) and len({a for a, _ in allowed}) >= len(reasons):
        out["soft"].append("same requirement twice though other requirements were available")
    for x in reasons:
        t = x["text"]; flags = []
        if (x["req"], x["signal"]) not in allowed: flags.append("PAIR-NOT-ALLOWED")
        b = BANNED.search(t)
        if b: flags.append(f"REGEX:{b.group(0)}")
        if len(t) > 160: flags.append(f"LEN{len(t)}")
        if not SHAPE.search(t): flags.append("SHAPE")
        n = NUMBER.search(t)
        if n: flags.append(f"num:{n.group(0)}")
        c = COMPARE.search(t)
        if c: flags.append(f"compare:{c.group(0)}")
        p = PRAISE.search(t)
        if p: flags.append(f"judge?:{p.group(0)}")
        ne = NON_EN.search(t)
        if ne: flags.append(f"non-en?:{ne.group(0)}")
        out["reasons"].append((x["req"], x["signal"], t, flags))
        for f in flags:
            (out["hard"] if f.split(":")[0] in ("PAIR-NOT-ALLOWED", "REGEX") or f.startswith("LEN") else out["soft"]).append(f)
    return out


def main():
    rows = []
    for d in sys.argv[1:]:
        for p in sorted(pathlib.Path(d).glob("*.json")):
            if p.name.startswith("_"): continue
            rows.append(check(p))
    hard_ok = 0
    for o in rows:
        status = "OK " if not o["hard"] else "BAD"
        hard_ok += not o["hard"]
        print(f"[{status}] {o['case']}#{o['run']} {o['ms']}ms att={o['attempts']} hard={o['hard']}")
        for req, sig, t, flags in o["reasons"]:
            print(f"    {req},{sig} ({len(t)}) {t}  {flags if flags else ''}")
    lat = sorted(o["ms"] for o in rows if o["ms"])
    print(f"\n{hard_ok}/{len(rows)} outputs pass every hard check (schema, allowed pair, spec regex, <=160 chars, reason count)")
    if lat:
        print("latency p50", lat[len(lat)//2], "p90", lat[min(len(lat)-1, int(0.9*len(lat)))])
    reasons_total = sum(len(o["reasons"]) for o in rows)
    regex_drops = sum(1 for o in rows for _, _, _, f in o["reasons"] if any(x.startswith("REGEX") for x in f))
    print(f"reasons {reasons_total}, would be dropped by spec regex: {regex_drops}")


if __name__ == "__main__":
    main()
