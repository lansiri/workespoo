import { describe, expect, it } from "vitest";
import { containsContact, redactContacts } from "./redact";

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
