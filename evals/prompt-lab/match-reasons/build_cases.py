"""Builds cases.json for match-reasons from the spec's verbatim system message and user template.

Posting sentences come from sentences.json (the product's own split of fixtures/jobs/tmt-sample.json).
P labels are P<0-based sentence index>, matching JobMatchReason.postingSentence.
Allowed pairs are hand-computed per docs/specs/matching.md 2.3 (Need Card requirement touched by the
signal, or ESCO skill + trigram sentence, or null with the ESCO label).

Usage: python3 build_cases.py [variant]   (variant: name of a system-message patch in PATCHES below)
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SPEC = (ROOT / "docs/specs/prompts/match-reasons.md").read_text()
SYSTEM = re.search(r"## System message \(verbatim\)\n\n```\n(.*?)\n```", SPEC, re.S).group(1)
POSTINGS = json.loads((HERE / "sentences.json").read_text())


def user_message(posting_key, signals, pairs, title=None):
    p = POSTINGS[posting_key]
    cited = sorted({s for _, s in pairs if isinstance(s, int)})
    lines = [f"Posting title: {title or p['title']}", "", "Your card (signals):"]
    lines += [f"{sid}: {phrase}. {rendering}" for sid, phrase, rendering in signals]
    lines += ["", "Posting sentences you may cite:"]
    lines += [f"P{i}: {p['sentences'][i]}" for i in cited]
    lines += ["", "Allowed pairs (signal, sentence):"]
    for sig, sen in pairs:
        lines.append(f"{sig}, P{sen}" if isinstance(sen, int) else f"{sig}, null (ESCO: {sen['esco']})")
    lines += ["", 'Return JSON: {"reasons": [{"signal": "S1", "sentence": "P4", "text": "..."}]}']
    return "\n".join(lines)


CASES = [
    dict(id="en-obvious-01", posting="4", notes="One obviously related pair (React). Unrelated S2 has no pair.",
         signals=[("S1", "React front-end development", "They built screens for a booking web app in React and connected them to a REST API."),
                  ("S2", "Customer support", "They answered customer questions by chat and email at a software company.")],
         pairs=[("S1", 22)]),
    dict(id="en-three-02", posting="4", notes="Three allowed pairs, all genuine.",
         signals=[("S1", "React front-end development", "They built screens for a booking web app in React."),
                  ("S2", "PostgreSQL databases", "They designed tables and wrote SQL queries in PostgreSQL for an order system."),
                  ("S3", "CI/CD pipelines", "They set up GitHub Actions pipelines that test and deploy code automatically.")],
         pairs=[("S1", 22), ("S2", 37), ("S3", 24)]),
    dict(id="fi-en-03", posting="22", notes="Finnish posting, English signals; reasons must render the Finnish sentences correctly (forklift or electric order pickers; picking and shelving tyres).",
         signals=[("S1", "Forklift driving", "They drove a counterbalance forklift to load and unload pallets at a warehouse."),
                  ("S2", "Order picking", "They picked customer orders from warehouse shelves using a handheld scanner.")],
         pairs=[("S1", 15), ("S2", 8)]),
    dict(id="fi-weak-04", posting="23", notes="S1,P9 is tangential (till cash vs independent bookkeeping able to cover the head bookkeeper): honest reason is modest. S2,P5 genuine.",
         signals=[("S1", "Cash handling", "They counted the till and recorded the daily cash takings at a cafe."),
                  ("S2", "Customer service by phone", "They answered customer calls and emails about bills at an energy company.")],
         pairs=[("S1", 9), ("S2", 5)]),
    dict(id="fi-mustpartial-05", posting="36", notes="P9 is a must-have (solid cook experience AND leading the kitchen); S1 speaks to cooking only, not leading. Tempting 'strong'. S2,P10 hygiene passport genuine.",
         signals=[("S1", "Cooking school lunches", "They cooked lunches for about 60 people a day in a school kitchen, following set menus."),
                  ("S2", "Food hygiene rules", "They hold a hygiene passport and follow food safety rules when storing and serving food.")],
         pairs=[("S1", 9), ("S2", 10)]),
    dict(id="fi-trade-06", posting="17", notes="Practical trade: tiling, waterproofing, safety card. Three pairs.",
         signals=[("S1", "Tiling bathrooms", "They laid wall and floor tiles in bathroom renovations in apartment buildings."),
                  ("S2", "Waterproofing wet rooms", "They applied waterproofing membranes to bathroom floors and walls before tiling."),
                  ("S3", "Occupational safety card", "They hold the Finnish occupational safety card (Työturvallisuuskortti).")],
         pairs=[("S1", 7), ("S2", 12), ("S3", 5)]),
    dict(id="fi-onepair-07", posting="26", notes="Only one allowed pair; output must have exactly one reason and not use S2/S3.",
         signals=[("S1", "Installing door locks", "They installed and repaired door locks and access control readers in apartment buildings."),
                  ("S2", "Delivery driving", "They drove a delivery van on fixed routes around Espoo and Vantaa."),
                  ("S3", "Customer service", "They served customers at the counter of a hardware store.")],
         pairs=[("S1", 4)]),
    dict(id="en-trapwords-08", posting="40", notes="Trap: P0 says 'experienced', P2 says 'At least five years'. Must not say experienced/match/fit or imply five years. P6 is a sentence fragment from the split.",
         signals=[("S1", "Android app development", "They built and published two Android apps in Kotlin for a small retail chain."),
                  ("S2", "Biometric login", "They added fingerprint login to an Android app using the phone's secure key storage.")],
         pairs=[("S1", 0), ("S1", 2), ("S2", 6)]),
    dict(id="en-trapwords-09", posting="4", notes="Trap: both sentences start with 'Strong'. Spec example shows dropping it.",
         signals=[("S1", "TypeScript and Node.js", "They wrote back-end services in TypeScript on Node.js for an online shop."),
                  ("S2", "Troubleshooting production issues", "They traced errors in a live system back to their cause using logs and fixed them.")],
         pairs=[("S1", 21), ("S2", 39)]),
    dict(id="fi-unrelated-10", posting="31", notes="Pairs do not really relate: data cleaning in Excel vs building cleaning (word collision). Inventing a connection would be wrong.",
         signals=[("S1", "Cleaning data in Excel", "They removed duplicates and fixed errors in customer spreadsheets in Excel."),
                  ("S2", "Report writing", "They wrote monthly sales reports for their team.")],
         pairs=[("S1", 10), ("S1", 17)]),
    dict(id="sv-nurse-11", posting="14sv", notes="Swedish posting sentences. P13 also asks for fluent Finnish: must not claim the person has it.",
         signals=[("S1", "Wound care", "They cleaned and dressed wounds for patients in a home care team."),
                  ("S2", "Phone triage", "They answered patient calls and booked appointments based on how urgent the need was."),
                  ("S3", "Electronic patient records", "They wrote care notes in an electronic patient record system.")],
         pairs=[("S2", 3), ("S3", 13), ("S1", 2)]),
    dict(id="sv-care-12", posting="13sv", notes="Swedish posting; care worker. P13 is nice-to-have, P10 is expected.",
         signals=[("S1", "Supporting residents in a group home", "They helped adults who need daily assistance with meals, hygiene and daily routines in a group home."),
                  ("S2", "Handling difficult situations", "They calmed residents during conflicts and reported incidents to the nurse on duty.")],
         pairs=[("S1", 13), ("S2", 10)]),
    dict(id="fi-nullesco-13", posting="36", notes="One pair has no sentence (null, ESCO label). Reason must not invent a posting sentence.",
         signals=[("S1", "Baking bread", "They baked bread and pastries every morning in a bakery cafe."),
                  ("S2", "Catering for events", "They prepared food for weddings and company events at a catering firm.")],
         pairs=[("S1", {"esco": "use food preparation techniques"}), ("S2", 13)]),
    dict(id="fi-en-14", posting="0", notes="Finnish posting with English signals. P21 asks for strong Node.js/TypeScript plus Python, C# or Java: Python is one option. P24 is basic cloud knowledge.",
         signals=[("S1", "Python data pipelines", "They built Python scripts that load sensor data into a database every night."),
                  ("S2", "Azure deployments", "They deployed web services to Azure and kept them running.")],
         pairs=[("S1", 21), ("S2", 24)]),
]


def build(system):
    cases = []
    for c in CASES:
        cases.append({
            "id": c["id"],
            "notes": c["notes"],
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_message(c["posting"], c["signals"], c["pairs"])},
            ],
        })
    return {"item": "match-reasons", "role": "analyst", "schema": "MatchReasonsOutput", "temperature": 0.2, "cases": cases}


if __name__ == "__main__":
    out = HERE / "cases.json"
    json.dump(build(SYSTEM), out.open("w"), ensure_ascii=False, indent=2)
    print("wrote", out, len(CASES), "cases")
