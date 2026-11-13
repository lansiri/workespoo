/**
 * Verify match-reasons-F2: runs cases through production chatJson (MatchReasonsOutput, analyst role)
 * at a chosen concurrency, logging every HTTP request's status, timing and rate-limit headers
 * (retry-after, x-ratelimit-*; never auth headers), plus each call's completion offset from burst start.
 *
 *   npx tsx <this> <cases.json> --out <dir> --repeat N --conc C [--only id,id]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import pLimit from "p-limit";
import { MatchReasonsOutput } from "@/contracts";
import { chatJson, type ChatMessage } from "@/lib/llm";

type Http = { status: number | string; startMs: number; ms: number; headers: Record<string, string> };
const als = new AsyncLocalStorage<Http[]>();
const T0 = Date.now();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  const log = als.getStore();
  const t = Date.now();
  try {
    const res = await realFetch(...args);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (k === "retry-after" || k.includes("ratelimit") || k.includes("rate-limit")) headers[k] = v;
    });
    log?.push({ status: res.status, startMs: t - T0, ms: Date.now() - t, headers });
    return res;
  } catch (e) {
    log?.push({ status: e instanceof Error ? e.name : "error", startMs: t - T0, ms: Date.now() - t, headers: {} });
    throw e;
  }
}) as typeof fetch;

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const spec = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as {
    item: string; role: "analyst"; temperature?: number; maxTokens?: number; cases: { id: string; messages: ChatMessage[] }[];
  };
  const outDir = arg("--out")!;
  const repeat = Number(arg("--repeat") ?? "1");
  const conc = Number(arg("--conc") ?? "2");
  if (conc > 2) throw new Error("lab rule: at most 2 in flight");
  const only = arg("--only")?.split(",");
  mkdirSync(outDir, { recursive: true });
  const limit = pLimit(conc);
  const cases = spec.cases.filter((x) => !only || only.includes(x.id));
  const jobs: Promise<unknown>[] = [];
  // Interleave by run so each case's 5 runs are spread across the burst.
  for (let run = 1; run <= repeat; run++) for (const c of cases) {
    jobs.push(limit(() => als.run([], async () => {
      const http = als.getStore()!;
      const startedMs = Date.now() - T0;
      const r = await chatJson({ role: spec.role, purpose: `lab.${spec.item}.verifyF2`, messages: c.messages,
        maxTokens: spec.maxTokens, temperature: spec.temperature, schema: MatchReasonsOutput });
      const rec = {
        caseId: c.id, run, conc, startedMs, doneMs: Date.now() - T0, ok: !("error" in r && r.error),
        error: "error" in r ? r.error : null, meta: r.meta, http,
        saw429: http.some((h) => h.status === 429), data: r.data,
      };
      writeFileSync(path.join(outDir, `${c.id}.${run}.json`), JSON.stringify(rec, null, 2));
      console.log(`${c.id}.${run} ok=${rec.ok} latency=${r.meta?.latencyMs} attempts=${r.meta?.attempts} done@${rec.doneMs} http=${http.map((h) => `${h.status}@${h.startMs}+${h.ms}${h.headers["retry-after"] ? `(ra=${h.headers["retry-after"]})` : ""}`).join(",")}`);
      return rec;
    })));
  }
  await Promise.all(jobs);
  console.log(`wall ${Date.now() - T0} ms`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
