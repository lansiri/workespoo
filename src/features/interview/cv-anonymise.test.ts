import { describe, expect, it } from "vitest";
import { anonymiseCv } from "./cv-anonymise";

const CV_EN = `Maija Meikäläinen
Curriculum Vitae
Logistics Coordinator
maija.meikalainen@example.fi | +358 40 123 4567 | linkedin.com/in/maija-m
Mannerheimintie 12 B 7, 00100 Helsinki
Date of birth: 12.3.1988
Nationality: Kenyan

PROFILE
I plan transport for a wholesale company. I am married with two children.

WORK EXPERIENCE
Logistics Coordinator, Kesko 03/2019 – present
Planned daily routes for 40 trucks and moved route planning from Excel to a new system.
Maija led the switch and trained six drivers.
Warehouse Worker, Posti 2015–2019
Drove forklifts and checked incoming deliveries.

LANGUAGES
Swahili (native), English, Finnish B1

REFERENCES
Pekka Virtanen, Kesko, pekka.virtanen@example.fi, 050 765 4321

HOBBIES
Church choir, running
`;

describe("anonymiseCv", () => {
  const { text, removed } = anonymiseCv(CV_EN);

  it("removes the name, everywhere it appears", () => {
    expect(text).not.toMatch(/Maija|Meikäläinen|MAIJA/);
    expect(removed.name).toBeGreaterThanOrEqual(2);
  });

  it("removes contacts, links, street address and postal code", () => {
    expect(text).not.toMatch(/@|\+358|linkedin|Mannerheimintie|00100|Helsinki/);
    expect(removed.contact).toBeGreaterThan(0);
  });

  it("removes labelled personal lines, dates and years", () => {
    expect(text).not.toMatch(/Date of birth|Nationality|Kenyan|1988|2019|2015|03\//);
    expect(removed.personal).toBeGreaterThanOrEqual(2);
    expect(removed.date).toBeGreaterThan(0);
  });

  it("removes sentences about family and the native-language marker", () => {
    expect(text).not.toMatch(/married|children/);
    expect(text).not.toMatch(/native/i);
    expect(removed.protected).toBeGreaterThanOrEqual(2);
  });

  it("drops the references and hobbies sections whole", () => {
    expect(text).not.toMatch(/Pekka|Virtanen|050|Church|choir|running/);
    expect(removed.section).toBe(2);
  });

  it("keeps the work", () => {
    expect(text).toContain("I plan transport for a wholesale company.");
    expect(text).toContain("Planned daily routes for 40 trucks and moved route planning from Excel to a new system.");
    expect(text).toContain("Drove forklifts and checked incoming deliveries.");
    expect(text).toContain("led the switch and trained six drivers.");
    expect(text).toContain("Logistics Coordinator, Kesko");
    expect(text).toContain("WORK EXPERIENCE");
  });

  it("is deterministic", () => {
    expect(anonymiseCv(CV_EN)).toEqual(anonymiseCv(CV_EN));
  });
});

describe("anonymiseCv, Finnish and Swedish", () => {
  it("handles a Finnish CV", () => {
    const { text } = anonymiseCv(`ANSIOLUETTELO
Jussi Korhonen
Henkilötiedot
Osoite: Kauppakatu 3 A 1, 02100 Espoo
Puhelin: 040 111 2233
Syntymäaika: 1.2.1979

TYÖKOKEMUS
Kokki, Ravintola Aalto 2019–
Vastasin lounaslistan suunnittelusta ja raaka-ainetilauksista. Perheeseeni kuuluu kaksi lasta.
Henkilötunnus 010279-123X ei kuulu tähän.
`);
    expect(text).not.toMatch(/Jussi|Korhonen|Kauppakatu|02100|040|1979|010279|lasta/);
    expect(text).toContain("Vastasin lounaslistan suunnittelusta ja raaka-ainetilauksista.");
    expect(text).toContain("TYÖKOKEMUS");
  });

  it("handles a Swedish CV", () => {
    const { text } = anonymiseCv(`Anna Lindqvist
Personnummer: 880312-1234
Civilstånd: gift

ARBETSLIVSERFARENHET
Säljare, Stockmann 2018 – 2022
Sålde kläder och ansvarade för kassan. Jag är gift och har två barn.
`);
    expect(text).not.toMatch(/Anna|Lindqvist|880312|gift|barn|2018|2022/);
    expect(text).toContain("Sålde kläder och ansvarade för kassan.");
  });
});

describe("anonymiseCv leaves ordinary work wording alone", () => {
  it.each([
    "Built mobile apps in React Native and TypeScript.",
    "Worked with children in a daycare group of twelve.",
    "Työskentelin lasten kanssa päiväkodissa.",
    "Sold gift cards and handled returns.",
    "Will lead the next planning round.",
    "Ran health and safety walks on the site.",
  ])("%s", (line) => {
    expect(anonymiseCv(`WORK EXPERIENCE\n${line}`).text).toContain(line);
  });

  it("a job title on the first line is not taken for a name", () => {
    const { text, removed } = anonymiseCv("Software Developer\nBuilt software for a data team.");
    expect(text).toContain("Built software for a data team.");
    expect(removed.name).toBe(0);
  });

  it("a name in capitals is found, and its title-case use later too", () => {
    const { text } = anonymiseCv("MAIJA MEIKÄLÄINEN\n\nEXPERIENCE\nMaija set up the stock counts.");
    expect(text).not.toMatch(/maija|meikäläinen/i);
    expect(text).toContain("set up the stock counts.");
  });

  it("removes hidden zero-width characters", () => {
    expect(anonymiseCv("EXPERIENCE\nDrove​ forklifts.﻿").text).toBe("EXPERIENCE\nDrove forklifts.");
  });

  it("an empty text stays empty", () => {
    expect(anonymiseCv("").text).toBe("");
  });
});

// ---------- hostile input: time grows with the length, not with its square ----------

describe("anonymiseCv time on hostile text", () => {
  const N = 100_000;
  const shapes: Record<string, string> = {
    "letters without @": "a".repeat(N),
    "capital letters": "A".repeat(N),
    "capitalised words": "Ab ".repeat(N / 3),
    "dotted labels": "a.".repeat(N / 2),
    "hyphenated labels": "a-".repeat(N / 2),
    dashes: "-".repeat(N),
    "inner spaces": `a${" ".repeat(N)}b`,
    "digits and spaces": "1 ".repeat(N / 2),
    "removed markers": "[removed] ".repeat(N / 10),
    "marker then separators": `[removed]${", ".repeat(N / 2)}`,
    "open brackets": "( ".repeat(N / 2),
    "@ signs": "@".repeat(N),
    "language names": "English ".repeat(N / 8),
    "many Name: lines": "Name: Abc Def\n".repeat(N / 14),
    "one very long capitalised word": `Aino\n${"A".repeat(N)}`,
    "years": "2019 ".repeat(N / 5),
    "first person": "I am ".repeat(N / 5),
  };

  it("warm up (the first call compiles the patterns)", () => {
    anonymiseCv("x");
  });

  it.each(Object.entries(shapes))("%s", (_name, text) => {
    const t = performance.now();
    const out = anonymiseCv(text);
    expect(typeof out.text).toBe("string");
    expect(performance.now() - t).toBeLessThan(2500);
  });
});

// ---------- languages stay, a first-language statement goes ----------

describe("anonymiseCv and languages", () => {
  it.each([
    ["Languages: English, Swedish", "Languages: English, Swedish"],
    ["Languages: Russian, Arabic, Somali, Estonian, French, German, Spanish", "Languages: Russian, Arabic, Somali, Estonian, French, German, Spanish"],
    ["Kielet: suomi, ruotsi, englanti", "Kielet: suomi, ruotsi, englanti"],
    ["Språk: finska, svenska, engelska, ryska", "Språk: finska, svenska, engelska, ryska"],
    ["Taught Russian to adults.", "Taught Russian to adults."],
    ["Finnish: native, English: fluent", "Finnish, English: fluent"],
    ["Languages: Finnish (mother tongue), English", "Languages: Finnish, English"],
    ["Languages: Finnish (native), English", "Languages: Finnish, English"],
    ["Languages: Swedish – native speaker, Finnish", "Languages: Swedish, Finnish"],
    ["Kielet: suomi äidinkielenä, englanti", "Kielet: suomi, englanti"],
    ["Språk: svenska (modersmål), engelska", "Språk: svenska, engelska"],
    ["Native speaker of Finnish. Taught English.", "Finnish. Taught English."],
    ["Xhosa: native, English", "Xhosa, English"],
  ])("%s", (line, expected) => {
    expect(anonymiseCv(`LANGUAGES\n${line}`).text).toBe(`LANGUAGES\n${expected}`);
  });

  it("a statement of the mother tongue as a sentence or a labelled line goes", () => {
    const { text } = anonymiseCv("LANGUAGES\nMy mother tongue is Finnish.\nÄidinkieli: suomi\nModersmål: svenska\nEnglish: fluent");
    expect(text).toBe("LANGUAGES\n\nEnglish: fluent");
  });

  it("a nationality or a country as a personal detail still goes, a language of work stays", () => {
    const { text } = anonymiseCv("EXPERIENCE\nI am Russian.\nRussian-born.\nOlen suomalainen.\nJag är svensk.\nI am a Russian teacher.\nRan the Kenyan office.");
    expect(text).not.toMatch(/I am Russian|Russian-born|suomalainen|svensk|Kenyan/);
    expect(text).toContain("I am a Russian teacher.");
  });

  it("the Finnish and Swedish words for languages are not taken for a home town in the header", () => {
    expect(anonymiseCv("Helsinki\nSuomi\nKielet: suomi, ruotsi").text).toBe("Kielet: suomi, ruotsi");
  });
});

// ---------- protected details: the personal line goes, the work line stays ----------

describe("anonymiseCv: protected details in a personal line and in a job", () => {
  const goes = (line: string) => anonymiseCv(`EXPERIENCE\nDrove forklifts.\n${line}`).text;
  const stays = (line: string) => anonymiseCv(`EXPERIENCE\n${line}`).text;

  it.each([
    "I am 35.", "I'm 35 and I like trucks.", "Olen 35.", "Jag är 35.", "Aged 35.", "Age 35", "Ikä 35", "Ålder 35", "35 v", "35 v.", "35 år",
  ])("age: %s", (line) => {
    expect(goes(line)).not.toMatch(/35/);
    expect(goes(line)).toContain("Drove forklifts.");
  });
  it("age: a number that is not an age stays", () => {
    expect(stays("Open 24/7 and 100% on time. Led 35 people.")).toContain("Open 24/7 and 100% on time. Led 35 people.");
  });

  it.each([
    "I have ADHD.", "I have dyslexia.", "I am diagnosed with diabetes.", "My depression is under control.", "I suffer from depression.",
    "Minulla on ADHD.", "Sairastan diabetesta.", "Sairausloma 2020.", "Jag är sjukskriven.", "Jag har dyslexi.", "Disability: yes", "I live with epilepsy.",
  ])("health: %s", (line) => {
    expect(goes(line)).toBe("EXPERIENCE\nDrove forklifts.");
  });
  it.each([
    ["Nurse on a diabetes ward 2019-2023", "Nurse on a [removed] ward [removed]"],
    ["Taught children with dyslexia", "Taught children with [removed]"],
    ["Coached adults with ADHD in study skills.", "Coached adults with [removed] in study skills."],
    ["Hoitaja diabetesosastolla", "Hoitaja [removed]"],
  ])("health, work: %s", (line, expected) => {
    expect(stays(line)).toBe(`EXPERIENCE\n${expected}`);
  });

  it.each(["I am Muslim.", "Faith: Christian", "Uskonto: luterilainen", "Religious views: none", "Olen uskova.", "Jag är troende.", "Member of the parish and a believer."])(
    "religion and faith: %s",
    (line) => {
      expect(goes(line)).toBe("EXPERIENCE\nDrove forklifts.");
    },
  );

  it.each(["Gender: male", "Sukupuoli: nainen", "Kön: kvinna", "Mies", "Olen nainen.", "I am a man.", "I'm a woman.", "Kvinna, 1990"])("gender: %s", (line) => {
    expect(goes(line)).toBe("EXPERIENCE\nDrove forklifts.");
  });
  it("gender: a work line with the word man or men stays", () => {
    expect(stays("Man the front desk and train men and women in lifting.")).toContain("Man the front desk");
  });

  it.each([
    "Military service: 2008", "Completed military service in 2009.", "Varusmiespalvelus suoritettu", "Asepalvelus 2010", "Värnplikt 2011", "Reservin vänrikki",
    "Served my national service.",
  ])("military: %s", (line) => {
    expect(goes(line)).toBe("EXPERIENCE\nDrove forklifts.");
  });

  it.each([
    "Married, two children", "Single, no children", "Naimisissa, kaksi lasta", "Gift, två barn", "Perhe: vaimo ja kaksi lasta", "Lapsia 2", "Barn: 2",
    "I have three children.", "Jag har två barn.", "Family status: married",
  ])("family: %s", (line) => {
    expect(goes(line)).toBe("EXPERIENCE\nDrove forklifts.");
  });
  it.each([
    "Worked with children in a daycare group of twelve.",
    "Taught children with dyslexia".replace("dyslexia", "reading difficulties"),
    "Sold gift cards and handled returns.",
    "I have worked with children for years.",
    "Työskentelin lasten kanssa päiväkodissa.",
    "Ledde barnomsorgen på ett daghem.",
  ])("family, work: %s", (line) => {
    expect(stays(line)).toBe(`EXPERIENCE\n${line}`);
  });

  it.each(["Suomalainen", "Kansalaisuus: suomalainen", "Kansalaisuus suomalainen", "Olen suomalainen.", "Virolainen", "Nationalitet: svensk", "Jag är svensk.", "Jag är finländare."])(
    "nationality in Finnish and Swedish: %s",
    (line) => {
      expect(goes(line)).toBe("EXPERIENCE\nDrove forklifts.");
    },
  );
});

// ---------- names that survive today ----------

describe("anonymiseCv: names", () => {
  it.each([
    ["My name is Liisa Korhonen. Liisa built the cache. Korhonen presented it.", /Liisa|Korhonen/],
    ["Minun nimeni on Aino Virtanen. Virtanen rakensi järjestelmän.", /Aino|Virtanen/],
    ["Nimeni on Aino Virtanen. Aino rakensi järjestelmän.", /Aino|Virtanen/],
    ["Jag heter Anna Berg och bygger system. Berg byggde det.", /Anna|Berg/],
    ["Mitt namn är Erik von Essen. Essen byggde det.", /Erik|Essen/],
  ])("prose: %s", (line, gone) => {
    const { text } = anonymiseCv(`EXPERIENCE\n${line}`);
    expect(text).not.toMatch(gone);
    expect(text).toMatch(/built|rakensi|bygger|byggde/);
  });

  it("a one-word name alone on the first header line, and every later use of it", () => {
    const { text } = anonymiseCv("Liisa\nWarehouse Worker\n\nEXPERIENCE\nLiisa counted stock and Liisa's team moved it.");
    expect(text).not.toMatch(/Liisa/);
    expect(text).toContain("counted stock");
  });
  it("a one-word first line that is a heading, a title or a place is not a name", () => {
    expect(anonymiseCv("Kesko\nEXPERIENCE\nWorked at Kesko").text).toContain("Worked at");
    expect(anonymiseCv("Developer\nEXPERIENCE\nBuilt an app.").text).toContain("Developer");
    expect(anonymiseCv("Helsinki\nEXPERIENCE\nBuilt an app in Helsinki.").text).toContain("in Helsinki");
  });

  it.each([
    "REFERENCES\nMatti Meikäläinen, CEO, Acme, +358 40 111 2222\nPekka Peloton, CTO\n\nEDUCATION\nBSc in Logistics.",
    "SUOSITTELIJAT\nMatti Meikäläinen, toimitusjohtaja, 040 111 2222\nPekka Peloton\n\nKOULUTUS\nInsinööri (AMK).",
    "REFERENSER\nOlle Svensson, VD, olle@example.se\n\nUTBILDNING\nCivilingenjör.",
    "REFERENCES (available on request)\nMatti Meikäläinen, CEO\n\nEDUCATION\nBSc in Logistics.",
    "References: Matti Meikäläinen, CEO, +358 40 111 2222\nPekka Peloton, CTO\n\nEDUCATION\nBSc in Logistics.",
    "Suosittelijat: Matti Meikäläinen, toimitusjohtaja, +358 40 111 2222\n\nKOULUTUS\nInsinööri (AMK).",
  ])("a reference's name and contact go: %s", (tail) => {
    const { text } = anonymiseCv(`EXPERIENCE\nBuilt things.\n\n${tail}`);
    expect(text).not.toMatch(/Matti|Meikäläinen|Pekka|Peloton|Olle|Svensson|358|040|example/);
    expect(text).toContain("Built things.");
    expect(text).toMatch(/BSc|Insinööri|Civilingenjör/);
  });

  it("a handle with no @ sign, anywhere in a line", () => {
    const { text } = anonymiseCv("EXPERIENCE\nBuilt tools. Follow me @maija_k, Instagram: maija_k, twitter: maijak and (@maija.k).");
    expect(text).not.toMatch(/maija/i);
    expect(text).toContain("Built tools.");
  });
});
