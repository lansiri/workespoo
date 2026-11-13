// Fires N identical short streaming requests at once through the gateway's chatStream.
// usage: LLM_MAX_CONCURRENCY=32 npx tsx evals/prompt-lab/probe/concurrency.ts 4 8 16
import { writeFileSync } from "node:fs";
import { chatStream } from "@/lib/llm";

process.loadEnvFile(".env.local");
const sizes = process.argv.slice(2).map(Number);
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null; };
const out: unknown[] = [];

async function main() {
for (const n of sizes) {
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: n }, async (_, i) => {
    try {
      const st = chatStream({ role: "live", purpose: "probe.concurrency", maxTokens: 60, temperature: 0.4,
        messages: [{ role: "system", content: "You are a friendly interviewer. Reply in one short sentence and ask one question." }, { role: "user", content: `I fixed bikes for two summers. (${i})` }] });
      let text = ""; for await (const d of st) text += d;
      const m = await st.meta;
      return { ok: true, empty: text.length === 0, ttft: m.firstTokenMs, total: m.latencyMs, attempts: m.attempts, err: null as string | null };
    } catch (e) { return { ok: false, empty: true, ttft: null, total: null, attempts: 0, err: String((e as Error).message).slice(0, 200) }; }
  }));
  const tt = rs.flatMap((r) => (r.ttft != null ? [r.ttft] : []));
  const tot = rs.flatMap((r) => (r.total != null ? [r.total] : []));
  const row = { n, wallMs: Date.now() - t0, ok: rs.filter((r) => r.ok).length, errors: rs.filter((r) => !r.ok).map((r) => r.err), retried: rs.filter((r) => r.attempts > 1).length,
    ttftP50: pct(tt, 50), ttftP90: pct(tt, 90), ttftMax: tt.length ? Math.max(...tt) : null, totalP50: pct(tot, 50), totalP90: pct(tot, 90) };
  console.log(JSON.stringify(row)); out.push(row);
  await new Promise((r) => setTimeout(r, 65000));
}
writeFileSync("evals/prompt-lab/probe/concurrency-results.json", JSON.stringify(out, null, 1));
}
main();
