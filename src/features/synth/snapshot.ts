/**
 * A model-free snapshot of the generated demo state (docs/specs/synthetic-world.md: "snapshotted
 * to seed/, and reloaded by Reset demo without calling a model").
 *
 * `snapshotDemo` writes the rows that interviews, card synthesis, Need Card drafting and
 * eligibility produced to `seed/snapshot/<table>.json`. `restoreDemoSnapshot` removes the demo
 * state, inserts those rows back with no feature or model call, and then rebuilds only what
 * depends on the clock: yesterday's published digests and today's drafted ones.
 *
 * The organiser's "Reset demo" control calls `restoreDemoSnapshot` (nothing else imports this
 * folder, so the lead wires that route).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray, like, or } from "drizzle-orm";
import { getTableColumns, getTableName, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import {
  appMeta, company, consent, eligibility, eventCompany, interview, interviewEvent, jobMatch, matchEvent,
  needCard, signal, signalCard, talent, talentIdentity, talentLanguage, turn,
} from "@/db/schema";
import { newToken } from "@/lib/ids";
import { DEMO_COMPANIES_KEY, DEMO_EVENT_ID, resetDemo, seedDemo, type SeedOptions, type SeedSummary } from "./seed";

export const SNAPSHOT_DIR = path.resolve(process.cwd(), "seed/snapshot");
const MANIFEST = "manifest.json";
const VERSION = 1;

type Ids = { talents: string[]; interviews: string[]; companies: string[]; needs: string[] };
type TableSpec = { table: PgTable; where: (ids: Ids) => SQL | undefined };

// Parents first: this is also the insertion order on restore.
const TABLES: TableSpec[] = [
  { table: matchEvent, where: () => eq(matchEvent.id, DEMO_EVENT_ID) },
  { table: company, where: () => like(company.id, "co_demo%") },
  { table: eventCompany, where: () => eq(eventCompany.eventId, DEMO_EVENT_ID) },
  { table: needCard, where: (i) => inArray(needCard.companyId, [...i.companies, ""]) },
  { table: talent, where: () => eq(talent.synthetic, true) },
  { table: talentIdentity, where: (i) => inArray(talentIdentity.talentId, [...i.talents, ""]) },
  { table: interview, where: (i) => inArray(interview.talentId, [...i.talents, ""]) },
  { table: turn, where: (i) => inArray(turn.interviewId, [...i.interviews, ""]) },
  { table: signal, where: (i) => inArray(signal.talentId, [...i.talents, ""]) },
  { table: talentLanguage, where: (i) => inArray(talentLanguage.talentId, [...i.talents, ""]) },
  { table: signalCard, where: (i) => inArray(signalCard.talentId, [...i.talents, ""]) },
  { table: interviewEvent, where: (i) => inArray(interviewEvent.interviewId, [...i.interviews, ""]) },
  { table: jobMatch, where: (i) => inArray(jobMatch.talentId, [...i.talents, ""]) },
  { table: eligibility, where: (i) => inArray(eligibility.needCardId, [...i.needs, ""]) },
  { table: consent, where: (i) => or(inArray(consent.subjectId, [...i.talents, ...i.companies, ""])) },
  { table: appMeta, where: () => eq(appMeta.key, DEMO_COMPANIES_KEY) },
];

const nameOf = (t: PgTable) => getTableName(t);

/**
 * Link tokens (a company's private link, an agenda link) open pages without a login, so the
 * files in the repository must not hold working ones. The snapshot stores this marker instead,
 * and a restore makes a fresh token for every marked field.
 */
export const TOKEN_PLACEHOLDER = "made-again-on-restore";
const isTokenColumn = (key: string) => key.endsWith("Token");

function withoutTokens(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(out)) if (isTokenColumn(key) && typeof out[key] === "string") out[key] = TOKEN_PLACEHOLDER;
  return out;
}

function withFreshTokens(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(out)) if (isTokenColumn(key) && typeof out[key] === "string") out[key] = newToken();
  return out;
}

async function collectIds(db: Db): Promise<Ids> {
  const talents = (await db.select({ id: talent.id }).from(talent).where(eq(talent.synthetic, true))).map((r) => r.id);
  const companies = (await db.select({ id: company.id }).from(company).where(like(company.id, "co_demo%"))).map((r) => r.id);
  const interviews = talents.length ? (await db.select({ id: interview.id }).from(interview).where(inArray(interview.talentId, talents))).map((r) => r.id) : [];
  const needs = companies.length ? (await db.select({ id: needCard.id }).from(needCard).where(inArray(needCard.companyId, companies))).map((r) => r.id) : [];
  return { talents, interviews, companies, needs };
}

/** Write the generated demo state to `dir`. Returns the row count per table. */
export async function snapshotDemo(db: Db, dir: string = SNAPSHOT_DIR): Promise<Record<string, number>> {
  const ids = await collectIds(db);
  if (ids.talents.length === 0 || ids.companies.length === 0) throw new Error("There is no demo state to snapshot. Run npm run seed first.");
  mkdirSync(dir, { recursive: true });
  const counts: Record<string, number> = {};
  for (const spec of TABLES) {
    const q = db.select().from(spec.table as never) as unknown as { where: (w: SQL | undefined) => Promise<unknown[]> };
    const rows = ((await q.where(spec.where(ids))) as Record<string, unknown>[]).map(withoutTokens);
    counts[nameOf(spec.table)] = rows.length;
    writeFileSync(path.join(dir, `${nameOf(spec.table)}.json`), `${JSON.stringify(rows, null, 1)}\n`);
  }
  writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify({ version: VERSION, tables: counts }, null, 2)}\n`);
  return counts;
}

export function hasSnapshot(dir: string = SNAPSHOT_DIR): boolean {
  return existsSync(path.join(dir, MANIFEST));
}

/** Dates come back from JSON as strings: turn them into Dates by column type. */
function revive(table: PgTable, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    const v = out[key];
    if (typeof v === "string" && (col as { dataType: string }).dataType === "date") out[key] = new Date(v);
  }
  return out;
}

/** Load the snapshot rows after removing the demo state. One transaction: it all happens or none of it. */
export async function loadSnapshotRows(db: Db, dir: string = SNAPSHOT_DIR): Promise<Record<string, number>> {
  if (!hasSnapshot(dir)) throw new Error(`No snapshot in ${dir}. Run npm run seed -- --snapshot after a seed.`);
  const manifest = JSON.parse(readFileSync(path.join(dir, MANIFEST), "utf8")) as { version: number };
  if (manifest.version !== VERSION) throw new Error(`Snapshot version ${manifest.version} is not supported (expected ${VERSION}). Re-run the snapshot.`);
  const counts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    await resetDemo(tx as unknown as Db);
    for (const spec of TABLES) {
      const rows = (JSON.parse(readFileSync(path.join(dir, `${nameOf(spec.table)}.json`), "utf8")) as Record<string, unknown>[]).map((r) => withFreshTokens(revive(spec.table, r)));
      counts[nameOf(spec.table)] = rows.length;
      for (let i = 0; i < rows.length; i += 200) await tx.insert(spec.table).values(rows.slice(i, i + 200) as never);
    }
  });
  return counts;
}

/**
 * Reset the demo to the snapshot with no model call: the generated rows come from the files,
 * and only the digests that depend on today's date are made again (yesterday published, today
 * drafted, the pitch company left undrafted). `deps` is used only for `draftDailyDigests`.
 */
export async function restoreDemoSnapshot(db: Db, options: Omit<SeedOptions, "reset" | "mode" | "companies"> & { dir?: string }): Promise<SeedSummary> {
  await loadSnapshotRows(db, options.dir);
  return seedDemo(db, { ...options, restored: true });
}
