import { describe, expect, it } from "vitest";
import { blankContactSentences, containsContact, containsContactCue, redactContacts, scrubPostingText, scrubSentenceList } from "./redact";

const R = "[removed]";

describe("redactContacts: emails", () => {
  it.each([
    ["Send your CV to jane.doe@example.fi today", `Send your CV to ${R} today`],
    ["hakemukset: etunimi.sukunimi@espoo.fi.", `hakemukset: ${R}.`],
    ["mail: first+tag@sub.example.co.uk!", `mail: ${R}!`],
    ["name(at)example.fi", R],
    ["Ota yhteyttä: etunimi.sukunimi(at)espoo.fi", `Ota yhteyttä: ${R}`],
    ["etunimi [at] firma [dot] fi", R],
    ["etunimi (ät) firma.fi", R],
    ["etunimi at firma dot fi", R],
    ["liisa.virtanen@yritys.com ja matti@yritys.com", `${R} ja ${R}`],
  ])("%s", (input, expected) => {
    expect(redactContacts(input)).toBe(expected);
  });

  it("leaves ordinary prose with the word 'at' alone", () => {
    const text = "We meet at noon at the office in Espoo. Look at the dot product.";
    expect(redactContacts(text)).toBe(text);
  });
});

describe("redactContacts: phones", () => {
  it.each([
    ["Soita 040 123 4567 arkisin", `Soita ${R} arkisin`],
    ["puh. 0401234567.", `puh. ${R}.`],
    ["Puhelin: 040-123 4567", `Puhelin: ${R}`],
    ["09 123 4567", R],
    ["(09) 123 4567", R],
    ["09-1234567", R],
    ["010 123 4567", R],
    ["0800 123 45", R],
    ["+358 40 123 4567", R],
    ["+358401234567", R],
    ["+358 (0)40 123 4567", R],
    ["00358 40 123 4567", R],
    ["+44 20 7946 0958", R],
    ["+1 (555) 123-4567", R],
    ["+49 30 123456", R],
    ["Call 040 111 2222 - 050 333 4444 now", `Call ${R} - ${R} now`],
  ])("%s", (input, expected) => {
    expect(redactContacts(input)).toBe(expected);
  });
});

describe("redactContacts: things that must survive", () => {
  it.each([
    "We were founded in 2015 and have grown since 2019.",
    "Contract period 2024-2026.",
    "Palkka 2 500 - 3 000 € kuukaudessa.",
    "Salary 2500-3000 EUR per month, 37,5 h/week.",
    "Palkka 3200 €/kk, työaika 7.5 h/pv",
    "Työpaikka sijaitsee osoitteessa Piispansilta 11, 02230 Espoo.",
    "Postal code 00100 Helsinki",
    "Y-tunnus 1234567-8",
    "Y-tunnus 0123456-7 ja toimipiste 1075004-0-3",
    "Hakuaika päättyy 30.11.2026 klo 16.00.",
    "Työaika ma-pe 8-16, 1.1.-31.12.2026.",
    "Requires 3-5 years of experience, team of 12-15 people",
    "Order number 123456 and 98765.",
    "http://data.europa.eu/esco/occupation/0a1b2c3d-ea01-4d8b-b09c-8bc128e447e6",
    "2026-11-13T17:09:34.719433Z",
  ])("%s", (text) => {
    expect(redactContacts(text)).toBe(text);
    expect(containsContact(text)).toBe(false);
  });
});

describe("containsContact", () => {
  it("detects emails and phones", () => {
    expect(containsContact("write to a@b.fi")).toBe(true);
    expect(containsContact("call +358 40 123 4567")).toBe(true);
    expect(containsContact("no contacts here")).toBe(false);
  });
  it("is idempotent after redaction", () => {
    const once = redactContacts("a@b.fi, 040 123 4567, name(at)x.fi");
    expect(redactContacts(once)).toBe(once);
    expect(containsContact(once)).toBe(false);
  });
});

describe("contact cues and scrubPostingText", () => {
  const CUES = [
    "Lisätietoja antaa Maija",
    "Lisätiedot hakemuksesta",
    "Tiedustelut: rekrytointi",
    "Yhteyshenkilö: Maija Meikäläinen",
    "Yhteydenotot [removed]",
    "Ota yhteyttä rekrytoijaan",
    "Kysy lisää meiltä",
    "For more information, ask us",
    "Further information is given by HR",
    "For questions please write",
    "Contact person: Anna Virtanen",
    "Please contact the recruiter",
    "Mer information ger HR",
    "Ytterligare information lämnas av chefen",
    "Upplysningar lämnas av chefen",
    "Kontaktperson: Anna Virtanen",
    "Frågor besvaras av chefen",
    "Teams interview with Kukka Roine, Manager",
  ];

  it.each(CUES)("sees a cue in %s", (text) => {
    expect(containsContactCue(text)).toBe(true);
    expect(scrubPostingText(`Työ on kiva.\n${text}\nPalkka sovitaan.`)).toBe("Työ on kiva.\nPalkka sovitaan.");
  });

  it("sees inflected stems", () => {
    expect(containsContactCue("Lisätiedoista kertoo esihenkilö.")).toBe(true);
    expect(containsContactCue("Tiedusteluihin vastaa HR.")).toBe(true);
  });

  it("keeps job sentences that only share a word with a cue", () => {
    for (const s of [
      "Toimit yhteyshenkilönä asiakkaiden ja urakoitsijoiden välillä.",
      "Vastaat asiakaspalvelun yhteydenottoihin ja sähköposteihin.",
      "Hoidat tuotteita Nokia Oyj:n ja Kone Oyj:n tehtailla Espoossa.",
      "Työskentelet Python-, AWS- ja Kubernetes-ympäristössä Helsingissä.",
    ]) {
      expect(containsContactCue(s)).toBe(false);
      expect(scrubPostingText(s)).toBe(s);
    }
  });

  it("removes a sentence with a marker, and the recruiter name in it", () => {
    const out = scrubPostingText("Kehität sovelluksia. Soita Maija Meikäläiselle p. 040 123 4567. Haku päättyy pian.");
    expect(out).toBe("Kehität sovelluksia. Haku päättyy pian.");
  });

  it("removes a three-line contact block with names", () => {
    const text = [
      "Haemme kehittäjää.",
      "",
      "Lisätietoja antaa:",
      "Maija Meikäläinen, palvelupäällikkö",
      "Toimitusjohtaja Mika Suominen",
      "",
      "Hae 30.11. mennessä.",
    ].join("\n");
    expect(scrubPostingText(text)).toBe("Haemme kehittäjää.\n\n\nHae 30.11. mennessä.");
  });

  it("removes list lines with a cue but not other list lines or name-like lines elsewhere", () => {
    expect(scrubPostingText("- Python\n- Lisätietoja: [removed]\n- React")).toBe("- Python\n- React");
    expect(scrubPostingText("Tiimi\nMaija Meikäläinen\nTyö on kiva.")).toBe("Tiimi\nMaija Meikäläinen\nTyö on kiva.");
  });

  it("is idempotent", () => {
    const text = "Työ.\nLisätietoja antaa Maija Meikäläinen, puh. 040 123 4567.\nMaija Meikäläinen\nHae pian.";
    const once = scrubPostingText(text);
    expect(scrubPostingText(once)).toBe(once);
    expect(once).not.toContain("Maija");
  });

  it("scrubSentenceList keeps positions", () => {
    expect(scrubSentenceList(["Työ on kiva.", "Lisätietoja antaa Maija Meikäläinen.", "Maija Meikäläinen", "Hae pian."])).toEqual([
      "Työ on kiva.",
      "[removed]",
      "[removed]",
      "Hae pian.",
    ]);
  });

  it("blankContactSentences leaves a [removed] line per sentence", () => {
    expect(blankContactSentences("Työ. Lisätietoja antaa Maija. Hae pian.")).toBe("Työ.\n[removed]\nHae pian.");
  });
});

describe("review fixes", () => {
  it("removes a recruiter line with a contact method and a name, and the fixture string", () => {
    expect(scrubPostingText("[removed]\n\nKuldip Kumar puhelimitse arkisin klo 9-16")).not.toContain("Kuldip");
    for (const s of [
      "Soita Maija Meikäläiselle.",
      "Kysymyksiin vastaa Maija Meikäläinen.",
      "Contact: John Smith, HR Manager",
      "Rekrytoija: Anna Virtanen",
      "Kontakta Anna Svensson.",
    ]) {
      expect(scrubPostingText(`Työ.\n${s}\nHae.`), s).toBe("Työ.\nHae.");
    }
  });

  it("removes weak-cue sentences naming one person", () => {
    expect(containsContactCue("Contact person for this role is Anna from our recruiting team.")).toBe(true);
    expect(containsContactCue("Yhteyshenkilönä toimii rekrytointipäällikkö virtanen talon sisällä.")).toBe(true);
    expect(containsContactCue("Toimia tärkeänä yhteyshenkilönä asiakkaiden ja tiimin välillä päivittäin.")).toBe(false);
    expect(containsContactCue("Varmistat, että yhteydenotot dokumentoidaan huolellisesti asiakasjärjestelmään.")).toBe(false);
  });

  it("removes name lines with markdown, a trailing period or a suffix", () => {
    for (const n of ["**Maija Meikäläinen**", "Maija Meikäläinen.", "Maija Meikäläinen (HR)", "- **Maija Meikäläinen**"]) {
      expect(scrubPostingText(`Työ.\nLisätietoja antaa:\n${n}\nHae.`), n).toBe("Työ.\nHae.");
    }
  });

  it("keeps job sentences that look like contact cues", () => {
    for (const s of [
      "Vastaat asiakkaiden tiedusteluihin puhelimitse ja sähköpostilla päivittäin.",
      "Otat yhteyttä asiakkaisiin ja sovit tapaamisia heidän kanssaan.",
      "You will interview with customers and gather their needs every week.",
    ]) {
      expect(containsContactCue(s), s).toBe(false);
    }
    expect(containsContactCue("Ota yhteyttä heti.")).toBe(true);
    expect(containsContactCue("Interview with Kukka Roine, Manager")).toBe(true);
  });

  it("does not take a place, a product or a customer for a person", () => {
    for (const s of [
      "Toimit yhteyshenkilönä Espoon kaupungin ja urakoitsijoiden välillä.",
      "You will be the contact person for Nordic customers.",
      "Hoidat asiakkaiden yhteydenotot Teamsissa ja puhelimessa.",
      "Otat yhteyttä asiakkaisiin Teamsin kautta ja sovit tapaamisia.",
      "The process includes an interview with Senior Management in Espoo.",
    ]) {
      expect(containsContactCue(s), s).toBe(false);
      expect(scrubPostingText(`Työ.\n${s}\nHae.`), s).toBe(`Työ.\n${s}\nHae.`);
    }
  });

  it("still removes a weak-cue sentence that names someone by title or after a linking verb", () => {
    for (const s of [
      "Tiedustelut tehtävästä ja hakemisesta ottaa vastaan rehtori Virtanen koulun kansliassa.",
      "Yhteydenotot tässä asiassa hoitaa rekrytointikoordinaattori Mäkinen arkisin toimistolla.",
      "The contact person for applicants during the summer weeks is Anna from our office.",
    ]) {
      expect(containsContactCue(s), s).toBe(true);
    }
  });
});

describe("redactContacts: time", () => {
  const n = 300_000;
  it("a long run of letters without @ is read once, not from every position", () => {
    redactContacts("warm up");
    for (const text of ["a".repeat(n), `${"a".repeat(n)} (at) b`, `${"a".repeat(n)} at b`, "a.b".repeat(n / 3), "a-".repeat(n / 2)]) {
      const t = process.cpuUsage(); // CPU time, so that a busy machine does not matter
      redactContacts(text);
      const spent = process.cpuUsage(t);
      expect((spent.user + spent.system) / 1000).toBeLessThan(1000);
    }
  });
  it("addresses next to such a run are still found", () => {
    expect(redactContacts(`${"a".repeat(1000)} jane.doe@example.fi`)).toBe(`${"a".repeat(1000)} ${R}`);
    expect(redactContacts("x jane.doe@example.fi, o'neil@example.co.uk; first+tag@sub.example.fi")).toBe(`x ${R}, ${R}; ${R}`);
    expect(redactContacts("etunimi.sukunimi (at) espoo.fi")).toBe(R);
    expect(redactContacts("etunimi at firma dot fi")).toBe(R);
  });
  it("two addresses glued together are both found", () => {
    expect(redactContacts("Contact a@b.fi_matti.meikalainen@firma.fi today")).toBe(`Contact ${R} today`);
    expect(redactContacts("jobs@a.fi+matti.m@b.fi")).toBe(R);
    expect(redactContacts("x@y.fi'liisa@z.fi")).toBe(R);
  });
  it("a long chain of glued addresses and a long run with underscores take linear time", () => {
    const t = process.cpuUsage();
    redactContacts("a@b.fi_".repeat(40_000));
    redactContacts("ab.cd_".repeat(40_000));
    const spent = process.cpuUsage(t);
    expect((spent.user + spent.system) / 1000).toBeLessThan(1500);
  });
});
