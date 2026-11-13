// Prints normalised posting sentences: `dump.ts 3 14` or `dump.ts grep <regex>`.
import { FIXTURE_TMT_POSTINGS } from "../../../fixtures/load";
import { normaliseTmtPosting } from "@/features/jobs/tmt";
const rows = FIXTURE_TMT_POSTINGS();
const jobs = rows.map((d) => normaliseTmtPosting(d, { preferMunicipalities: ["049"] })?.job as any);
const args = process.argv.slice(2);
if (args[0] === "grep") {
  const re = new RegExp(args[1], "i");
  jobs.forEach((j, i) => j?.sentences.forEach((s: string, k: number) => re.test(s) && console.log(`${i} P${k}: ${s}`)));
} else {
  for (const a of args) {
    const j = jobs[Number(a)];
    console.log(`=== ${a} ${j.title} | ${j.lang} ${j.sector} wl=${j.workLanguages} skills=${j.escoSkillUris.length} occ=${j.escoOccupationUris.length}`);
    j.sentences.forEach((s: string, k: number) => console.log(`[P${k}] ${s}`));
  }
}
