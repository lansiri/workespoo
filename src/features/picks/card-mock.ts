/** Test doubles for the card feature's projections. Not used by production code. */
import type { CardForCompany, CardForCompanyRevealed, CardForOrganiser } from "@/contracts";

export function companyCard(talentId: string, over: Partial<CardForCompany> = {}): CardForCompany {
  return {
    handle: `Maple-${talentId.slice(-3)}`,
    synthetic: true,
    headline: "Builds data pipelines",
    summary: "Builds data pipelines.",
    renderingLabel: "English rendering",
    signals: [
      { id: "s1", phrase: "Python data pipelines", kind: "skill", esco: null, rendering: "Built nightly pipelines in Python (English rendering)." },
      { id: "s2", phrase: "SQL queries", kind: "skill", esco: null, rendering: "Wrote SQL queries for quality checks (English rendering)." },
    ],
    lookingFor: { roles: [], workMode: null, startFrom: null, workLanguages: [] },
    ...over,
  };
}

export function organiserCard(talentId: string): CardForOrganiser {
  return { ...companyCard(talentId), talentId, inPool: true, version: 1, approvedAt: "2026-11-10T10:00:00.000Z" };
}

/** What the card feature returns after an accepted introduction. It includes fields the page must never pass on. */
export function revealedCard(talentId: string, name = "Aino Testi"): CardForCompanyRevealed {
  const base = companyCard(talentId);
  return {
    ...base,
    signals: base.signals.map((s) => ({ ...s, phraseOwn: null, quotes: [`QUOTE-${s.id}: I built the nightly load myself.`] })),
    identity: { displayName: name, contact: "aino@example.invalid" },
    interviewLang: "fi",
    inputModes: ["voice"],
  };
}
