"""Variant fix-length: rule 3 asks for at most 130 characters (the schema and code still allow 160)."""
import json
OLD = "3. Write 1 to 3 reasons. Each reason is one sentence, at most 160 characters, in this shape:"
NEW = "3. Write 1 to 3 reasons. Each reason is one sentence, at most 130 characters, in this shape:"
d = json.load(open("cases.json"))
keep = {"en-trapwords-08", "sv-care-12", "fi-mustpartial-05"}
d["cases"] = [c for c in d["cases"] if c["id"] in keep]
for c in d["cases"]:
    s = c["messages"][0]["content"]
    assert OLD in s
    c["messages"][0]["content"] = s.replace(OLD, NEW)
d["item"] = "match-reasons-fix-length"
json.dump(d, open("cases-fix-length.json", "w"), ensure_ascii=False, indent=2)
print(len(d["cases"]))
