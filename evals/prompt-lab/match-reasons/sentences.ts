/** Writes the product's sentence split of the fixture postings used here to sentences.json (fi, plus sv where given). */
import { readFileSync, writeFileSync } from "node:fs";
import { normaliseTmtPosting, postingSentences } from "@/features/jobs/tmt";
import { redactContacts } from "@/lib/redact";
const raw = JSON.parse(readFileSync("fixtures/jobs/tmt-sample.json", "utf8")) as any[];
const out: Record<string, { title: string; sentences: string[] }> = {};
raw.forEach((d, i) => {
  const n = normaliseTmtPosting(d);
  if (n) out[String(i)] = { title: n.job.title, sentences: n.job.sentences ?? [] };
  const sv = d.position?.jobDescription?.sv;
  if (sv) out[`${i}sv`] = { title: d.position.title.sv, sentences: postingSentences(redactContacts(sv)) };
});
writeFileSync("evals/prompt-lab/match-reasons/sentences.json", JSON.stringify(out, null, 1));
