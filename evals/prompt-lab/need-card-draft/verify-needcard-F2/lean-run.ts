/** Lean copy of evals/prompt-lab/run.ts for JSON cases: same chatJson call, but no extra
 *  diagnostic chatText call on failure (saves budget). Raw output of the final attempt is not available. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import type { z } from "zod";
import * as contracts from "@/contracts";
import { chatJson } from "@/lib/llm";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const file = process.argv[2];
  const outDir = process.argv[3];
  const repeat = Number(process.argv[4] ?? "1");
  const spec = JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(outDir, { recursive: true });
  const schema = (contracts as Record<string, unknown>)[spec.schema] as z.ZodType;
  const limit = pLimit(2);
  const jobs = [];
  for (const c of spec.cases) for (let run = 1; run <= repeat; run++) jobs.push(limit(async () => {
    const base = { role: spec.role, purpose: `lab.${spec.item}`, messages: c.messages, maxTokens: spec.maxTokens, temperature: spec.temperature };
    let result: Record<string, unknown>;
    try {
      const r = await chatJson({ ...base, schema });
      result = "error" in r ? { caseId: c.id, run, ok: false, error: r.error, meta: r.meta } : { caseId: c.id, run, ok: true, data: r.data, meta: r.meta };
    } catch (e) { result = { caseId: c.id, run, ok: false, error: String(e), meta: null }; }
    writeFileSync(path.join(outDir, `${c.id}.${run}.json`), JSON.stringify(result, null, 2));
    const m = result.meta as { tokensOut?: number; latencyMs?: number; attempts?: number } | null;
    console.log(c.id, run, result.ok ? "OK" : "FAIL", m?.tokensOut, m?.latencyMs, m?.attempts, result.ok ? "" : String(result.error).slice(0, 100));
  }));
  await Promise.all(jobs);
}
main();
