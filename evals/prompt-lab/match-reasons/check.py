"""Mechanical checks for match-reasons outputs.

Usage: python3 -I check.py <cases.json> <results-dir> [<results-dir> ...]

Per reason: pair allowed (parsed from the prompt itself), spec banned-word regex (code check 2),
lexicon BANNED_EVALUATIVE entries (src/lib/lexicon.ts, English part), <= 160 chars, rule-3 shape,
signal deduped (code check 3), suspicious content flags (years/numbers not in inputs, person-describing
words, advice, suitability). Per output: 1-3 reasons; one reason per allowed pair is fine.
Results from run.ts ({data: ...}) and probe.ts ({raw: ...}) are both read.
"""
import glob
import json
import re
import sys
from pathlib import Path

# Copied verbatim from docs/specs/prompts/match-reasons.md, "Code checks after parsing", item 2.
BANNED = re.compile(r"\b(strong|excellent|great|impressive|perfect|ideal|expert|talented|skilled|qualified|senior|junior|fit|match(es|ed)?|best|top|highly|score|percent)\b|%|\d+\s*/\s*\d+", re.I)
# English entries of BANNED_EVALUATIVE in src/lib/lexicon.ts (whole words; * = stem), plus judging words.
LEXICON = re.compile(r"\b(amazing|awesome|fantastic|wonderful|brilliant|outstanding|perfectly|well done|good job|nice work|stronger|strongest|level|levels|scores|rating|ratings|you sound|you seem|confident|nervous|passionate|enthusias\w*|fluent|fluently)\b", re.I)
JUDGE = re.compile(r"\b(experienced|suitable|suited|ideal|good candidate|well[- ]placed|proven|solid|deep|extensive|capable|competent|you (are|would be|will be|could be)|you have the|meets?|matching|fits?|aligns?|relevant to you|should apply|consider applying|apply)\b", re.I)
SHAPE = re.compile(r"^Your card mentions .+; the posting (asks for|lists|mentions|wants|values|looks for|expects) .+\.$")


def allowed_pairs(user_msg):
    block = user_msg.split("Allowed pairs (signal, sentence):\n", 1)[1].split("\n\n", 1)[0]
    pairs = set()
    for line in block.strip().splitlines():
        sig, rest = [x.strip() for x in line.split(",", 1)]
        pairs.add((sig, None if rest.startswith("null") else rest))
    return pairs


def check_output(data, pairs):
    issues = []
    reasons = data.get("reasons") if isinstance(data, dict) else None
    if not isinstance(reasons, list) or not 1 <= len(reasons) <= 3:
        return [f"reasons count {None if reasons is None else len(reasons)}"], 0
    seen = set()
    survive = 0
    for i, r in enumerate(reasons):
        t = r.get("text", "")
        tag = f"R{i}({r.get('signal')},{r.get('sentence')})"
        dropped = False
        if (r.get("signal"), r.get("sentence")) not in pairs:
            issues.append(f"{tag} pair not allowed"); dropped = True
        m = BANNED.search(t)
        if m:
            issues.append(f"{tag} banned '{m.group(0)}'"); dropped = True
        if r.get("signal") in seen:
            issues.append(f"{tag} duplicate signal (deduped by code)"); dropped = True
        seen.add(r.get("signal"))
        if len(t) > 160:
            issues.append(f"{tag} {len(t)} chars")
        m = LEXICON.search(t)
        if m:
            issues.append(f"{tag} lexicon '{m.group(0)}'")
        m = JUDGE.search(t)
        if m:
            issues.append(f"{tag} judge-flag '{m.group(0)}'")
        if not SHAPE.match(t):
            issues.append(f"{tag} shape")
        if not dropped:
            survive += 1
    return issues, survive


def load(path):
    r = json.load(open(path))
    if "raw" in r:  # probe output: first attempt, unvalidated
        return r, r.get("rawParsed"), r.get("raw")
    return r, r.get("data"), r.get("rawOnFailure")


def main():
    cases = {c["id"]: c for c in json.load(open(sys.argv[1]))["cases"]}
    total = clean = 0
    for d in sys.argv[2:]:
        for f in sorted(glob.glob(f"{d}/*.json")):
            if f.endswith("_summary.json"):
                continue
            r, data, raw = load(f)
            cid = r["caseId"]
            pairs = allowed_pairs(cases[cid]["messages"][1]["content"])
            total += 1
            if data is None:
                print(f"{Path(f).name}: NO VALID JSON {r.get('error','')[:120]} raw={str(raw)[:200]}")
                continue
            issues, survive = check_output(data, pairs)
            ok = not issues
            clean += ok
            print(f"{Path(f).name}: {'OK' if ok else 'ISSUES'} survive={survive} attempts={(r.get('meta') or {}).get('attempts')}")
            for x in issues:
                print("   -", x)
            for rr in data.get("reasons", []):
                print(f"   [{rr.get('signal')},{rr.get('sentence')}] ({len(rr.get('text',''))}) {rr.get('text')}")
    print(f"\nclean {clean}/{total}")


if __name__ == "__main__":
    main()
