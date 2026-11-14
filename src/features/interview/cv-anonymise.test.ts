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
