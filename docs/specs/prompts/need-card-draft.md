# Prompt: need-card-draft

Role: `analyst` (event companies), `bulk` (feed postings). Purpose tag: `needcard.draft`. JSON mode with the schema below; validate with Zod, one repair retry. Temperature 0.2. Rules for what code does with the output: `need-card.md` sections 3, 4 and 7.

## System message (verbatim)

```
You read one job posting and list what it asks of applicants. You write JSON only.

Rules:
1. Instructions are in English. The posting may be in Finnish, Swedish or English. Write every output text in plain English.
2. Each posting sentence has a label like [P6]. For every requirement, give the number of the ONE sentence it comes from in "sentence".
3. List only what the posting asks of the applicant: skills, tools, languages, education, experience, licences. Do not list duties, benefits or facts about the company.
4. One requirement per distinct ask. At most 12. "text" is a short English phrase, at most 80 characters. Never include the employer's name.
5. "kind" is "must" when the sentence or its heading uses words like: edellytämme, edellytyksenä, vaadimme, sinulla on, hallitset, odotamme, required, must, you have, requirements, krav. "kind" is "nice" for: eduksi, katsotaan eduksi, arvostamme, plussaa, toivomme, nice to have, a plus, preferred, meriterande. If there is no such word, use "nice".
6. "category" is one of: skill, language, education, experience, authorisation, other.
   - language: a working language. Put the ISO code in "language" (fi, sv, en, ...).
   - experience: years or prior work. Put the number of years in "years" if stated.
   - authorisation: licence, certificate, card, security clearance, registration, work permit.
   - other: soft or vague asks such as "team player" or "stress tolerance".
7. "esco": up to 3 ids from the ESCO list (like "K4") that name the same skill. Only for skill, experience and education. Use [] if none fits. Never invent ids.
8. "statutory": "law" if the requirement is set by law for this job (public-sector language rules, licensed professions, security clearance, criminal record check, work permit), else "none".
9. "questionType": choose one, else "none":
   - "language": a must-have language requirement, and the work could plausibly start in another language.
   - "years": a must-have number of years, 3 or more.
   - "degree": a must-have degree.
   - "tool": a must-have specific product or version where a comparable tool may transfer.
   - "vague": a vague or soft ask.
   Use "none" when statutory is "law".
10. "question": one polite question TO THE EMPLOYER that invites them to reconsider, following the pattern for its type. Never say the requirement is wrong, unnecessary, unrealistic or biased. No numbers except the years from the posting. null when questionType is "none".
   - language: "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?"
   - years: "Would someone who has done <work>, with fewer than <N> years, be worth a conversation?"
   - degree: "Would hands-on experience in <field> work instead of the degree?"
   - tool: "Would experience with a comparable tool be enough, if the person learns <tool> on the job?"
   - vague: "What does '<phrase>' look like in this job? One concrete example helps us find people who have done it."
11. "why": one neutral sentence, at most 140 characters, no numbers, saying what in the posting prompted the question. null when there is no question.
12. Never turn age, gender, nationality, ethnicity, religion, health, family status or appearance into a requirement. If a sentence asks for one, put its number in "dropped".
13. "title": the role in plain English, at most 60 characters. "summary": at most 2 sentences about the work, no employer name.
```

## User message template

```
Posting language: {{job.lang}}
Posting title: {{job.title}}
Work languages listed by the source: {{job.workLanguages | join(", ") or "none listed"}}

Posting sentences:
{{for i, s in job.sentences[0..119]}}[P{{i}}] {{s}}
{{end}}

ESCO skills you may use in "esco":
{{for k, c in candidates}}K{{k}}: {{c.labelEn}} / {{c.labelFi}}
{{end}}

Return JSON with keys: title, summary, requirements, dropped.
```

## Output schema

```json
{
  "title": "string <= 60",
  "summary": "string <= 300",
  "requirements": [
    {
      "text": "string <= 80",
      "kind": "must | nice",
      "category": "skill | language | education | experience | authorisation | other",
      "sentence": 0,
      "esco": ["K1"],
      "language": "fi | null",
      "years": 5,
      "statutory": "law | none",
      "questionType": "none | language | years | degree | tool | vague",
      "question": "string | null",
      "why": "string | null"
    }
  ],
  "dropped": [7]
}
```

Zod notes: `requirements` max 12; `sentence` int ≥ 0; `esco` max 3 items matching `/^K\d+$/`; `years` int or null; `language` matches `/^[a-z]{2}$/` or null. Code mapping: `sentence` → `postingSentence`; `esco` → `escoSkillUris`; `language` → `languageCode`; `statutory: law` → code decides the exact statutory class from `need-card.md` 4.3 (if the keyword rules find none, `other_law`); `questionType`/`question`/`why` → `question {type, text, why, answer: null}`.

## Example A: English posting, private employer

Input (abridged):

```
Posting language: en
Posting title: Data Engineer
Work languages listed by the source: en, fi

Posting sentences:
[P0] We are a growing energy-analytics company in Espoo.
[P1] You will build and run data pipelines that feed our forecasting models.
[P2] Our team works in English.
[P3] What we expect:
[P4] Strong Python skills.
[P5] Experience with SQL and relational databases.
[P6] 4+ years of experience in data engineering.
[P7] Fluent Finnish.
[P8] Excellent communication skills.
[P9] Nice to have:
[P10] Experience with Apache Airflow.
[P11] Knowledge of the energy sector.

ESCO skills you may use in "esco":
K1: Python (computer programming) / Python (tietokoneohjelmointi)
K2: SQL / SQL
K3: manage databases / hallinnoida tietokantoja
K4: design data pipelines / ...
K5: energy market / energiamarkkinat
```

Expected output:

```json
{
  "title": "Data engineer",
  "summary": "Builds and runs data pipelines that feed forecasting models at an energy-analytics company. The team works in English.",
  "requirements": [
    {"text": "Python programming", "kind": "must", "category": "skill", "sentence": 4, "esco": ["K1"], "language": null, "years": null, "statutory": "none", "questionType": "none", "question": null, "why": null},
    {"text": "SQL and relational databases", "kind": "must", "category": "skill", "sentence": 5, "esco": ["K2", "K3"], "language": null, "years": null, "statutory": "none", "questionType": "none", "question": null, "why": null},
    {"text": "4 years of data engineering", "kind": "must", "category": "experience", "sentence": 6, "esco": ["K4"], "language": null, "years": 4, "statutory": "none", "questionType": "years", "question": "Would someone who has done data engineering, with fewer than 4 years, be worth a conversation?", "why": "The posting asks for a number of years rather than for specific work done."},
    {"text": "Fluent Finnish", "kind": "must", "category": "language", "sentence": 7, "esco": [], "language": "fi", "years": null, "statutory": "none", "questionType": "language", "question": "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?", "why": "The posting says the team works in English."},
    {"text": "Communication skills", "kind": "must", "category": "other", "sentence": 8, "esco": [], "language": null, "years": null, "statutory": "none", "questionType": "vague", "question": "What does 'excellent communication skills' look like in this job? One concrete example helps us find people who have done it.", "why": "The posting does not say what this means in practice."},
    {"text": "Apache Airflow", "kind": "nice", "category": "skill", "sentence": 10, "esco": [], "language": null, "years": null, "statutory": "none", "questionType": "none", "question": null, "why": null},
    {"text": "Energy sector knowledge", "kind": "nice", "category": "skill", "sentence": 11, "esco": ["K5"], "language": null, "years": null, "statutory": "none", "questionType": "none", "question": null, "why": null}
  ],
  "dropped": []
}
```

Note: "Strong" is not carried into `text`; requirement text names the ask, not a level.

## Example B: Finnish posting with statutory and protected content

Input (abridged):

```
Posting language: fi
Posting title: Ohjelmistokehittäjä, Java
Work languages listed by the source: fi

Posting sentences:
[P0] Kehitämme turvallisuuskriittisiä järjestelmiä julkishallinnon asiakkaille.
[P1] Tehtävässäsi vastaat taustajärjestelmien kehityksestä ja ylläpidosta.
[P2] Edellytämme:
[P3] Vähintään 5 vuoden kokemus Java-kehityksestä
[P4] Soveltuva korkeakoulututkinto
[P5] Erinomainen suomen kielen taito suullisesti ja kirjallisesti
[P6] Valmius turvallisuusselvitykseen
[P7] Eduksi katsotaan:
[P8] Kokemus AWS-pilvipalveluista
[P9] Spring Boot -osaaminen
[P10] Etsimme nuorekasta ja energistä tiimiläistä.
[P11] Hae viimeistään 30.11.

ESCO skills you may use in "esco":
K1: Java (computer programming) / Java (tietokoneohjelmointi)
K2: cloud technologies / pilviteknologiat
K3: Spring framework / ...
K4: software development / ohjelmistokehitys
```

Expected output:

```json
{
  "title": "Backend developer (Java)",
  "summary": "Develops and maintains backend systems for security-critical public-sector services.",
  "requirements": [
    {"text": "5 years of Java development", "kind": "must", "category": "experience", "sentence": 3, "esco": ["K1"], "language": null, "years": 5, "statutory": "none", "questionType": "years", "question": "Would someone who has done Java development, with fewer than 5 years, be worth a conversation?", "why": "The posting asks for a number of years rather than for specific work done."},
    {"text": "University degree in a relevant field", "kind": "must", "category": "education", "sentence": 4, "esco": ["K4"], "language": null, "years": null, "statutory": "none", "questionType": "degree", "question": "Would hands-on experience in software development work instead of the degree?", "why": "The posting does not name a specific field of study."},
    {"text": "Excellent spoken and written Finnish", "kind": "must", "category": "language", "sentence": 5, "esco": [], "language": "fi", "years": null, "statutory": "none", "questionType": "language", "question": "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?", "why": "The posting asks for Finnish but does not say which tasks need it."},
    {"text": "Willing to undergo a security clearance", "kind": "must", "category": "authorisation", "sentence": 6, "esco": [], "language": null, "years": null, "statutory": "law", "questionType": "none", "question": null, "why": null},
    {"text": "AWS cloud services", "kind": "nice", "category": "skill", "sentence": 8, "esco": ["K2"], "language": null, "years": null, "statutory": "none", "questionType": "none", "question": null, "why": null},
    {"text": "Spring Boot", "kind": "nice", "category": "skill", "sentence": 9, "esco": ["K3"], "language": null, "years": null, "statutory": "none", "questionType": "none", "question": null, "why": null}
  ],
  "dropped": [10]
}
```

What code then does: P6 hits `turvallisuusselvitys` → `statutory: clearance`. P10 ("nuorekasta", youthful) is in `dropped` and also hits the protected lint → listed in `droppedSentences` for the organiser. P11 is a deadline, not a requirement.

## Example C: public employer (one requirement only)

Kuntarekry posting, `[P4] Tehtävässä edellytetään suomen kielen erinomaista ja ruotsin kielen tyydyttävää taitoa (laki 424/2003).` Expected: two requirements, both `category: language`, `kind: must`, `statutory: law`, `questionType: none`. Code sets `statutory: language_act` (public employer and `424/2003`).

## Failure handling

| Failure | Handling |
|---|---|
| JSON invalid after one repair | Leave the job without a Need Card; enqueue a retry in 15 minutes (max 3); show "Draft pending" in the organiser event overview |
| Output in Finnish | Accept if valid; the gateway's `analyst` probe should have caught it. Requirement texts are company-editable |
| More than 12 requirements | Zod rejects; repair message: "Return at most 12 requirements; keep must-haves first." |
| `question` present with `questionType: none` | Code nulls it |
