/**
 * Verifies finding needcard-F3 (latency vs the 30 s analyst timeout).
 *
 *   npx tsx evals/prompt-lab/need-card-draft/verify-needcard-F3/probe.ts <cases.json> <outDir> \
 *     [--repeat N] [--timeout MS] [--conc N] [--budget N] [--only id1,id2]
 *
 * Goes through the production gateway (`chatJson`, JSON mode, analyst role, retries for 429) with
 * the given per-attempt timeout, but with a pass-through schema so the one repair retry does not
 * hide single-attempt timing. Output is validated against NeedCardDraftOutput afterwards.
 * The real OpenAI client is wrapped via setClientFactory to time every HTTP attempt and record
 * its status (200 / 429 / aborted). Never prints a key.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { z } from "zod";
import { NeedCardDraftOutput } from "@/contracts";
import { chatJson } from "@/lib/llm";
import { createRawClient, setClientFactory, type ChatClient } from "@/lib/llm/client";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

type Attempt = { tag: string; startMs: number; ms: number; status: string; tokensOut: number | null };
const attempts: Attempt[] = [];
let billed = 0;
const caseOf = new WeakMap<object, string>();

async function main() {
  process.loadEnvFile(".env.local");
  const spec = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
  const outDir = process.argv[3]!;
  const repeat = Number(arg("--repeat") ?? "1");
  const timeoutMs = Number(arg("--timeout") ?? "30000");
  const conc = Number(arg("--conc") ?? "2");
  const budget = Number(arg("--budget") ?? "45");
  const only = arg("--only")?.split(",");
  mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();

  setClientFactory((p) => {
    const real = createRawClient(p);
    const wrapped: ChatClient = {
      chat: {
        completions: {
          async create(body, options) {
            const start = Date.now();
            const label = caseOf.get((body as { messages: object }).messages) ?? "?";
            try {
              const r = (await real.chat.completions.create(body, options)) as { usage?: { completion_tokens?: number } };
              billed++;
              attempts.push({ tag: label, startMs: start - t0, ms: Date.now() - start, status: "200", tokensOut: r.usage?.completion_tokens ?? null });
              return r as never;
            } catch (e) {
              const st = (e as { status?: number }).status;
              if (st !== 429) billed++;
              attempts.push({ tag: label, startMs: start - t0, ms: Date.now() - start, status: st ? String(st) : options?.signal?.aborted ? "aborted" : "error", tokensOut: null });
              throw e;
            }
          },
        },
      },
    };
    return wrapped;
  });

  const cases = (spec.cases as Array<{ id: string; messages: never }>).filter((c) => !only || only.includes(c.id));
  // Interleave: run 1 of every case, then run 2, ...
  const jobs: Array<{ c: (typeof cases)[number]; run: number }> = [];
  for (let run = 1; run <= repeat; run++) for (const c of cases) jobs.push({ c, run });

  const limit = pLimit(conc);
  const rows: unknown[] = [];
  await Promise.all(
    jobs.map(({ c, run }) =>
      limit(async () => {
        if (billed >= budget) return;
        const label = `${c.id}.${run}`;
        caseOf.set(c.messages as unknown as object, c.id);
        const startedAt = Date.now() - t0;
        const r = await chatJson({
          role: spec.role,
          purpose: "lab.needcard.draft.verifyF3",
          messages: c.messages,
          maxTokens: spec.maxTokens,
          temperature: spec.temperature,
          timeoutMs,
          schema: process.argv.includes("--real-schema") ? NeedCardDraftOutput : z.unknown(),
        });
        const endedAt = Date.now() - t0;
        let schemaOk = false;
        let schemaErr: string | null = null;
        let reqCount: number | null = null;
        if (!("error" in r)) {
          const s = NeedCardDraftOutput.safeParse(r.data);
          schemaOk = s.success;
          if (!s.success) schemaErr = s.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ");
          reqCount = Array.isArray((r.data as { requirements?: unknown[] })?.requirements) ? (r.data as { requirements: unknown[] }).requirements.length : null;
        }
        const row = {
          caseId: c.id, run, label, startedAt, endedAt,
          ok: !("error" in r), error: "error" in r ? r.error : null,
          timedOut: "error" in r && /timed out/.test(r.error),
          schemaOk, schemaErr, requirements: reqCount,
          meta: r.meta,
        };
        rows.push(row);
        writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify({ ...row, data: "error" in r ? null : r.data }, null, 2));
        console.log(`${label} ok=${row.ok} timedOut=${row.timedOut} schemaOk=${schemaOk} latency=${r.meta.latencyMs} attempts=${r.meta.attempts} out=${r.meta.tokensOut} ${row.error ?? ""}`.slice(0, 220));
      }),
    ),
  );
  writeFileSync(path.join(outDir, "_attempts.json"), JSON.stringify(attempts, null, 2));
  writeFileSync(path.join(outDir, "_rows.json"), JSON.stringify(rows, null, 2));
  console.log(`billed (non-429) attempts: ${billed}; all attempts: ${attempts.length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
