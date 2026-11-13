"""Builds verify-synth-F2 case files from the trial's cases.json (read-only source).
   python3 -I build.py
"""
import json
from pathlib import Path
HERE = Path(__file__).resolve().parent
src = json.loads((HERE.parent / "cases.json").read_text(encoding="utf8"))
by_id = {c["id"]: c for c in src["cases"]}
head = {k: v for k, v in src.items() if k != "cases"}

OLD6 = "6. At most 14 signals. Prefer things the person described doing over things only named."
NEW6 = ("6. At most 14 signals. Prefer things the person described doing over things only named. "
        "Personality traits and work preferences (\"team player\", \"I like working alone\") are not signals. "
        "A skill the person only names, with nothing they did, gets the rendering \"They list <phrase> as a skill.\"")
OLDR4 = "R4. No praise, levels, years, durations, or comparisons."
NEWR4 = "R4. No praise, levels, years, durations, or comparisons. Never write \"strength\"."
# maxSignals is 8 in express mode; the template line differs per case
def fix(sys_prompt):
    import re
    m = re.search(r"6\. At most (\d+) signals\. Prefer things the person described doing over things only named\.", sys_prompt)
    assert m, "task 6 not found"
    n = m.group(1)
    sys_prompt = sys_prompt.replace(m.group(0), NEW6.replace("14", n, 1))
    assert sys_prompt.count(OLDR4) == 1
    return sys_prompt.replace(OLDR4, NEWR4)

def write(name, ids, transform=None):
    cases = []
    for i in ids:
        c = json.loads(json.dumps(by_id[i]))
        if transform:
            c["messages"][0]["content"] = transform(c["messages"][0]["content"])
        cases.append(c)
    (HERE / name).write_text(json.dumps({**head, "cases": cases}, ensure_ascii=False, indent=2), encoding="utf8")

TARGET = ["en-exp-buzzwords", "sv-exp-noroles"]
REGR = ["en-exp-thin", "sv-full-teacher", "fi-full-noroles-clean"]
write("cases-baseline.json", TARGET)
write("cases-fix.json", TARGET + REGR, fix)

# Realistic production input: the extractor spec (turn-extractor rule 6) records nothing for buzzwords.
c = json.loads(json.dumps(by_id["en-exp-buzzwords"]))
u = c["messages"][1]["content"]
start = u.index("DRAFT NOTES (id | kind | phrase | evidence):\n") + len("DRAFT NOTES (id | kind | phrase | evidence):\n")
end = u.index("\n\nReturn the JSON now.")
c["messages"][1]["content"] = u[:start] + "(none)" + u[end:]
c["id"] = "en-exp-buzzwords-nodrafts"
(HERE / "cases-nodrafts.json").write_text(json.dumps({**head, "cases": [c]}, ensure_ascii=False, indent=2), encoding="utf8")
print("ok")
