/** Prints fixture postings as the product sees them: title, sentences (0-based index), ESCO skills. */
import { readFileSync } from "node:fs";
import { normaliseTmtPosting } from "@/features/jobs/tmt";
const raw = JSON.parse(readFileSync("fixtures/jobs/tmt-sample.json", "utf8")) as unknown[];
const want = process.argv.slice(2).map(Number);
const esco = JSON.parse(readFileSync("fixtures/esco/subset.json", "utf8"));
const labels = new Map<string, string>();
const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { const o = v as Record<string, unknown>; if (typeof o.uri === "string") { const pl = (o.prefLabel ?? o.labels ?? o.label) as Record<string, string> | string | undefined; labels.set(o.uri, typeof pl === "string" ? pl : pl ? `${pl.en ?? ""} / ${pl.fi ?? ""}` : ""); } Object.values(o).forEach(walk); } };
walk(esco); walk(raw);
raw.forEach((d, i) => {
  if (want.length && !want.includes(i)) return;
  const n = normaliseTmtPosting(d);
  if (!n) { console.log(i, "null"); return; }
  console.log(`\n### [${i}] ${n.job.title}`);
  (n.job.sentences ?? []).forEach((s: string, k: number) => console.log(`  ${k}: ${s}`));
  console.log("  skills:", n.skillUris.map((u) => `${u.split("/").pop()?.slice(0, 8)}=${labels.get(u) ?? "?"}`).join(" | "));
});
