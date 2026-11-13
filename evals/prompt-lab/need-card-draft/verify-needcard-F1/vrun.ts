/**
 * Verify runner for needcard-F1. Same production path as run.ts (chatJson, JSON mode, one
 * repair retry) but records the raw parsed output of EVERY attempt via a pass-through
 * `coerce`, so we can see exactly what failed validation. No extra diagnostic call.
 *
 *   npx tsx evals/prompt-lab/need-card-draft/verify-needcard-F1/vrun.ts <cases.json> <outDir> <repeat> <id,id,...> <maxHttpAttempts>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { NeedCardDraftOutput } from "@/contracts";
import { chatJson, type ChatMessage } from "@/lib/llm";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const [file, outDir, rep, idsArg, maxArg] = process.argv.slice(2);
  const spec = JSON.parse(readFileSync(file!, "utf8")) as {
    role: "analyst"; temperature: number; maxTokens: number; cases: { id: string; messages: ChatMessage[] }[];
  };
  const ids = idsArg!.split(",");
  const repeat = Number(rep);
  const maxAttempts = Number(maxArg);
  mkdirSync(outDir!, { recursive: true });
  let spent = 0;
  const limit = pLimit(2);
  const jobs: Promise<unknown>[] = [];
  for (let run = 1; run <= repeat; run++) {
    for (const id of ids) {
      const c = spec.cases.find((x) => x.id === id)!;
      jobs.push(
        limit(async () => {
          if (spent >= maxAttempts) return { id, run, skipped: true };
          const raws: unknown[] = [];
          const t0 = Date.now();
          let r;
          try {
            r = await chatJson({
              role: spec.role, purpose: "lab.verify-needcard-F1", messages: c.messages,
              maxTokens: spec.maxTokens, temperature: spec.temperature,
              schema: NeedCardDraftOutput,
              coerce: (raw) => { raws.push(JSON.parse(JSON.stringify(raw))); return raw; },
            });
          } catch (e) {
            r = { data: null, error: String(e), meta: null };
          }
          spent += r.meta?.attempts ?? 1;
          const res = {
            caseId: id, run, ok: r.data !== null, error: "error" in r ? r.error : null,
            attempts: r.meta?.attempts ?? null, latencyMs: Date.now() - t0,
            tokensOut: r.meta?.tokensOut ?? null, raws,
          };
          writeFileSync(path.join(outDir!, `${id}.${run}.json`), JSON.stringify(res, null, 2));
          console.log(`${id}.${run} ok=${res.ok} attempts=${res.attempts} rawAttempts=${raws.length} ${(res.error ?? "").slice(0, 120)}`);
          return res;
        }),
      );
    }
  }
  await Promise.all(jobs);
  console.log(`http attempts spent: ${spent}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
