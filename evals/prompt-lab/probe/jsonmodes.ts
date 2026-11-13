// One small request per contract schema and JSON mode, through chatJson. usage: npx tsx evals/prompt-lab/probe/jsonmodes.ts
import { writeFileSync } from "node:fs";
import { z } from "zod";
import * as contracts from "@/contracts";
import { chatJson } from "@/lib/llm";
import { jsonWasRejected, resetJsonRejections } from "@/lib/llm/core";
import { getRoleEntries } from "@/lib/llm/config";

process.loadEnvFile(".env.local");
const SHAPES: Record<string, string> = {
  ExtractorOutput: `Turn T1 of an interview. Sentence labels: T1.S1 "I fixed bikes at a small shop for two summers." T1.S2 "Mostly flat tyres and brakes, and I helped customers choose a bike." Known signals: none.
Return JSON: {"lang":"en","signals":[{"ref":"new","phrase":"bicycle repair","kind":"skill|tool|knowledge|domain","evidence":["T1.S1"],"hasExample":true}],"coverage":{"<area>":"covered|thin"},"flags":[],"note":"<one line>"} where area is one of recent_work, example, tools, people, beyond, open_floor, looking_for, and flags only from short, buzzwords, off_topic, question_to_ai, protected_info, distress, wants_stop, injection (empty list if none).`,
  SynthOutput: `Live signals: s1 "bicycle repair" (T1.S1, T1.S2), s2 "helping customers choose" (T1.S2). Write the end-of-interview card.
Return JSON: {"headline":"...","summary":"...","signals":[{"phrase":"...","kind":"skill|tool|knowledge|domain","evidence":["T1.S1"],"from":["s1"],"rendering":"..."}],"roles":["..."],"rolesEvidence":["T1.S1"]}`,
  NeedCardDraftOutput: `Posting sentences: 0 "Bike mechanic needed for our Espoo shop." 1 "Finnish required for customer service." 2 "At least 2 years of experience repairing bikes." ESCO candidates: K1 bicycle repair, K2 customer service.
Return JSON: {"title":"...","summary":"...","requirements":[{"text":"...","kind":"must|nice","category":"skill|language|education|experience|authorisation|other","sentence":0,"esco":["K1"],"language":null,"years":null,"statutory":"law|none","questionType":"none|language|years|degree|tool|vague","question":null,"why":null}],"notMentioned":[],"computedAt":"2026-11-13T12:00:00Z"}`,
  MatchReasonsOutput: `Person signals: S1 "bicycle repair" (two summers in a bike shop), S2 "helping customers choose". Posting sentences: P1 "Bike mechanic needed", P2 "Good customer service". Give one to three reasons this posting fits.
Return JSON: {"reasons":[{"signal":"S1","sentence":"P1","text":"short reason"}]} (sentence may be null).`,
  PicksDraftOutput: `Need requirements: R1 "repairs bikes", R2 "serves customers". Person signals: S1 "bicycle repair, two summers", S2 "helping customers choose a bike". Give one to three reasons the person speaks to the need.
Return JSON: {"reasons":[{"req":"R1","signal":"S1","text":"short reason"}]}`,
};
async function main() {
  const rows: unknown[] = [];
  const entry = getRoleEntries("analyst")[0]!;
  for (const name of Object.keys(SHAPES)) {
    const schema = (contracts as Record<string, unknown>)[name] as z.ZodType;
    let conv = "ok";
    try { const js = z.toJSONSchema(schema); conv = `ok (${JSON.stringify(js).length} chars)`; } catch (e) { conv = "FAILS: " + String(e).slice(0, 120); }
    for (const mode of ["json_object", "json_schema"]) {
      if (process.env.ONLY && !process.env.ONLY.split(",").includes(`${name}:${mode}`)) continue;
      process.env.LLM_JSON_MODE = mode; resetJsonRejections();
      let row: Record<string, unknown>;
      try {
        const r = await chatJson({ role: "analyst", purpose: "probe.jsonmodes", maxTokens: 700, temperature: 0.1, schema,
          messages: [{ role: "system", content: "You return only JSON that matches the described shape." }, { role: "user", content: SHAPES[name]! }] });
        row = { schema: name, mode, convert: conv, valid: r.data !== null, error: r.error ?? null, latencyMs: r.meta.latencyMs, attempts: r.meta.attempts, providerRejectedFormat: jsonWasRejected(entry) };
      } catch (e) { row = { schema: name, mode, convert: conv, valid: false, error: String((e as Error).message).slice(0, 200) }; }
      console.log(JSON.stringify(row)); rows.push(row);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  writeFileSync("evals/prompt-lab/probe/jsonmodes-results.json", JSON.stringify(rows, null, 1));
}
main();
