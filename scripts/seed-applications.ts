/**
 * `npx tsx --env-file=.env.local scripts/seed-applications.ts [--companies 1,3] [--snapshot]`
 *
 * Adds the simulated people's job applications to a demo world that already exists, through
 * the real application feature and the real model, and touches nothing else: no interview is
 * run again, no Need Card is drafted, no digest is made. Idempotent: an application that is
 * already assessed is kept, one that was left half-done is run again.
 *
 * `--companies` limits the run to those demo company numbers. `--snapshot` then writes
 * seed/snapshot, so that `npm run seed -- --reset` restores the applications with no model call.
 */
import { parseArgs } from "node:util";
import { eq, inArray } from "drizzle-orm";
import { appMeta, application, needCard } from "../src/db/schema";
import { runSimulatedApplications, type ApplyCompany } from "../src/features/synth/applications";
import { realSeedDeps } from "../src/features/synth/deps";
import { describeError } from "../src/features/synth/errors";
import { loadPersonas } from "../src/features/synth/persona";
import { openDb } from "../src/features/synth/script-db";
import { DEMO_COMPANIES_KEY } from "../src/features/synth/seed";
import { snapshotDemo } from "../src/features/synth/snapshot";

async function main() {
  const { values } = parseArgs({
    options: {
      companies: { type: "string" },
      snapshot: { type: "boolean", default: false },
    },
  });
  const only = values.companies
    ? new Set(
        values.companies
          .split(",")
          .map((n) => Number.parseInt(n, 10))
          .filter((n) => Number.isFinite(n)),
      )
    : null;

  const opened = await openDb(false);
  try {
    const { db } = opened;
    const [stored] = await db.select().from(appMeta).where(eq(appMeta.key, DEMO_COMPANIES_KEY));
    const chosen = (stored?.value as Array<{ number: number; companyId: string; jobId: string }> | undefined) ?? [];
    if (chosen.length === 0) throw new Error("There is no demo world in this database. Run npm run seed first.");

    const cards = await db
      .select({ id: needCard.id, companyId: needCard.companyId, jobId: needCard.jobId })
      .from(needCard)
      .where(
        inArray(
          needCard.companyId,
          chosen.map((c) => c.companyId),
        ),
      );
    const deps = realSeedDeps().applications;
    if (!deps) throw new Error("The application feature is not wired into the seed's dependencies");
    const started = Date.now();
    // Every company goes into the choice of who applies where, so a run limited to some
    // companies makes the same choice as a full run; only the named ones are then run.
    const companies: ApplyCompany[] = chosen.map((c) => ({
      number: c.number,
      companyId: c.companyId,
      jobId: c.jobId,
      needCardId: cards.find((card) => card.companyId === c.companyId && card.jobId === c.jobId)?.id ?? null,
    }));
    const report = await runSimulatedApplications(db, loadPersonas(), companies, {
      deps,
      log: (line) => console.error(`  ${line}`),
      onlyCompanies: only ? [...only] : undefined,
    });
    const minutes = ((Date.now() - started) / 60_000).toFixed(1);
    console.log(`Applications: ${report.assessed} of ${report.planned} assessed in ${minutes} min`);
    for (const f of report.failed) console.log(`  left out: ${f.personaId} to company ${f.companyNumber}: ${f.reason}`);

    const rows = await db.select({ jobId: application.jobId, status: application.status }).from(application);
    const perJob = new Map<string, number>();
    for (const r of rows) if (r.status === "assessed") perJob.set(r.jobId, (perJob.get(r.jobId) ?? 0) + 1);
    for (const c of chosen) console.log(`  Demo company ${String(c.number).padStart(2, "0")}: ${perJob.get(c.jobId) ?? 0} assessed applications`);

    if (values.snapshot) {
      const counts = await snapshotDemo(db);
      console.log(`Snapshot written to seed/snapshot: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
  } finally {
    await opened.close();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`seed-applications: ${describeError(error)}`);
    process.exit(2);
  },
);
