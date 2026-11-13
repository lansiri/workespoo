/**
 * Builds cases.json for the need-card-draft prompt from real fixture postings.
 *
 *   npx tsx evals/prompt-lab/need-card-draft/build-cases.ts [variant-system.txt] [out.json]
 *
 * - The system message is read verbatim from docs/specs/prompts/need-card-draft.md (first
 *   code block after "## System message"), unless a variant file is given.
 * - Postings go through the real normaliser (src/features/jobs/tmt.ts), so sentences are
 *   exactly what ingestion stores (need-card.md section 2).
 * - Candidate list per need-card.md 3.4.1: posting skill URIs, then essential skills of its
 *   occupations, then optional ones, at most 40, plus a few similar-sounding distractors
 *   from fixtures/esco/subset.json mixed in.
 * Writes cases-meta.json next to it (sentences, candidates, employer, sector) for check.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FIXTURE_ESCO_SUBSET, FIXTURE_TMT_POSTINGS } from "../../../fixtures/load";
import { normaliseTmtPosting } from "@/features/jobs/tmt";

const DIR = "evals/prompt-lab/need-card-draft";

type Pick = { id: string; index: number; situation: string; brands: string[] };

// Fixture index -> case. Brands are employer/client names that appear in the text itself.
export const PICKS: Pick[] = [
  { id: "fi-long-list-dev", index: 0, situation: "long Finnish posting with clear lists; degree; clearance; English work language; >12 asks", brands: ["Academic Work"] },
  { id: "fi-over12-satellite", index: 8, situation: "more than 12 possible requirements; state-owned; security clearance by law; equality statement naming age/gender", brands: ["Erillisverkot", "Erillisverkko", "Erve"] },
  { id: "fi-prose-chef", index: 37, situation: "requirements buried in prose; 3 years 'in Finland'; hygiene passport; driving licence", brands: ["Spoon", "Restaurants By Spoon", "Rosegarden", "Lunchbox"] },
  { id: "en-mobile-fluent-fi", index: 40, situation: "English posting demanding fluent Finnish; 5 years; residency in Finland", brands: ["Lokki", "Seagull"] },
  { id: "en-rd-director", index: 39, situation: "English posting; 15+ years; many soft asks; English working language", brands: ["Kuori"] },
  { id: "fi-public-nurse-kauniainen", index: 14, situation: "public employer (wellbeing services county); Finnish required; Swedish/English a plus; licensed nurse; vaccination and TB check by law", brands: ["Länsi-Uudenmaan hyvinvointialue", "Kauniaisten terveysasema"] },
  { id: "fi-public-ece-teacher", index: 27, situation: "public employer (City of Espoo); statutory degree (kelpoisuus); criminal record extract; TB check", brands: ["Espoon kaupunki", "Eestinkallio"] },
  { id: "fi-cards-tiler", index: 17, situation: "licences and cards: occupational safety card, hot work card, wet-room certificate, B licence", brands: ["Latva Saneeraus", "Latva"] },
  { id: "fi-fluent-fi-cook", index: 36, situation: "fluent Finnish must for a cook (language question applies); hygiene passport", brands: ["StaffMill"] },
  { id: "fi-vague-age18", index: 19, situation: "vague posting of soft asks; age 18+ stated; own car", brands: ["Joblink"] },
  { id: "fi-very-short-pizza", index: 20, situation: "very short posting (2 sentences); 2 years", brands: ["Kotipizza", "Bite & Beans"] },
  { id: "fi-native-fi-nurse", index: 12, situation: "native Finnish speaker as alternative to C1/C2; licensed nurse (Valvira); 2 years", brands: ["Pendo", "Kotisairaanhoito Pendo"] },
  { id: "fi-swedish-norway", index: 13, situation: "Swedish language skill for work in Norway; recruiter name left in text", brands: ["Jobby"] },
];

function specSystemMessage(): string {
  const md = readFileSync("docs/specs/prompts/need-card-draft.md", "utf8");
  const after = md.split("## System message")[1]!;
  const m = /```\n([\s\S]*?)\n```/.exec(after)!;
  return m[1]!;
}

function main() {
  const variant = process.argv[2];
  const out = process.argv[3] ?? path.join(DIR, "cases.json");
  const system = variant ? readFileSync(variant, "utf8").trimEnd() : specSystemMessage();
  const subset = FIXTURE_ESCO_SUBSET();
  const byUri = new Map(subset.concepts.map((c) => [c.uri, c]));
  const postings = FIXTURE_TMT_POSTINGS();

  const cases = [];
  const meta: Record<string, unknown> = {};
  for (const p of PICKS) {
    const n = normaliseTmtPosting(postings[p.index], { preferMunicipalities: ["049"] });
    if (!n) throw new Error(`fixture ${p.index} did not normalise`);
    const job = n.job as unknown as {
      title: string; lang: string; workLanguages: string[]; sentences: string[]; employerName: string;
      sector: string; source: string; escoSkillUris: string[]; escoOccupationUris: string[];
    };

    // 3.4.1: posting skills, essential, optional; cap 40 with 6 slots kept for distractors.
    const links = subset.occupationSkills.filter((l) => job.escoOccupationUris.includes(l.occupationUri));
    const ordered = [
      ...job.escoSkillUris,
      ...links.filter((l) => l.relation === "essential").map((l) => l.skillUri),
      ...links.filter((l) => l.relation === "optional").map((l) => l.skillUri),
    ].filter((u) => byUri.has(u) && !byUri.get(u)!.retired);
    const real = [...new Set(ordered)].slice(0, 34);

    // Distractors: skills not linked to these occupations whose English label shares a
    // word of 5+ letters with a real candidate or the posting title. Deterministic.
    const linked = new Set(links.map((l) => l.skillUri).concat(job.escoSkillUris));
    const words = new Set(
      real.flatMap((u) => byUri.get(u)!.labelEn.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length >= 5),
    );
    const distractors = subset.concepts
      .filter((c) => c.type === "skill" && !c.retired && !linked.has(c.uri))
      .map((c) => ({ c, score: c.labelEn.toLowerCase().split(/[^a-z]+/).filter((w) => words.has(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.c.uri.localeCompare(b.c.uri))
      .slice(0, 6)
      .map((x) => x.c.uri);
    const candidates: string[] = [];
    let d = 0;
    real.forEach((u, i) => {
      candidates.push(u);
      if (i % 5 === 4 && d < distractors.length) candidates.push(distractors[d++]!);
    });
    while (d < distractors.length) candidates.push(distractors[d++]!);

    const lines = [
      `Posting language: ${job.lang}`,
      `Posting title: ${job.title}`,
      `Work languages listed by the source: ${job.workLanguages.length ? job.workLanguages.join(", ") : "none listed"}`,
      "",
      "Posting sentences:",
      ...job.sentences.slice(0, 120).map((s, i) => `[P${i}] ${s}`),
      "",
      'ESCO skills you may use in "esco":',
      ...candidates.map((u, k) => {
        const c = byUri.get(u)!;
        return `K${k + 1}: ${c.labelEn} / ${c.labelFi ?? c.labelEn}`;
      }),
      "",
      "Return JSON with keys: title, summary, requirements, dropped.",
    ];
    cases.push({
      id: p.id,
      notes: p.situation,
      messages: [
        { role: "system", content: system },
        { role: "user", content: lines.join("\n") },
      ],
    });
    meta[p.id] = {
      fixtureIndex: p.index,
      situation: p.situation,
      title: job.title,
      lang: job.lang,
      sector: job.sector,
      source: job.source,
      employerName: job.employerName,
      brands: p.brands,
      workLanguages: job.workLanguages,
      sentences: job.sentences,
      candidates: candidates.map((u, k) => ({
        k: `K${k + 1}`, uri: u, labelEn: byUri.get(u)!.labelEn, labelFi: byUri.get(u)!.labelFi,
        distractor: distractors.includes(u),
      })),
    };
  }

  writeFileSync(
    out,
    JSON.stringify({ item: "need-card-draft", role: "analyst", schema: "NeedCardDraftOutput", temperature: 0.2, maxTokens: 4000, cases }, null, 2),
  );
  writeFileSync(path.join(DIR, "cases-meta.json"), JSON.stringify(meta, null, 2));
  console.log(`wrote ${cases.length} cases to ${out}`);
}

main();
