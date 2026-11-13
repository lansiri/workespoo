/**
 * Writes `.dev/world.json`: who and what is in the database this checkout points at, for local
 * work on the pages (which person to open `/card` as, which company link to open).
 *
 *   npx tsx scripts/dev-world.ts            # reads DATABASE_URL from .env.local
 *
 * Local use only. The file is git-ignored; it holds link tokens and the local passcode.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { getEnv } from "../src/lib/env";

type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] => (Array.isArray(result) ? (result as Row[]) : ((result as { rows: Row[] }).rows ?? []));

async function main() {
  const db = getDb();
  const people = rows(
    await db.execute(sql`
      SELECT t.id, t.handle, t.synthetic, t.in_pool AS "inPool", t.persona_key AS "personaKey",
             EXISTS (SELECT 1 FROM signal s WHERE s.talent_id = t.id AND s.status = 'approved') AS "hasApprovedCard",
             (SELECT count(*)::int FROM job_match m WHERE m.talent_id = t.id) AS "feedPostings",
             (SELECT count(*)::int FROM intro i WHERE i.talent_id = t.id) AS "introductions"
      FROM talent t ORDER BY t.handle`),
  );
  const companies = rows(
    await db.execute(sql`
      SELECT c.id, c.display_name AS "displayName", c.masked, c.participating, c.digest_token AS "linkToken",
             coalesce((SELECT json_agg(json_build_object('id', n.id, 'title', n.body->>'title', 'status', n.status) ORDER BY n.id)
                       FROM need_card n WHERE n.company_id = c.id), '[]'::json) AS "needCards",
             (SELECT count(*)::int FROM digest d WHERE d.company_id = c.id AND d.status = 'published') AS "publishedDigests",
             (SELECT count(*)::int FROM digest d WHERE d.company_id = c.id AND d.status <> 'published') AS "draftDigests"
      FROM company c ORDER BY c.display_name`),
  );
  const interviews = rows(
    await db.execute(sql`SELECT id, talent_id AS "talentId", mode, status FROM interview ORDER BY started_at DESC LIMIT 30`),
  );
  const env = getEnv();
  const world = {
    generatedAt: new Date().toISOString(),
    appUrl: env.APP_URL ?? null,
    organiserPasscode: env.ORGANISER_PASSCODE ?? null,
    howTo: {
      person: "npx tsx scripts/dev-cookie.ts --talent <people[].id>",
      organiser: "npx tsx scripts/dev-cookie.ts --organiser, or sign in at /organiser with organiserPasscode",
      company: "/c/<companies[].linkToken> and /c/<linkToken>/need/<needCards[].id>",
    },
    people,
    companies,
    interviews,
  };
  const dir = path.join(process.cwd(), ".dev");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "world.json"), JSON.stringify(world, null, 2));
  console.log(`.dev/world.json: ${people.length} people, ${companies.length} companies, ${interviews.length} interviews`);
  await closeDb();
}

main().catch((err) => {
  console.error("dev-world failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
