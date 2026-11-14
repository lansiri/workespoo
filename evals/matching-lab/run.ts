/**
 * Matching lab: runs the feed retrieval for each profile in `profiles.json` against a local
 * copy of the public job tables and prints the first postings with the links that brought
 * each one in. Read-only: it only issues SELECTs. No model call, no people data.
 *
 *   npx tsx evals/matching-lab/run.ts [profileId ...]
 *
 * `escoTopMatch` labels only near-exact matches, as in the app. In production a model (prompt C)
 * picks looser labels from candidates; LAB_MODEL_LABELS=1 stands in for it by using the
 * `modelLabel` a fixture names (an exact ESCO English label) where `escoTopMatch` found none.
 *
 * Environment: LAB_MODEL_LABELS (1 to use `modelLabel`), LAB_DATABASE_URL (default: the local lab database), LAB_NOW (ISO time, default
 * now), LAB_SHOW (postings printed per profile, default 12).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import type { Db } from "@/db/client";
import type { SignalKind } from "@/contracts";
import { escoTopMatch } from "@/lib/esco";
import { rowsOf } from "@/lib/sql";
import { retrieveForSignals } from "@/features/matching/retrieval";

type Profile = {
  id: string;
  note?: string;
  roles: string[];
  signals: Array<{ phrase: string; kind: SignalKind; modelLabel?: string }>;
};

const URL = process.env.LAB_DATABASE_URL ?? "postgres://postgres:lab@127.0.0.1:55433/workespoo";
const SHOW = Number(process.env.LAB_SHOW ?? 12);
const NOW = process.env.LAB_NOW ? new Date(process.env.LAB_NOW) : new Date();

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const profiles = JSON.parse(readFileSync(join(here, "profiles.json"), "utf8")) as Profile[];
  const wanted = process.argv.slice(2);
  const client = postgres(URL, { max: 2, onnotice: () => {}, connection: { default_transaction_read_only: true } });
  const db = drizzle(client) as unknown as Db;
  try {
    for (const p of profiles.filter((x) => wanted.length === 0 || wanted.includes(x.id))) {
      const signals: Array<{ phrase: string; kind: SignalKind; escoUri: string | null; esco: { labelEn: string } | null }> = [];
      for (const s of p.signals) {
        let esco: { uri: string; labelEn: string } | null = await escoTopMatch(db, s.phrase);
        if (!esco && process.env.LAB_MODEL_LABELS === "1" && s.modelLabel) {
          const [row] = rowsOf<{ uri: string; label_en: string }>(
            await db.execute(sql`SELECT uri, label_en FROM esco_concept WHERE label_en = ${s.modelLabel} LIMIT 1`),
          );
          if (row) esco = { uri: row.uri, labelEn: row.label_en };
        }
        signals.push({ phrase: s.phrase, kind: s.kind, escoUri: esco?.uri ?? null, esco });
      }
      console.log(`\n=== ${p.id}${p.note ? ` (${p.note})` : ""}`);
      for (const s of signals) console.log(`  signal [${s.kind}] ${s.phrase} -> ${s.esco ? s.esco.labelEn : "(no ESCO label)"}`);
      const found = await retrieveForSignals(db, signals, p.roles, NOW);
      console.log(`  ${found.length} postings in the feed; first ${Math.min(SHOW, found.length)}:`);
      const ids = found.slice(0, SHOW).map((c) => c.jobId);
      const rows = ids.length
        ? rowsOf<{ id: string; title: string; employer_name: string; municipality: string | null }>(
            await db.execute(sql`SELECT id, title, employer_name, municipality FROM job WHERE id = ANY(${sql.raw(`ARRAY[${ids.map((i) => `'${i.replace(/'/g, "''")}'`).join(",")}]::text[]`)})`),
          )
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const [i, c] of found.slice(0, SHOW).entries()) {
        const r = byId.get(c.jobId);
        console.log(`  ${String(i + 1).padStart(2)}. ${r?.title ?? c.jobId} | ${r?.employer_name ?? ""} | ${r?.municipality ?? ""}`);
        console.log(`      links: ${c.links.map((l) => `${signals[l.signal].phrase} (${l.link})`).join("; ") || "(role in title)"}`);
      }
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("lab failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
