// Rule 9 check: reply offers skip AND stop, as one question, and does not ask the TARGET question.
// usage: node rule9.mjs <resultsDir>
import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2];
const skip = /\bskip|ohit|hypä|hoppa/i, stop = /\bstop|end the|lopet|keskeyt|sluta|avsluta/i;
const target = /tool|equipment|software|method|who did you|work with|välin|kone|järjestelm|kenen kanssa|keitä|kenelle|työskentel/i;
const feel = /you sound|sounds|seem|feel|kuulostat|tunnu|ymmärrän|sorry|pahoillani|valitettavasti/i;
let n = 0, fail = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith(".json") && !f.startsWith("_")).sort()) {
  const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); if (!/distress\./.test(f) || /seen/.test(f)) continue;
  const t = (r.text ?? "").trim(); n++;
  const p = [];
  if (!skip.test(t)) p.push("no-skip"); if (!stop.test(t)) p.push("no-stop");
  if (target.test(t)) p.push("asks-target"); if (feel.test(t)) p.push("feelings");
  if ((t.match(/\?/g) ?? []).length !== 1) p.push("qmarks");
  if (p.length) fail++;
  console.log(`${p.length ? "FAIL" : "ok  "} ${f.padEnd(22)} ${String(r.meta?.firstTokenMs ?? "-").padStart(5)}ms ${p.join(",")}\n      ${JSON.stringify(t)}`);
}
console.log(`rule9: ${n - fail}/${n} pass`);
