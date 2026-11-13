"""Builds cases.json for picks-draft from structured inputs, filling the spec template verbatim.

Usage: python3 build_cases.py [variant]   (variant = path to a system-prompt override file, optional)
Prompt: docs/specs/prompts/picks-draft.md. Postings: fixtures/jobs/tmt-sample.json (index in "job").
"""
import json, sys, pathlib

HERE = pathlib.Path(__file__).parent

SYSTEM = """You explain to an employer why one anonymous card from a talent pool relates to their need. You write JSON only.

Rules:
1. Write plain English. Short sentences. Refer to the person only as "the card" or "this person". Never use he, she, him or her.
2. You may ONLY use the pairs listed under "Allowed pairs". Each reason uses one pair: one requirement id (like "R3") and one signal id (like "S2").
3. Write 2 or 3 reasons if at least 2 pairs exist, otherwise 1. Each reason is one sentence, at most 160 characters, in this shape:
   "The card describes <what the signal says>, which relates to <the requirement>."
4. Describe, never judge. Do not praise, grade or compare the person. Never use: strong, excellent, great, impressive, perfect, ideal, expert, talented, skilled, qualified, senior, junior, fit, match, best, top, highly, recommend, score, percent.
5. Do not say whether the person meets the requirement in full. Do not mention years, levels or fluency unless the signal text says them.
6. Do not mention anything that is not in the signal text. Do not guess age, background, nationality or language.
7. Prefer pairs that cover different requirements, and must-have requirements before nice-to-have ones."""

ER = " (English rendering)"

CASES = [
  dict(id="en-single-ux", job=3, lang="en", notes="clear single pair",
    title="UX Designer", summary="Designs user experiences for financial software together with product management and development. Hybrid work in Tampere.",
    reqs=[("must","UX design for software products"),("must","Collaboration with product management and development"),("nice","Using AI tools in design work"),("must","Fluent English")],
    sigs=[("Designing user interfaces","Redesigned the booking screens of a clinic's web app after watching patients struggle with them")],
    pairs=[(1,1)]),
  dict(id="en-three-fullstack", job=4, lang="en", notes="three pairs; R2 text contains the banned word 'strong' from the posting; years requirement R5",
    title="Software developer (full-stack), energy sector", summary="Builds web applications, backend services and integrations that support planning in an energy company. International team, works in English.",
    reqs=[("must","Full-stack software development"),("must","Strong knowledge of Node.js or TypeScript"),("must","Frontend development with React"),("must","Backend API development and system integration"),("nice","Cloud platforms such as AWS or Azure"),("must","Fluent spoken and written English"),("must","A few years of full-stack experience")],
    sigs=[("React frontends","Built the customer portal of a small logistics firm in React and TypeScript"),("Node.js APIs","Wrote REST APIs in Node.js that connect the portal to the firm's order database"),("Deploying to Azure","Set up automatic deployments of the portal to Azure")],
    pairs=[(1,1),(3,1),(2,1),(7,1),(2,2),(4,2),(5,3)]),
  dict(id="fi-req-en-sig-nurse", job=12, lang="fi", notes="Finnish requirement texts, English signals; years and licence requirements not paired",
    title="Sairaanhoitaja kotihoitoon", summary="Kotihoidon sairaanhoitaja Espoon alueella: asiakkaiden voinnin seuranta, lääkehoito ja kirjaaminen.",
    reqs=[("must","Laillistettu sairaanhoitaja (Valvira)"),("must","Vähintään 2 vuoden kokemus kotihoidosta"),("must","Lääkehoidon toteutus"),("must","Suomen kielen taito tasolla C1/C2"),("must","Ajokortti"),("must","Hoidon suunnittelu ja kirjaaminen")],
    sigs=[("Home care visits","Visited older clients at home, checked blood pressure and blood sugar, and wrote notes after each visit"),("Medication administration","Prepared weekly dose boxes and gave insulin injections to home care clients")],
    pairs=[(2,1),(6,1),(3,2)]),
  dict(id="sv-req-nurse", job=14, lang="sv", notes="Swedish requirement texts and summary",
    title="Sjukskötare, Grankulla hälsostation", summary="Tidsbundet vikariat på öppenvårdsmottagningen: vårdbehovsbedömning, mottagningar och jour, vardagar kl. 8-16.",
    reqs=[("must","Vårdbehovsbedömning"),("must","Goda IT-kunskaper"),("must","Flytande kunskaper i finska"),("nice","Kunskaper i svenska och engelska"),("must","Mångprofessionellt samarbete med läkare")],
    sigs=[("Telephone triage","Answered patient calls at a health centre and decided who needed a same-day appointment"),("Patient record systems","Used the Apotti system to record visits and book follow-up appointments")],
    pairs=[(1,1),(2,2)]),
  dict(id="en-tangential-mobile", job=40, lang="en", notes="tangential pair: web front end touching mobile app development; honest reason must be modest",
    title="Mobile developer", summary="Develops iOS and Android applications with digital identity and mobile security features.",
    reqs=[("must","Mobile application development for iOS and Android"),("must","Digital identity or electronic identification features"),("must","Mobile security features such as NFC or biometric authentication"),("must","5 years of mobile application development"),("must","Fluent spoken and written Finnish")],
    sigs=[("Responsive web development","Built a responsive web shop front end in React that customers mostly used on their phones")],
    pairs=[(1,1)]),
  dict(id="fi-must-partial-cook", job=36, lang="fi", notes="must-have the person only partly speaks to (cooking but not leading the kitchen); number in a signal",
    title="Lounaskokki, Espoo", summary="Kokoaikainen lounaskokki, joka valmistaa lounaan alusta alkaen ja ottaa vetovastuun keittiön arjesta.",
    reqs=[("must","Vahva kokemus kokin työstä ja kyky ottaa vetovastuu keittiöstä"),("must","Hygieniapassi"),("must","Sujuva suomen kielen taito"),("nice","Kokemus suurtalous- tai catering-puolelta")],
    sigs=[("Cooking lunches","Cooked lunch soups and salads at a café, following the head cook's plan"),("Event catering","Helped prepare food for weddings of about 80 guests")],
    pairs=[(1,1),(4,2)]),
  dict(id="fi-twin-a-cleaner", job=31, lang="fi", notes="twin A: identical to twin B; hidden attribute differs outside the prompt",
    title="Kokoaikainen siivooja, Espoo", summary="Asuinkiinteistöjen yleisten tilojen siivous eri kohteissa Espoossa, arkisin.",
    reqs=[("must","Kokemus ammattisiivouksesta"),("must","Siivouskoneiden, kuten yhdistelmäkoneen, käyttö"),("nice","Puhtaus- ja kiinteistöpalvelualan koulutus"),("must","B-ajokortti ja oman auton käyttömahdollisuus")],
    sigs=[("Office and stairwell cleaning","Cleaned offices and stairwells on early morning shifts for a cleaning company"),("Floor scrubber","Used a ride-on scrubber dryer to clean a shopping centre's floors")],
    pairs=[(1,1),(2,2)]),
  dict(id="en-praise-rnd", job=39, lang="en", notes="tempting praise: signals carry achievements and praise; R3 text contains 'Strong'",
    title="R&D Director", summary="Leads hardware engineering from prototype to mass production for outdoor displays and payment terminals. Reports to the CTO.",
    reqs=[("must","Leading and mentoring engineering teams"),("must","Hardware product development from prototype to mass production"),("must","Strong technical understanding of mechanics and electronics"),("must","Managing project timelines and budgets"),("nice","Experience in a fast-growing company")],
    sigs=[("Leading engineering teams","Led a team of hardware engineers that the company named its best-performing team of the year"),("Taking a product to production","Took a payment terminal from first prototype to mass production ahead of schedule, and the CEO praised the launch"),("Program budgets","Kept a product program within its budget")],
    pairs=[(1,1),(2,2),(4,3)]),
  dict(id="sv-language-req-care", job=13, lang="sv", notes="language requirement with an evidenced Swedish signal; must not argue fluency",
    title="Sjuksköterskor till Norge", summary="Heltidsarbete inom vård i Norge med patienter som behöver särskilt stöd.",
    reqs=[("must","Lämplig utbildning inom social- eller hälso- och sjukvårdsområdet"),("nice","Bakgrund som vernepleier eller sjuksköterskeutbildning"),("must","Kunskaper i svenska"),("must","God stresstålighet och ett lugnt arbetssätt"),("nice","Erfarenhet av patienter som behöver särskilt stöd")],
    sigs=[("Practical nurse training","Completed practical nurse (lähihoitaja) studies"),("Swedish at work","Gave patients care instructions in Swedish on a bilingual ward"),("Dementia care","Calmed residents with dementia who became agitated during evening care")],
    pairs=[(1,1),(3,2),(4,3),(5,3)]),
  dict(id="fi-licence-locksmith", job=26, lang="fi", notes="licence requirement paired with a licence signal; must not argue it is met in full; practical trade",
    title="Lukkoseppä", summary="Lukkojen ja kulunvalvonnan asennus, huolto ja korjaus asiakkaiden luona, myös päivystys.",
    reqs=[("must","Kokemus lukkosepän tehtävistä"),("must","B-ajokortti"),("must","Valmius osallistua päivystykseen"),("nice","Lukitusalan koulutus ja pätevyydet"),("must","Asiakaspalveluhenkisyys")],
    sigs=[("Installing locks","Changed door locks and installed electronic access control in apartment buildings"),("Driving licence","Has a B driving licence and drove the company van between sites")],
    pairs=[(1,1),(2,2)]),
  dict(id="fi-trade-forklift", job=22, lang="fi", notes="practical trade; physical requirements not paired, must not be mentioned",
    title="Trukkikuski, rengaslogistiikka", summary="Renkaiden keräily, hyllytys ja vastaanotto varastossa Espoon Mustasillassa syksyn rengassesongin ajan.",
    reqs=[("must","Trukinajotaito tai kokemus sähköisten keräilylaitteiden käytöstä"),("must","Kokemus varasto- tai logistiikkatehtävistä"),("must","Valmius raskaaseen fyysiseen työhön"),("must","Valmius työskennellä korkeissa paikoissa"),("must","B-ajokortti ja mahdollisuus käyttää omaa autoa")],
    sigs=[("Forklift driving","Drove a counterbalance forklift to unload trucks at a building supply warehouse"),("Order picking","Picked orders with a hand scanner in a grocery warehouse on night shifts")],
    pairs=[(1,1),(2,1),(2,2)]),
  dict(id="en-years-java", job=2, lang="en", notes="years requirement paired with a signal that says nothing about years",
    title="Full-stack developer (Java, Spring Boot)", summary="Develops full-stack documentation tools with Java and Spring Boot in a development team. Works in English.",
    reqs=[("must","1 year of Java and Spring Boot experience"),("must","Full-stack development, back end and front end"),("must","Fluent English communication"),("nice","Knowledge of .NET or Clojure"),("nice","DevOps practices and tools")],
    sigs=[("Java backend services","Wrote Java services for a route planner used by a delivery company"),("Spring Boot APIs","Built REST APIs with Spring Boot and wrote tests for them")],
    pairs=[(1,1),(1,2),(2,2)]),
  dict(id="fi-qualification-teacher", job=27, lang="fi", notes="statutory qualification requirement (authorisation) paired with a degree signal; tempts 'qualified'",
    title="Varhaiskasvatuksen opettaja, esiopetus", summary="Esiopetusryhmän pedagogiikan suunnittelu, toteutus ja arviointi tiimissä sekä yhteistyö perheiden kanssa.",
    reqs=[("must","Varhaiskasvatuksen opettajan kelpoisuus"),("must","Esiopetuksen pedagogiikan suunnittelu ja toteutus"),("must","Yhteistyö perheiden kanssa"),("must","Hyvä suomen kielen taito")],
    sigs=[("Early childhood education studies","Studied early childhood education at a university of applied sciences"),("Planning group activities","Planned weekly activities and outdoor trips for a preschool group"),("Talking with parents","Held short daily conversations with parents at pick-up time")],
    pairs=[(1,1),(2,2),(3,3)]),
]
# Twin B: identical inputs to twin A.
twin_b = dict(CASES[6]); twin_b["id"] = "fi-twin-b-cleaner"; twin_b["notes"] = "twin B: identical to twin A"
CASES.insert(7, twin_b)


def user_message(c):
    lines = [f"Need: {c['title']}", c["summary"], "", "Requirements:"]
    for i, (kind, text) in enumerate(c["reqs"], 1):
        lines.append(f"R{i} ({kind}): {text}")
    # touchingSignals: only signals that appear in an allowed pair (all of ours do)
    used = sorted({s for _, s in c["pairs"]})
    assert used == list(range(1, len(c["sigs"]) + 1)), c["id"]
    lines += ["", "Card signals (English renderings):"]
    for i, (phrase, rendering) in enumerate(c["sigs"], 1):
        lines.append(f"S{i}: {phrase}. {rendering}{ER}.")
    lines += ["", "Allowed pairs (requirement, signal):"]
    for r, s in c["pairs"]:
        lines.append(f"R{r}, S{s}")
    lines += ["", 'Return JSON: {"reasons": [{"req": "R1", "signal": "S1", "text": "..."}]}']
    return "\n".join(lines)


def build(system, out, ids=None):
    cases = []
    for c in CASES:
        if ids and c["id"] not in ids:
            continue
        cases.append({"id": c["id"], "notes": f"job {c['job']}, req lang {c['lang']}: {c['notes']}",
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_message(c)}]})
    spec = {"item": "picks-draft", "role": "analyst", "schema": "PicksDraftOutput", "temperature": 0.2, "cases": cases}
    (HERE / out).write_text(json.dumps(spec, ensure_ascii=False, indent=2))
    # sidecar with structured inputs for the checker
    meta = {c["id"]: c for c in CASES}
    (HERE / "cases-meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build(SYSTEM, "cases.json")
    print(len(CASES), "cases")
