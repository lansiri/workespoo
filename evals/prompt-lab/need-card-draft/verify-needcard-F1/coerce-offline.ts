// Offline (no model calls): would the proposed coerce have rescued the original-prompt first attempts?
import { readFileSync, readdirSync } from "node:fs";
import { NeedCardDraftOutput } from "@/contracts";
const dir = "evals/prompt-lab/need-card-draft/verify-needcard-F1/results-orig";
const coerce = (raw: any) => ({ ...raw, requirements: Array.isArray(raw?.requirements) ? raw.requirements.map((q: any) => ({ ...q,
  language: typeof q.language === "string" && /^[a-z]{2}$/.test(q.language) ? q.language : null,
  years: Number.isInteger(q.years) ? q.years : null })) : raw?.requirements });
let n = 0, plain = 0, coerced = 0;
for (const f of readdirSync(dir)) {
  const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  if (!r.raws.length) continue;
  n++; const first = r.raws[0];
  if (NeedCardDraftOutput.safeParse(first).success) plain++;
  const c = NeedCardDraftOutput.safeParse(coerce(first));
  if (c.success) coerced++; else console.log(f, c.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; "));
}
console.log({ firstAttempts: n, validAsIs: plain, validWithCoerce: coerced });
