/**
 * Prints the top ESCO candidates for the signals of a profile that `escoTopMatch` could not
 * label, so a fixture author can pick the label a model (prompt C) would plausibly choose.
 * Read-only. `npx tsx evals/matching-lab/candidates.ts <profileId>`
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "@/db/client";
import { escoCandidates, escoTopMatch } from "@/lib/esco";

async function main() {
  const profiles = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "profiles.json"), "utf8")) as Array<{
    id: string;
    signals: Array<{ phrase: string }>;
  }>;
  const client = postgres(process.env.LAB_DATABASE_URL ?? "postgres://postgres:lab@127.0.0.1:55433/workespoo", {
    max: 1,
    onnotice: () => {},
    connection: { default_transaction_read_only: true },
  });
  const db = drizzle(client) as unknown as Db;
  try {
    for (const p of profiles.filter((x) => process.argv.slice(2).includes(x.id))) {
      for (const s of p.signals) {
        if (await escoTopMatch(db, s.phrase)) continue;
        const c = await escoCandidates(db, s.phrase, { type: "skill", limit: 4 });
        console.log(`${p.id} | ${s.phrase}: ${c.map((x) => `${x.labelEn} (${x.similarity.toFixed(2)})`).join("; ")}`);
      }
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
