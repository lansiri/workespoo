/**
 * Real CVs rarely look tidy: the name sits beside a job title, after it, in capitals, with a
 * particle ("von", "de"), on one line with the contacts, or only in the email address. These
 * layouts are synthetic (docs: people data is synthetic) and cover English, Finnish and Swedish.
 */
import { describe, expect, it } from "vitest";
import { anonymiseCv } from "./cv-anonymise";

type Case = { name: string; cv: string; gone: string[]; kept: string[] };

const cases: Case[] = [
  {
    name: "EN: name and job title on one line, contacts on the next",
    cv: `Aino Virtanen – Customer Service Specialist
aino.virtanen@example.fi · +358 40 123 4567 · Espoo, Finland

WORK EXPERIENCE
Customer Service Specialist, Nokia
Aino handled 60 customer chats a day and wrote the team's help articles.`,
    gone: ["Aino", "Virtanen", "@", "358", "Espoo"],
    kept: ["handled 60 customer chats a day", "help articles"],
  },
  {
    name: "EN: job title first, name second",
    cv: `Pastry Chef
Mikko Korhonen
mikko@example.com

EXPERIENCE
Baked 400 loaves a day for a hotel kitchen. Mikko also trained two apprentices.`,
    gone: ["Mikko", "Korhonen", "@"],
    kept: ["Baked 400 loaves a day", "trained two apprentices"],
  },
  {
    name: "EN: name, title and contacts all on one extracted line",
    cv: `Aino Maria Virtanen Software Developer aino.virtanen@example.fi +358 40 123 4567 Helsinki

EXPERIENCE
Built a booking system in TypeScript.`,
    gone: ["Aino", "Maria", "Virtanen", "@", "358", "Helsinki"],
    kept: ["Built a booking system in TypeScript."],
  },
  {
    name: "EN: name in capitals, surname first",
    cv: `VIRTANEN AINO
Warehouse Worker

EXPERIENCE
Aino Virtanen drove reach trucks. Virtanen counted stock every Friday.`,
    gone: ["Aino", "Virtanen", "VIRTANEN", "AINO"],
    kept: ["drove reach trucks", "counted stock every Friday"],
  },
  {
    name: "EN: particles and hyphens in the name",
    cv: `Johan von Essen
Anna-Karin Svensson-Lehtonen

EXPERIENCE
Johan von Essen led the move to a new ticket system. Svensson-Lehtonen presented it.`,
    gone: ["Johan", "Essen", "Anna-Karin", "Svensson", "Lehtonen"],
    kept: ["led the move to a new ticket system"],
  },
  {
    name: "EN: the name is only in the email address and the LinkedIn link",
    cv: `Profile
Operations planner who moved scheduling from paper to a shared calendar.
Reach me: erik.lindstrom@example.se, linkedin.com/in/erik-lindstrom-4821
Erik Lindstrom, Operations Planner

EXPERIENCE
Erik planned shifts for 25 people.`,
    gone: ["Erik", "Lindstrom", "@", "linkedin"],
    kept: ["moved scheduling from paper to a shared calendar", "planned shifts for 25 people"],
  },
  {
    name: "FI: nimi ja titteli samalla rivillä, osoite ja ikä",
    cv: `ANSIOLUETTELO
Mikko Korhonen, myyntineuvottelija
Puhelin 040 555 1234 | mikko.korhonen@example.fi
Hämeenkatu 5 B 12, 33100 Tampere
35-vuotias

TYÖKOKEMUS
Myyntineuvottelija, Kesko
Mikko vastasi kaupan kampanjoista ja koulutti kolme uutta työntekijää.

KIELET
Suomi (äidinkieli), englanti, ruotsi`,
    gone: ["Mikko", "Korhonen", "@", "040", "Hämeenkatu", "33100", "Tampere", "35-vuotias", "äidinkieli"],
    kept: ["vastasi kaupan kampanjoista", "koulutti kolme uutta työntekijää"],
  },
  {
    name: "FI: titteli ensin, nimi toisella rivillä, taivutettu nimi tekstissä",
    cv: `Sairaanhoitaja
Aino Maria Virtanen
Vantaa

TYÖKOKEMUS
Aino Mari Virtasen työ osastolla: lääkehoito, potilasohjaus ja kirjaaminen.
Virtanen toimi myös perehdyttäjänä.`,
    gone: ["Aino", "Virtanen", "Vantaa"],
    kept: ["lääkehoito, potilasohjaus ja kirjaaminen", "toimi myös perehdyttäjänä"],
  },
  {
    name: "FI: syntymäaika ja kansalaisuus erillisillä riveillä",
    cv: `Mikko Korhonen
Syntymäaika: 12.3.1988
Kansalaisuus: suomi
Siviilisääty: naimisissa, 2 lasta

TYÖKOKEMUS
Kokki, Ravintola Aalto 2019–
Suunnittelin lounaslistan ja tilasin raaka-aineet.`,
    gone: ["Mikko", "Korhonen", "1988", "Kansalaisuus", "naimisissa", "lasta"],
    kept: ["Suunnittelin lounaslistan ja tilasin raaka-aineet."],
  },
  {
    name: "SV: namn och titel, adress, personnummer, född",
    cv: `Erik Lindström – Säljare
erik.lindstrom@example.se | 070-123 45 67
Storgatan 12, 411 38 Göteborg
Född 1985 i Malmö. Gift, två barn.

ARBETSLIVSERFARENHET
Säljare, Stockmann
Erik ansvarade för kassan och utbildade tre nya medarbetare.

SPRÅK
Svenska (modersmål), finska, engelska`,
    gone: ["Erik", "Lindström", "@", "070", "Storgatan", "411 38", "Göteborg", "1985", "Malmö", "Gift", "modersmål"],
    kept: ["ansvarade för kassan", "utbildade tre nya medarbetare"],
  },
  {
    name: "SV: titel först, namn därefter, Helsingfors i huvudet",
    cv: `Sjuksköterska
Anna Karin Svensson
Helsingfors

ERFARENHET
Anna Karin arbetade på en akutavdelning med läkemedelshantering och patientutbildning.
Svensson handledde två studerande.`,
    gone: ["Anna", "Karin", "Svensson", "Helsingfors"],
    kept: ["arbetade på en akutavdelning", "handledde två studerande"],
  },
];

describe("anonymiseCv on realistic layouts", () => {
  it.each(cases)("$name", ({ cv, gone, kept }) => {
    const { text } = anonymiseCv(cv);
    for (const g of gone) expect(text, `still has "${g}"`).not.toContain(g);
    for (const k of kept) expect(text, `lost "${k}"`).toContain(k);
  });

  it("a removed name leaves no stray separator or double marker behind", () => {
    const { text } = anonymiseCv("Aino Virtanen – Customer Service Specialist\nWORK EXPERIENCE\nHelped customers.");
    expect(text).toBe("Customer Service Specialist\nWORK EXPERIENCE\nHelped customers.");
  });

  it("Finnish endings of the name are removed too (Ainon, Virtasen, Virtaselle)", () => {
    const { text } = anonymiseCv("Aino Virtanen\n\nTYÖKOKEMUS\nAinon tiimi. Virtasen työ. Esimies antoi Virtaselle vastuun.");
    expect(text).not.toMatch(/Aino|Virta/);
    expect(text).toContain("tiimi.");
    expect(text).toContain("vastuun.");
  });

  it("the name is found from the email address when no line looks like a name", () => {
    const { text } = anonymiseCv("EXPERIENCE\nMikko Korhonen ran the night shift.\nmikko.korhonen@example.fi");
    expect(text).not.toMatch(/Mikko|Korhonen|@/);
    expect(text).toContain("ran the night shift.");
  });
});

describe("anonymiseCv does not remove work content for a name", () => {
  it("keeps job titles, employers and towns in the body", () => {
    const { text } = anonymiseCv(`Operations Planner
Helsinki

EXPERIENCE
Planned shifts for 25 people at Wolt and Posti.
Worked with Kesko Oy and Stockmann in Tampere.`);
    expect(text).toContain("Operations Planner");
    expect(text).toContain("Wolt and Posti");
    expect(text).toContain("Kesko Oy and Stockmann in Tampere");
    expect(text).not.toContain("Helsinki");
  });

  it("an employer line is not taken for a person, with or without headings", () => {
    const { text } = anonymiseCv(`I work as a Project Coordinator at Nordea Bank. Experienced with Jira.

Project Coordinator, Nordea Bank
Led the move to Jira for 40 people.`);
    expect(text).toContain("Project Coordinator, Nordea Bank");
    expect(text).toContain("Led the move to Jira for 40 people.");
  });

  it("a Swedish or Finnish job title on the first line stays", () => {
    expect(anonymiseCv("Sjuksköterska\n\nERFARENHET\nArbetade på en akutavdelning.").text).toContain("Sjuksköterska");
    expect(anonymiseCv("Hitsaaja\n\nTYÖKOKEMUS\nHitsasin teräsrakenteita.").text).toContain("Hitsaaja");
  });
});
