/**
 * Simulates the proposed "fail fast" for the live role without changing source code:
 * each call gets an AbortSignal that fires if no first token has arrived by DEADLINE_MS
 * (default 2000). Aborting also cancels any 429 backoff sleep in core.ts, so the call ends
 * there and production would emit the scripted fallback question.
 *
 *   npx tsx evals/prompt-lab/interviewer-live/verify-interviewer-live-F3/failfast.ts <cases.json> <outDir> <repeat>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { chatStream, type ChatMessage } from "@/lib/llm";

async function main() {
  if (process.env.LLM_MODE !== "fake") process.loadEnvFile(".env.local");
  const [file, outDir, rep] = process.argv.slice(2);
  const deadline = Number(process.env.DEADLINE_MS ?? "2000");
  const spec = JSON.parse(readFileSync(file!, "utf8")) as {
    role: "live"; maxTokens?: number; temperature?: number; cases: { id: string; messages: ChatMessage[] }[];
  };
  mkdirSync(outDir!, { recursive: true });
  const limit = pLimit(2);
  const jobs = spec.cases.flatMap((c) =>
    Array.from({ length: Number(rep ?? "2") }, (_, i) =>
      limit(async () => {
        const ac = new AbortController();
        const t0 = Date.now();
        let first: number | null = null;
        const timer = setTimeout(() => { if (first === null) ac.abort(); }, deadline);
        let text = "";
        let error: string | undefined;
        let meta: unknown = null;
        try {
          const s = chatStream({ role: spec.role, purpose: "lab.interviewer-live.failfast", messages: c.messages,
            maxTokens: spec.maxTokens, temperature: spec.temperature, signal: ac.signal });
          for await (const d of s) { if (first === null) first = Date.now() - t0; text += d; }
          meta = await s.meta;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        } finally {
          clearTimeout(timer);
        }
        const r = { caseId: c.id, run: i + 1, deadlineMs: deadline, modelReply: first !== null && text.length > 0,
          firstTokenMs: first, endedMs: Date.now() - t0, aborted: ac.signal.aborted, text, error, meta };
        writeFileSync(path.join(outDir!, `${c.id}.${i + 1}.json`), JSON.stringify(r, null, 2));
        return r;
      }),
    ),
  );
  const rs = await Promise.all(jobs);
  const summary = {
    calls: rs.length,
    modelReply: rs.filter((r) => r.modelReply).length,
    fallback: rs.filter((r) => !r.modelReply).length,
    maxTimeToDecisionMs: Math.max(...rs.map((r) => (r.modelReply ? r.firstTokenMs! : r.endedMs))),
    rows: rs.map((r) => `${r.caseId}.${r.run} ${r.modelReply ? "reply" : "FALLBACK"} first=${r.firstTokenMs} ended=${r.endedMs} attempts=${(r.meta as { attempts?: number } | null)?.attempts ?? "-"}`),
  };
  writeFileSync(path.join(outDir!, "_summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
