/**
 * Choosing the postings behind the masked demo companies (docs/specs/synthetic-world.md 4).
 * Deterministic: candidates are ordered by a hash of the synthetic seed and the posting id,
 * then picked greedily until the quotas are met. Employers are distinct, so no two masked
 * companies can be traced to the same real employer.
 */
import { and, eq, inArray, isNull, or, gt } from "drizzle-orm";
import type { EmployerSector, JobSource, Lang } from "@/contracts";
import type { Db } from "@/db/client";
import { escoConcept, job } from "@/db/schema";
import { seededHash } from "./prng";

export const STAFFING_AGENCY = /henkilöstöpalvelu|rekry|staffing|barona|adecco|manpower|personnel|eezy|opteam|academic work/i;
const PUBLIC_NAME = /kaupunki|kunta\b|kuntayhtymä|hyvinvointialue|virasto|ministeriö|valtion|city of|municipality|wellbeing services/i;
const FINNISH_REQUIREMENT = /suomen kiel|suomea|finnish|kielitaito/i;
const STATUTORY_LANGUAGE = /kielitaitolaki|424\/2003|kielitaitovaatimus|virkaan|tehtävään vaadittava kielitaito|suomen kiel|ruotsin kiel|finnish|swedish/i;
const LICENCE_OR_CLEARANCE =
  /turvallisuusselvitys|security clearance|rikostaustaote|criminal record|laillistettu|valvira|terhikki|ammattioikeus|kelpoisuus|pätevyys|ajokortti|ammattipätevyys|hygieniapassi|työturvallisuuskortti|tulityökortti|sähköpätevyys|anniskelupassi|registered nurse|licen[cs]ed?|driving licen[cs]e|qualification required/i;

export const MIN_SENTENCES = 8;

export type DemoCandidate = {
  jobId: string;
  title: string;
  employerName: string;
  employerBusinessId: string | null;
  source: JobSource;
  sector: EmployerSector;
  lang: Lang;
  /** First two digits of the ISCO code of the posting's first ESCO occupation. */
  isco2: string | null;
  sentenceCount: number;
  text: string;
};

export type DemoPick = {
  /** 1-based; the pitch company is 03. */
  number: number;
  candidate: DemoCandidate;
  /** Why this posting was picked, for the printout. */
  tags: string[];
};

export type DemoSelection = { picks: DemoPick[]; unmet: string[] };

/** Postings that could stand in for a demo company on `eventDate`. */
export async function loadDemoCandidates(db: Db, eventDate: Date): Promise<DemoCandidate[]> {
  const rows = await db
    .select()
    .from(job)
    .where(and(eq(job.active, true), eq(job.municipalityCode, "049"), or(isNull(job.expiresAt), gt(job.expiresAt, eventDate))));
  const firstOccupation = new Map(rows.map((r) => [r.id, r.escoOccupationUris[0]]));
  const uris = [...new Set([...firstOccupation.values()].filter((u): u is string => Boolean(u)))];
  const iscoByUri = new Map<string, string | null>();
  if (uris.length > 0) {
    for (const c of await db.select().from(escoConcept).where(inArray(escoConcept.uri, uris))) iscoByUri.set(c.uri, c.isco);
  }
  return rows
    .filter((r) => r.sentences.length >= MIN_SENTENCES && r.escoOccupationUris.length > 0 && !STAFFING_AGENCY.test(r.employerName))
    .map((r) => ({
      jobId: r.id,
      title: r.title,
      employerName: r.employerName,
      employerBusinessId: r.employerBusinessId,
      source: r.source,
      sector: r.sector,
      lang: r.lang,
      isco2: (iscoByUri.get(firstOccupation.get(r.id) ?? "") ?? "").slice(0, 2) || null,
      sentenceCount: r.sentences.length,
      text: `${r.title}\n${r.description}`,
    }));
}

const isPublic = (c: DemoCandidate) => c.sector === "public" || c.source === "kuntarekry" || PUBLIC_NAME.test(c.employerName);
const tagsOf = (c: DemoCandidate) => ({
  en: c.lang === "en",
  finnishPosting: c.lang === "fi" && FINNISH_REQUIREMENT.test(c.text),
  publicStatutory: isPublic(c) && STATUTORY_LANGUAGE.test(c.text),
  licence: LICENCE_OR_CLEARANCE.test(c.text),
  ict: c.isco2 === "25",
  finnishRequirement: FINNISH_REQUIREMENT.test(c.text),
});

export const PITCH_NUMBER = 3;

/**
 * `pitchJobId` names the posting behind the pitch company (number 03). The demo script is written
 * around one need, so the lead chooses it by reading the real postings; without it the first
 * ICT posting with a Finnish requirement is taken.
 */
export function selectDemoPostings(candidates: DemoCandidate[], options: { count?: number; pitchJobId?: string } = {}): DemoSelection {
  const count = options.count ?? 8;
  const large = count >= 12;
  const order = [...candidates].sort((a, b) => seededHash("demo-company", a.jobId).localeCompare(seededHash("demo-company", b.jobId)));
  const picks: DemoCandidate[] = [];
  const employers = new Set<string>();
  const unmet: string[] = [];
  const employerKey = (c: DemoCandidate) => (c.employerBusinessId ?? c.employerName).toLowerCase();

  const take = (pred: (c: DemoCandidate) => boolean): DemoCandidate | null => {
    if (picks.length >= count) return null;
    const c = order.find((x) => !picks.includes(x) && !employers.has(employerKey(x)) && pred(x));
    if (!c) return null;
    picks.push(c);
    employers.add(employerKey(c));
    return c;
  };
  const have = (pred: (c: DemoCandidate) => boolean) => picks.filter(pred).length;

  // The pitch posting: the one the lead named, else ICT, a Finnish requirement, English if any exists.
  const named = options.pitchJobId ? take((c) => c.jobId === options.pitchJobId) : null;
  if (options.pitchJobId && !named) unmet.push(`pitch posting: ${options.pitchJobId} is not among the candidates (expired, too short, or a staffing agency)`);
  const pitch =
    named ??
    take((c) => tagsOf(c).ict && tagsOf(c).finnishRequirement && tagsOf(c).en) ??
    take((c) => tagsOf(c).ict && tagsOf(c).finnishRequirement) ??
    take((c) => tagsOf(c).ict);
  if (!pitch) unmet.push("pitch posting: no ICT posting with a Finnish requirement");
  else if (!tagsOf(pitch).finnishRequirement) unmet.push("pitch posting: found an ICT posting but without a Finnish requirement");

  const quotas: Array<[string, number, (c: DemoCandidate) => boolean]> = [
    ["public employer with a statutory language requirement", 1, (c) => tagsOf(c).publicStatutory],
    ["licence or clearance requirement", large ? 2 : 1, (c) => tagsOf(c).licence],
    ["Finnish-language posting with a Finnish language requirement", large ? 3 : 2, (c) => tagsOf(c).finnishPosting],
    ["posting in English", large ? 3 : 2, (c) => tagsOf(c).en],
  ];
  for (const [name, need, pred] of quotas) {
    while (have(pred) < need) {
      if (!take(pred)) {
        unmet.push(`${name}: found ${have(pred)} of ${need}`);
        break;
      }
    }
  }
  const groups = () => new Set(picks.map((c) => c.isco2).filter(Boolean));
  const needGroups = large ? 6 : 4;
  while (groups().size < needGroups) {
    if (!take((c) => c.isco2 !== null && !groups().has(c.isco2))) {
      unmet.push(`distinct ISCO groups: found ${groups().size} of ${needGroups}`);
      break;
    }
  }
  // Fill to the target: one posting per new ISCO group, then any.
  while (picks.length < count && take((c) => c.isco2 !== null && !groups().has(c.isco2))) {
    /* keep going */
  }
  while (picks.length < count && take(() => true)) {
    /* keep going */
  }
  if (picks.length < count) unmet.push(`only ${picks.length} usable postings for ${count} companies`);

  // Numbers 01..N in pick order, except that the pitch posting is 03.
  const numbered: DemoPick[] = [];
  const free = Array.from({ length: picks.length }, (_, i) => i + 1).filter((n) => !(pitch && picks.length >= PITCH_NUMBER && n === PITCH_NUMBER));
  for (const c of picks) {
    const t = tagsOf(c);
    const tags = [t.ict && t.finnishRequirement && c === pitch ? "pitch" : null, t.en ? "english" : null, t.finnishPosting ? "finnish requirement" : null, t.publicStatutory ? "public, statutory language" : null, t.licence ? "licence or clearance" : null, c.isco2 ? `ISCO ${c.isco2}` : null].filter((x): x is string => x !== null);
    const number = c === pitch && picks.length >= PITCH_NUMBER ? PITCH_NUMBER : free.shift()!;
    numbered.push({ number, candidate: c, tags });
  }
  return { picks: numbered.sort((a, b) => a.number - b.number), unmet };
}
