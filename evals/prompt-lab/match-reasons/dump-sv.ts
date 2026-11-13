/** Splits the Swedish description of a fixture posting the way the product splits postings. */
import { readFileSync } from "node:fs";
import { postingSentences } from "@/features/jobs/tmt";
import { redactContacts } from "@/lib/redact";
const raw = JSON.parse(readFileSync("fixtures/jobs/tmt-sample.json", "utf8")) as any[];
for (const i of process.argv.slice(2).map(Number)) {
  const sv = raw[i].position.jobDescription.sv;
  console.log(`### [${i}] ${raw[i].position.title.sv}`);
  postingSentences(redactContacts(sv ?? "")).forEach((s, k) => console.log(`  ${k}: ${s}`));
}
