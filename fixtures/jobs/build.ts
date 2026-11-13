/**
 * Rebuilds fixtures/jobs/tmt-sample.json and fixtures/esco/subset.json from the live
 * endpoints. Run once by hand: `npx tsx fixtures/jobs/build.ts`. Not part of the tests.
 */
import { writeFileSync } from "node:fs";
import { createPoliteFetcher } from "../../src/features/jobs/polite-fetch";
import {
  ESCO_OCCUPATIONS_URL,
  ESCO_SKILLS_URL,
  mapOccupationRow,
  mapSkillRow,
} from "../../src/features/jobs/esco-import";
import { normaliseTmtPosting, TMT_DETAIL_URL, TMT_SEARCH_URL } from "../../src/features/jobs/tmt";
import { ESCO_API_BASE, ESCO_VERSION } from "../../src/features/jobs/esco-occupations";

const CATEGORIES: Array<[string, string, number]> = [
  ["software", "ohjelmistokehittäjä", 5],
  ["engineering", "insinööri", 5],
  ["healthcare", "sairaanhoitaja", 5],
  ["construction", "rakennus", 4],
  ["logistics", "varasto", 4],
  ["customer service", "asiakaspalvelu", 4],
  ["education", "opettaja", 4],
  ["cleaning", "siivooja", 4],
  ["kitchen", "keittiö", 4],
  ["english", "developer", 2],
];

function stripAltLabels(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAltLabels);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([k]) => k !== "altLabel").map(([k, v]) => [k, stripAltLabels(v)]),
    );
  }
  return value;
}

async function main() {
  const http = createPoliteFetcher({ timeoutMs: 120_000 });
  const chosen = new Map<string, string>();
  for (const [label, query, n] of CATEGORIES) {
    const page = await http.postJson<{ content: Array<{ id: string; title?: Record<string, string> }> }>(TMT_SEARCH_URL, {
      query,
      filters: { municipalities: ["049"], ...(label === "english" ? { postingLanguages: ["en"] } : {}) },
      paging: { pageNumber: 0, pageSize: 25 },
      sorting: "MOST_RELEVANT",
    });
    let taken = 0;
    for (const item of page.content) {
      if (taken >= n) break;
      if (chosen.has(item.id)) continue;
      chosen.set(item.id, label);
      taken++;
    }
    console.error(`${label}: ${taken}`);
  }

  const postings: unknown[] = [];
  const skillUris = new Set<string>();
  const occupationUris = new Set<string>();
  for (const id of chosen.keys()) {
    const detail = await http.getJson(`${TMT_DETAIL_URL}/${id}`);
    const n = normaliseTmtPosting(detail, { postingId: id, preferMunicipalities: ["049"] });
    if (!n) continue;
    postings.push(stripAltLabels(n.job.raw));
    n.job.escoSkillUris?.forEach((u) => skillUris.add(u));
    n.job.escoOccupationUris?.forEach((u) => occupationUris.add(u));
  }
  writeFileSync(new URL("./tmt-sample.json", import.meta.url), JSON.stringify(postings));
  console.error(`postings: ${postings.length}, skills ${skillUris.size}, occupations ${occupationUris.size}`);

  const skillRows = await http.getJson<unknown[]>(ESCO_SKILLS_URL);
  const occRows = await http.getJson<unknown[]>(ESCO_OCCUPATIONS_URL);
  const concepts = new Map<string, ReturnType<typeof mapSkillRow>>();
  const allSkills = skillRows.map((r) => mapSkillRow(r)).filter((r) => r !== null);
  const all = new Map([...allSkills, ...occRows.map((r) => mapOccupationRow(r)).filter((r) => r !== null)].map((r) => [r.uri, r]));
  for (const uri of [...skillUris, ...occupationUris]) {
    const c = all.get(uri);
    if (c) concepts.set(uri, c);
  }

  const esco = createPoliteFetcher({ maxConcurrent: 1, minIntervalMs: 500, timeoutMs: 60_000, retries: 4, backoffMs: 2000 });
  const links: Array<{ occupationUri: string; skillUri: string; relation: "essential" | "optional" }> = [];
  for (const uri of occupationUris) {
    if (!uri.startsWith("http://data.europa.eu/esco/occupation/")) continue;
    try {
      const d = await esco.getJson<{ _links?: Record<string, Array<{ uri?: string }>> }>(
        `${ESCO_API_BASE}/resource/occupation?uri=${encodeURIComponent(uri)}&language=en&selectedVersion=${ESCO_VERSION}`,
      );
      const seen = new Set<string>();
      for (const [rel, key] of [["essential", "hasEssentialSkill"], ["optional", "hasOptionalSkill"]] as const) {
        for (const l of d._links?.[key] ?? []) {
          if (!l.uri || seen.has(l.uri)) continue;
          seen.add(l.uri);
          links.push({ occupationUri: uri, skillUri: l.uri, relation: rel });
          const c = all.get(l.uri);
          if (c) concepts.set(l.uri, c);
        }
      }
    } catch (e) {
      console.error("occupation failed", uri, e instanceof Error ? e.message : e);
    }
  }

  // Distractors: common skills by keyword, then a seeded sample, up to 200 beyond the linked ones.
  const KEYWORDS = [
    "python", "java", "sql", "javascript", "welding", "customer", "forklift", "nursing", "teach", "clean",
    "cook", "first aid", "project manag", "communicat", "team", "driving", "excel", "accounting", "sales",
    "marketing", "programming", "data", "construction", "safety", "english", "finnish", "plumb", "electric",
  ];
  const extra = new Map<string, NonNullable<ReturnType<typeof mapSkillRow>>>();
  const pool = allSkills.filter((s) => !s.retired && !concepts.has(s.uri));
  for (const s of pool) {
    if (extra.size >= 120) break;
    if (KEYWORDS.some((k) => s.labelEn.toLowerCase().includes(k)) && Math.sin(s.uri.length + extra.size) > -2) {
      if (!extra.has(s.uri) && extra.size < 120 && s.labelEn.split(" ").length <= 4) extra.set(s.uri, s);
    }
  }
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  while (extra.size < 200) {
    const s = pool[Math.floor(rnd() * pool.length)];
    if (s) extra.set(s.uri, s);
  }
  for (const [u, s] of extra) concepts.set(u, s);

  writeFileSync(
    new URL("../esco/subset.json", import.meta.url),
    JSON.stringify({ concepts: [...concepts.values()], occupationSkills: links }),
  );
  console.error(`concepts ${concepts.size}, links ${links.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
