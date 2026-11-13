/**
 * Prompt lab runner: sends prepared prompts to the real model through the gateway and
 * records what comes back, so prompt wording and model settings can be judged on evidence.
 *
 *   npm run lab -- <case-file.json> [--out <dir>] [--repeat N] [--only <caseId>]
 *
 * A case file:
 *   {
 *     "item": "turn-extractor",
 *     "role": "live",                       // live | analyst | bulk
 *     "schema": "ExtractorOutput",          // a Zod schema exported from src/contracts, or null for free text
 *     "maxTokens": 500, "temperature": 0.1, // optional
 *     "cases": [ { "id": "en-01", "messages": [ { "role": "system", "content": "..." }, ... ], "notes": "..." } ]
 *   }
 *
 * JSON cases go through `chatJson`, exactly as production code does (JSON mode, lenient parse,
 * one validation retry). Free-text cases go through `chatStream`, which is how the interviewer
 * speaks, and record the time to the first word.
 *
 * It reads `.env.local` for the provider settings and never prints a key. It makes at most two
 * requests at a time.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import type { z } from "zod";
import * as contracts from "@/contracts";
import { chatJson, chatStream, chatText, type ChatMessage, type LlmMeta } from "@/lib/llm";
import type { LlmRole } from "@/contracts";

type Case = { id: string; messages: ChatMessage[]; notes?: string };
type CaseFile = {
  item: string;
  role: LlmRole;
  schema: string | null;
  maxTokens?: number;
  temperature?: number;
  cases: Case[];
};
type Result = {
  item: string;
  caseId: string;
  run: number;
  role: LlmRole;
  kind: "json" | "text";
  ok: boolean;
  data?: unknown;
  text?: string;
  error?: string;
  rawOnFailure?: string;
  meta: LlmMeta | null;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? null;
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("usage: npm run lab -- <case-file.json> [--out <dir>] [--repeat N] [--only <caseId>]");
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(file, "utf8")) as CaseFile;
  const outDir = arg("--out") ?? path.join(path.dirname(file), "results");
  const repeat = Number(arg("--repeat") ?? "1");
  const only = arg("--only");
  mkdirSync(outDir, { recursive: true });

  let schema: z.ZodType | null = null;
  if (spec.schema) {
    const candidate = (contracts as Record<string, unknown>)[spec.schema];
    if (!candidate || typeof (candidate as { safeParse?: unknown }).safeParse !== "function") {
      console.error(`"${spec.schema}" is not a Zod schema exported from src/contracts`);
      process.exit(2);
    }
    schema = candidate as z.ZodType;
  }

  const limit = pLimit(2);
  const cases = spec.cases.filter((c) => !only || c.id === only);
  const jobs: Promise<Result>[] = [];

  for (const c of cases) {
    for (let run = 1; run <= repeat; run++) {
      jobs.push(
        limit(async (): Promise<Result> => {
          const base = {
            role: spec.role,
            purpose: `lab.${spec.item}`,
            messages: c.messages,
            maxTokens: spec.maxTokens,
            temperature: spec.temperature,
          };
          let result: Result;
          try {
            if (schema) {
              const r = await chatJson({ ...base, schema });
              if (r.data !== null) {
                result = { item: spec.item, caseId: c.id, run, role: spec.role, kind: "json", ok: true, data: r.data, meta: r.meta };
              } else {
                // One extra plain call so the failure can be diagnosed from the raw output.
                let raw: string | undefined;
                try {
                  raw = (await chatText(base)).text;
                } catch {
                  raw = undefined;
                }
                result = { item: spec.item, caseId: c.id, run, role: spec.role, kind: "json", ok: false, error: r.error, rawOnFailure: raw, meta: r.meta };
              }
            } else {
              const stream = chatStream(base);
              let text = "";
              for await (const delta of stream) text += delta;
              result = { item: spec.item, caseId: c.id, run, role: spec.role, kind: "text", ok: true, text, meta: await stream.meta };
            }
          } catch (error) {
            result = {
              item: spec.item, caseId: c.id, run, role: spec.role, kind: schema ? "json" : "text", ok: false,
              error: error instanceof Error ? error.message : String(error), meta: null,
            };
          }
          writeFileSync(path.join(outDir, `${c.id}.${run}.json`), JSON.stringify(result, null, 2));
          return result;
        }),
      );
    }
  }

  const results = await Promise.all(jobs);
  const okCount = results.filter((r) => r.ok).length;
  const latencies = results.flatMap((r) => (r.meta ? [r.meta.latencyMs] : []));
  const firstTokens = results.flatMap((r) => (r.meta?.firstTokenMs != null ? [r.meta.firstTokenMs] : []));
  const retried = results.filter((r) => (r.meta?.attempts ?? 1) > 1).length;

  const summary = {
    item: spec.item,
    role: spec.role,
    schema: spec.schema,
    calls: results.length,
    ok: okCount,
    failed: results.length - okCount,
    neededRetry: retried,
    latencyMs: { p50: percentile(latencies, 50), p90: percentile(latencies, 90) },
    firstTokenMs: { p50: percentile(firstTokens, 50), p90: percentile(firstTokens, 90) },
    models: [...new Set(results.flatMap((r) => (r.meta ? [`${r.meta.provider}:${r.meta.model}`] : [])))],
    failures: results.filter((r) => !r.ok).map((r) => ({ caseId: r.caseId, run: r.run, error: (r.error ?? "").slice(0, 300) })),
  };
  writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`results written to ${outDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
