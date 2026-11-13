/**
 * First-attempt probe: sends each case exactly as production's first chatJson attempt does
 * (same gateway, role, JSON mode, temperature), but with a permissive schema so the raw first
 * output is kept, then validates it against MatchReasonsOutput here. Also logs the HTTP status
 * and timing of every request the gateway makes (no headers, no key), so transport retries
 * become visible.
 *
 *   npx tsx evals/prompt-lab/match-reasons/probe.ts <cases.json> --out <dir> [--repeat N] [--only id,id]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { z } from "zod";
import { MatchReasonsOutput } from "@/contracts";
import { chatJson, type ChatMessage } from "@/lib/llm";

type Http = { status: number | string; ms: number };
const httpLog: Http[][] = [];
let current: Http[] | null = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  const log = current;
  const t0 = Date.now();
  try {
    const res = await realFetch(...args);
    log?.push({ status: res.status, ms: Date.now() - t0 });
    return res;
  } catch (e) {
    log?.push({ status: e instanceof Error ? e.name : "error", ms: Date.now() - t0 });
    throw e;
  }
}) as typeof fetch;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const spec = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as {
    item: string; role: "analyst"; temperature?: number; maxTokens?: number;
    cases: { id: string; messages: ChatMessage[] }[];
  };
  const outDir = arg("--out")!;
  const repeat = Number(arg("--repeat") ?? "1");
  const only = arg("--only")?.split(",");
  mkdirSync(outDir, { recursive: true });
  // One request at a time so the fetch log is attributed to the right case.
  const limit = pLimit(1);
  const jobs: Promise<void>[] = [];
  for (const c of spec.cases.filter((x) => !only || only.includes(x.id))) {
    for (let run = 1; run <= repeat; run++) {
      jobs.push(limit(async () => {
        current = [];
        httpLog.push(current);
        let raw: unknown = null;
        let error: string | null = null;
        let meta: unknown = null;
        // Permissive schema: chatJson accepts the first parseable output, so no repair retry is sent.
        const r = await chatJson({
          role: spec.role, purpose: `lab.${spec.item}.probe`, messages: c.messages,
          maxTokens: spec.maxTokens, temperature: spec.temperature, schema: z.unknown(),
        });
        meta = r.meta;
        if (r.data !== null) raw = r.data; else error = r.error;
        const v = MatchReasonsOutput.safeParse(raw);
        const rec = {
          item: spec.item, caseId: c.id, run, raw: JSON.stringify(raw), rawParsed: raw,
          firstAttemptValid: v.success,
          validationError: v.success ? null : v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 300),
          error, http: current, meta,
        };
        writeFileSync(path.join(outDir, `${c.id}.${run}.json`), JSON.stringify(rec, null, 2));
        console.log(`${c.id}.${run} valid=${v.success} http=${current.map((h) => `${h.status}@${h.ms}ms`).join(",")}${v.success ? "" : " :: " + rec.validationError}`);
      }));
    }
  }
  await Promise.all(jobs);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
