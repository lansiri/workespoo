import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findProtectedCard } from "@/lib/lexicon";
import { FIXTURE_ESCO_SUBSET } from "../../../fixtures/load";
import { loadPersonas, parsePersona, PERSONA_DIR } from "./persona";

const personas = loadPersonas();
const raw = (id: string) => JSON.parse(readFileSync(path.join(PERSONA_DIR, `${id}.json`), "utf8"));

describe("persona files", () => {
  it("loads and validates all fifteen", () => {
    expect(personas).toHaveLength(15);
    expect(personas.map((p) => p.id)).toEqual(Array.from({ length: 15 }, (_, i) => `p${String(i + 1).padStart(2, "0")}`));
  });

  it("has the language and mode spread the brief asks for", () => {
    const count = (f: (p: (typeof personas)[number]) => boolean) => personas.filter(f).length;
    expect(count((p) => p.interviewLang === "en")).toBe(10);
    expect(count((p) => p.interviewLang === "fi")).toBe(3);
    expect(count((p) => p.interviewLang === "sv")).toBe(2);
    expect(count((p) => p.interviewMode === "express")).toBe(3);
  });

  it("labels everyone as synthetic", () => {
    for (const p of personas) {
      expect(p.synthetic).toBe(true);
      expect(p.name.endsWith(" (synthetic)")).toBe(true);
      expect(p.email.endsWith("@example.invalid")).toBe(true);
    }
  });

  it("plants one or two protected facts, each present in its answer", () => {
    for (const p of personas) {
      expect(p.planted.length).toBeGreaterThanOrEqual(1);
      expect(p.planted.length).toBeLessThanOrEqual(2);
      for (const fact of p.planted) {
        for (const token of fact.tokens) expect(p.answers[fact.area].toLowerCase()).toContain(token.toLowerCase());
      }
    }
  });

  it("uses real ESCO skills and occupations from the fixture", () => {
    const { concepts } = FIXTURE_ESCO_SUBSET();
    const uris = new Set(concepts.map((c) => c.uri));
    for (const p of personas) {
      expect(uris.has(p.occupationUri), `${p.id} occupation`).toBe(true);
      for (const f of p.facts) expect(uris.has(f.skillUri), `${p.id} ${f.label}`).toBe(true);
      for (const u of p.omit) expect(uris.has(u), `${p.id} omit`).toBe(true);
    }
  });

  it("never mentions an omitted skill", () => {
    const { concepts } = FIXTURE_ESCO_SUBSET();
    const label = new Map(concepts.map((c) => [c.uri, c.labelEn]));
    for (const p of personas) {
      const text = [...Object.values(p.answers), ...p.probes].join(" ").toLowerCase();
      for (const u of p.omit) {
        const l = (label.get(u) ?? "").replace(/\s*\(.*\)/, "").toLowerCase();
        expect(text, `${p.id} mentions ${l}`).not.toContain(l);
      }
    }
  });

  it("keeps stories free of names and protected words", () => {
    for (const p of personas) {
      for (const f of p.facts) {
        expect(findProtectedCard(f.story), `${p.id}: ${f.story}`).toEqual([]);
      }
    }
  });

  it("has unique handles and emails", () => {
    expect(new Set(personas.map((p) => p.handle)).size).toBe(15);
    expect(new Set(personas.map((p) => p.email)).size).toBe(15);
  });
});

describe("persona schema", () => {
  it("rejects a missing coverage area", () => {
    const bad = raw("p01");
    delete bad.answers.tools;
    expect(() => parsePersona(bad, "p01.json")).toThrow(/p01\.json is not a valid persona/);
  });

  it("rejects a persona with no planted fact", () => {
    const bad = raw("p01");
    bad.planted = [];
    expect(() => parsePersona(bad)).toThrow(/planted/);
  });

  it("rejects a planted token that is not in the answer", () => {
    const bad = raw("p01");
    bad.planted[0].tokens = ["Atlantis"];
    expect(() => parsePersona(bad)).toThrow(/Atlantis/);
  });

  it("rejects a name without the synthetic label and a real-looking email", () => {
    const a = raw("p01");
    a.name = "Tomás Ribeiro";
    expect(() => parsePersona(a)).toThrow(/name/);
    const b = raw("p01");
    b.email = "tomas@gmail.com";
    expect(() => parsePersona(b)).toThrow(/email/);
  });

  it("rejects a planted fact in an area an express interview never asks", () => {
    const bad = raw("p10");
    bad.planted[0].area = "beyond";
    bad.answers.beyond += " I am 58 and had a knee operation.";
    expect(() => parsePersona(bad)).toThrow(/express/);
  });
});
