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
  /** One repeated shape, `n` characters long. */
  const shapes: Record<string, (n: number) => string> = {
    "letters without @": (n) => "a".repeat(n),
    "capital letters": (n) => "A".repeat(n),
    "capitalised words": (n) => "Ab ".repeat(n / 3),
    "dotted labels": (n) => "a.".repeat(n / 2),
    "hyphenated labels": (n) => "a-".repeat(n / 2),
    dashes: (n) => "-".repeat(n),
    "inner spaces": (n) => `a${" ".repeat(n)}b`,
    "digits and spaces": (n) => "1 ".repeat(n / 2),
    "removed markers": (n) => "[removed] ".repeat(n / 10),
    "marker then separators": (n) => `[removed]${", ".repeat(n / 2)}`,
    "open brackets": (n) => "( ".repeat(n / 2),
    "@ signs": (n) => "@".repeat(n),
    "language names": (n) => "English ".repeat(n / 8),
    "many Name: lines": (n) => "Name: Abc Def\n".repeat(n / 14),
    "one very long capitalised word": (n) => `Aino\n${"A".repeat(n)}`,
    years: (n) => "2019 ".repeat(n / 5),
    "first person": (n) => "I am ".repeat(n / 5),
    "first person and a capital": (n) => "I am Ab ".repeat(n / 8),
    "my name is": (n) => "My name is ".repeat(n / 11),
    "platform names": (n) => "discord a ".repeat(n / 10),
    "glued addresses": (n) => "a@b.fi_".repeat(n / 7),
    "dotted labels and an underscore": (n) => "ab.cd_".repeat(n / 6),
    "hyphen pairs": (n) => "Ab-Cd. ".repeat(n / 7),
    "retired": (n) => "Retired ".repeat(n / 8),
    "compound health": (n) => "a".repeat(n) + "vamma",
  };

  /** CPU time of this process in milliseconds, not the clock: a busy machine does not make a linear pattern look slow. */
  function cpuMs(run: () => void): number {
    const t = process.cpuUsage();
    run();
    const spent = process.cpuUsage(t);
    return (spent.user + spent.system) / 1000;
  }

  it("warm up (the first call compiles the patterns)", () => {
    anonymiseCv("x");
  });

  // Four times the text may take about four times as long. A pattern that restarts at every position
  // takes sixteen times as long, and on 20,000 characters of the old pattern that was seconds.
  it.each(Object.entries(shapes))("%s", (_name, make) => {
    const small = cpuMs(() => anonymiseCv(make(20_000)));
    const large = cpuMs(() => {
      const out = anonymiseCv(make(80_000));
      expect(typeof out.text).toBe("string");
    });
    expect(large).toBeLessThan(9 * small + 400);
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

// ---------- the second review: gaps in what is removed ----------

/** Pairs: the personal line goes, the work line stays. */
describe("anonymiseCv: age, origin, first language, health, gender, faith, military (pairs)", () => {
  const goes = (text: string, ...gone: RegExp[]) => {
    const out = anonymiseCv(`EXPERIENCE\nBuilt things.\n\n${text}`).text;
    for (const re of gone) expect(out, text).not.toMatch(re);
    expect(out).toContain("Built things.");
  };

  it.each([
    ["35-year-old developer with 10 years of experience", /35/],
    ["I am thirty-five years old.", /thirty/i],
    ["Retired, 67, looking for part-time work.", /67|Retired/],
    ["I am a pensioner.", /pensioner/i],
    ["Eläkeläinen, etsin osa-aikatyötä.", /Eläkeläinen/],
    ["Call \uFF10\uFF14\uFF10 \uFF11\uFF12\uFF13 \uFF14\uFF15\uFF16\uFF17. I am \uFF13\uFF15.", /\d|I am/],
  ])("age: %s", (line, re) => goes(line, re));

  it.each([
    ["Muutin Suomeen Irakista vuonna 2015.", /Irak/],
    ["Kotoisin Somaliasta. Tulin Suomeen pakolaisena.", /Somalia|pakolai/],
    ["Maahanmuuttaja Somaliasta.", /Somalia|Maahanmuutt/],
    ["Kom till Sverige från Irak", /Irak/],
    ["Somali-Finnish.", /Somali/],
    ["I am Roma.", /Roma/],
    ["Romani background.", /Romani/],
    ["Asylum seeker.", /Asylum/],
    ["Turvapaikanhakija.", /Turvapaik/],
  ])("origin: %s", (line, re) => goes(line, re));

  it("origin words in a job stay: a language pair, a refugee-free sentence about Iraq-free work", () => {
    const out = anonymiseCv("EXPERIENCE\nEnglish-Finnish translator for a law firm.\nFront-end developer.\nBuilt a booking tool.").text;
    expect(out).toContain("English-Finnish translator");
    expect(out).toContain("Front-end developer.");
  });

  it.each([
    ["Native languages: Somali and Arabic.", /Somali|Arabic/],
    ["Home language: Arabic", /Arabic/],
    ["Kotikieli: arabia", /arabia/],
  ])("first language: %s", (line, re) => goes(line, re));

  it("a language skill stays beside a first-language statement", () => {
    const out = anonymiseCv("LANGUAGES\nFinnish: native, English: fluent, Swedish (good)").text;
    expect(out).toContain("Finnish");
    expect(out).toContain("English: fluent");
    expect(out).not.toMatch(/native/i);
  });

  it.each([
    ["I use a wheelchair.", /wheelchair/i],
    ["I am deaf and use sign language.", /deaf/i],
    ["I am blind.", /blind/i],
    ["I have multiple sclerosis.", /sclerosis/i],
    ["I'm a recovering alcoholic.", /alcoholic/i],
    ["Minulla on kuulovamma.", /vamma/],
    ["Jag är döv.", /döv/],
    ["Kuuro.", /Kuuro/],
  ])("health: %s", (line, re) => goes(line, re));

  it("health words in a job stay as work", () => {
    const out = anonymiseCv("EXPERIENCE\nNurse on a diabetes ward\nTaught children with dyslexia\nBuilt an app for wheelchair users").text;
    expect(out).toContain("Nurse on a");
    expect(out).toContain("Taught children with");
    expect(out).toContain("Built an app for");
    expect(out).not.toMatch(/diabetes|dyslexia|wheelchair/i);
  });

  it.each([
    ["Pronouns: she/her", /she\/her/],
    ["As a single mum I learned time management.", /single mum/],
    ["Raising my two boys taught me patience.", /boys/],
    ["I pray five times a day.", /pray/],
    ["I wear a hijab.", /hijab/],
    ["I observe Ramadan and Shabbat.", /Ramadan|Shabbat/],
    ["Reserve officer (lieutenant)", /Reserve officer|lieutenant/],
  ])("gender, family, faith, military: %s", (line, re) => goes(line, re));

  it("work that mentions children, reserves or a pension stays", () => {
    const out = anonymiseCv("EXPERIENCE\nTaught children Python.\nManaged reserve funds.\nBuilt a pension calculator.\nRetired the legacy billing system.").text;
    expect(out).toContain("Taught children Python.");
    expect(out).toContain("Managed reserve funds.");
    expect(out).toContain("Built a pension calculator.");
    expect(out).toContain("legacy billing system");
  });

  it("fullwidth @ and digits are read as ordinary ones", () => {
    expect(anonymiseCv("liisa\uFF20firma.fi").text).not.toMatch(/firma/);
  });
});

describe("anonymiseCv: names in prose, domains and handles", () => {
  it.each([
    ["Profile\nHi, I'm Liisa Korhonen, a backend developer. Liisa likes clean code."],
    ["Profile\nOlen Liisa Korhonen, ohjelmistokehittäjä. Korhonen on tehnyt API:ta."],
    ["Profile\nJag är Liisa Korhonen, utvecklare. Liisa gillar kod."],
    ["Profile\nMy name is Dr. Liisa Korhonen. Liisa builds APIs."],
    ["Profile\nmy name is liisa korhonen and I build APIs. Liisa Korhonen likes clean code."],
    ["Profile\nNimeni on Liisa Korhonen. Liisa rakentaa rajapintoja."],
    ["Profile\nMinun nimeni on Liisa Korhonen."],
    ["Profile\nJag heter Liisa Korhonen."],
    ["Profile\nMitt namn är Liisa Korhonen."],
  ])("the name goes, every use of it: %s", (cv) => {
    const { text } = anonymiseCv(`${cv}\nSkills\nPython`);
    expect(text).not.toMatch(/Liisa|Korhonen/i);
    expect(text).toContain("Python");
  });

  it("'I am Finnish' and 'I am a developer' are not names", () => {
    const out = anonymiseCv("Profile\nI am a developer. I am Passionate about data. Olen kehittäjä.").text;
    expect(out).toContain("I am a developer.");
    expect(out).toContain("Passionate about data");
    expect(out).toContain("Olen kehittäjä.");
  });

  it("a bare domain goes, also in lower case with the name in it; technologies stay", () => {
    const out = anonymiseCv("Liisa Korhonen\nSoftware Developer | liisakorhonen.com | Espoo\n\nProfile\nPortfolio at korhonen.dev and liisa-korhonen.fi. Uses ASP.NET and Socket.io.").text;
    expect(out).not.toMatch(/korhonen|liisa/i);
    expect(out).toContain("ASP.NET");
    expect(out).toContain("Socket.io");
    expect(out).toContain("Software Developer");
  });

  it.each([["discord liisa#1234"], ["bsky liisa.bsky.social"], ["telegram liisa_k"]])("a handle after a platform name: %s", (line) => {
    expect(anonymiseCv(`EXPERIENCE\nBuilt things.\n${line}`).text).not.toMatch(/liisa/);
  });

  it("platform names in work stay", () => {
    const out = anonymiseCv("EXPERIENCE\nGithub Actions pipelines, Telegram bots, Discord bot development.").text;
    expect(out).toBe("EXPERIENCE\nGithub Actions pipelines, Telegram bots, Discord bot development.");
  });

  it("a word that holds the name and looks like a handle goes whole", () => {
    const out = anonymiseCv("Liisa Korhonen\nDeveloper\n\nProfile\nSee also korhonen_l and k.korhonen99.").text;
    expect(out).not.toMatch(/korhonen/i);
  });
});

describe("anonymiseCv: References as one line", () => {
  it("'References: available upon request' drops that line only", () => {
    const out = anonymiseCv("Experience\nDeveloper\nReferences: available upon request\nSkills: Python, SQL\nProjects: built the ERP integration").text;
    expect(out).toBe("Experience\nDeveloper\nSkills: Python, SQL\nProjects: built the ERP integration");
  });
  it("lines after it stay, a plain list too", () => {
    const out = anonymiseCv("Experience\nDeveloper\nSuosittelijat: saatavilla pyynnöstä\nPython, SQL, Kubernetes\nBuilt the ERP integration for 40 stores\nLed a team of five").text;
    expect(out).toContain("Built the ERP integration for 40 stores");
    expect(out).toContain("Led a team of five");
  });
  it("a reference with a name still drops its section, which ends at an inline heading", () => {
    const out = anonymiseCv("Experience\nDeveloper\nReferences: Matti Meikäläinen, CEO, +358 40 111 2222\nPekka Peloton, CTO\nSkills: Python, SQL\nBuilt tools").text;
    expect(out).not.toMatch(/Matti|Pekka|358/);
    expect(out).toContain("Skills: Python, SQL");
    expect(out).toContain("Built tools");
  });
});
