/**
 * Diagnoses why a case needed a repair retry: sends the exact same request as chatJson
 * (json_object mode, same role, temperature) but with a permissive schema, so the FIRST
 * attempt's output is kept, then validates it against PicksDraftOutput here.
 *   npx tsx evals/prompt-lab/picks-draft/diag-first-attempt.ts <cases.json> <caseId> <n>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { PicksDraftOutput } from "@/contracts";
import { chatJson } from "@/lib/llm";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const [file, id, n] = process.argv.slice(2);
  const spec = JSON.parse(readFileSync(file!, "utf8"));
  const c = spec.cases.find((x: { id: string }) => x.id === id);
  const out = [];
  for (let i = 0; i < Number(n ?? "1"); i++) {
    const r = await chatJson({ role: spec.role, purpose: "lab.picks-draft.diag", messages: c.messages, temperature: spec.temperature, schema: z.unknown() });
    const v = PicksDraftOutput.safeParse(r.data);
    out.push({ data: r.data, valid: v.success, issues: v.success ? null : v.error.issues, latencyMs: r.meta.latencyMs });
    console.log(JSON.stringify(out.at(-1), null, 1));
  }
  writeFileSync(`evals/prompt-lab/picks-draft/results/diag-${id}.json`, JSON.stringify(out, null, 2));
}
main();
