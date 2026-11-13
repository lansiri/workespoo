/**
 * `npm run seed [-- --reset] [--rebuild] [--snapshot] [--companies 8|12] [--pitch-job <jobId>] [--mode express|full] [--fake] [--pglite]`
 *
 * Builds the demo: the event on Thursday 26 November 2026, masked "Demo company NN" companies
 * from real postings, their Need Cards, the simulated pool, eligibility, and yesterday's digest
 * history. Idempotent. `--snapshot` writes the generated rows to seed/snapshot after a seed.
 * `--reset` restores that snapshot with no model call (people, interviews, cards, Need Cards,
 * eligibility) and rebuilds only the date-dependent digests. Without a snapshot, or with
 * `--rebuild`, it removes the demo state and runs the whole pipeline again. `--fake` and
 * `--pglite` use an in-memory database, save nothing and always rebuild.
 */
import { parseArgs } from "node:util";
import { InterviewMode } from "../src/contracts";
import { realSeedDeps } from "../src/features/synth/deps";
import { describeError } from "../src/features/synth/errors";
import { createFakeEngine } from "../src/features/synth/fake-engine";
import { loadPersonas } from "../src/features/synth/persona";
import { renderUsage } from "../src/features/synth/usage";
import { openDb } from "../src/features/synth/script-db";
import { seedDemo } from "../src/features/synth/seed";
import { hasSnapshot, restoreDemoSnapshot, snapshotDemo } from "../src/features/synth/snapshot";
import { getEnv } from "../src/lib/env";

async function main() {
  const { values } = parseArgs({
    options: {
      reset: { type: "boolean", default: false },
      rebuild: { type: "boolean", default: false },
      snapshot: { type: "boolean", default: false },
      companies: { type: "string", default: "8" },
      "pitch-job": { type: "string" },
      mode: { type: "string" },
      fake: { type: "boolean", default: false },
      pglite: { type: "boolean", default: false },
    },
  });
  const companies = Number.parseInt(values.companies ?? "8", 10);
  if (companies !== 8 && companies !== 12) throw new Error("--companies must be 8 or 12");
  const mode = values.mode === undefined ? undefined : InterviewMode.parse(values.mode);
  const personas = loadPersonas();
  const env = getEnv();

  const opened = await openDb(values.fake || values.pglite);
  try {
    if (opened.memory) console.error("In-memory database: nothing is saved. Use it to rehearse, not to prepare the demo.");
    const deps = values.fake ? createFakeEngine(opened.db, { personas }) : realSeedDeps();
    const log = (line: string) => console.error(`  ${line}`);
    const restore = values.reset && !values.rebuild && !opened.memory && hasSnapshot();
    if (values.reset && !restore) log(opened.memory || values.rebuild ? "reset: rebuilding the whole pipeline" : "reset: no snapshot in seed/snapshot, rebuilding the whole pipeline (this calls the model)");
    const summary = restore
      ? (log("reset: restoring seed/snapshot, no model calls"), await restoreDemoSnapshot(opened.db, { deps, personas, appUrl: env.APP_URL, log }))
      : await seedDemo(opened.db, { deps, personas, companies, pitchJobId: values["pitch-job"], mode, reset: values.reset, appUrl: env.APP_URL, log });
    if (values.snapshot) {
      if (opened.memory) throw new Error("--snapshot needs the real database: leave out --fake and --pglite");
      const counts = await snapshotDemo(opened.db);
      console.log(`Snapshot written to seed/snapshot: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }

    console.log(`\nModel calls and waiting (from llm_call):\n${renderUsage(summary.usage)}`);
    console.log(`\nEvent ${summary.event.id}: Thursday 26 November 2026, 13:00-16:00, 9 slots per company`);
    console.log(`People: ${summary.personas.created} interviewed now, ${summary.personas.kept} kept from an earlier run (all synthetic)`);
    console.log(`Eligibility rows: ${summary.eligibilityRows}; queue jobs run: ${summary.queueJobsRun}`);
    console.log(`Yesterday (${summary.yesterday.date}): ${summary.yesterday.digests} published digests, ${summary.yesterday.picks} picks`);
    console.log(`Today (${summary.today.date}): ${summary.today.digests} drafted digests, ${summary.today.picks} picks; Demo company 03 ${summary.today.pitchLeftUndrafted ? "left undrafted" : "ALREADY DRAFTED"}`);
    console.log("\nDemo companies:");
    for (const c of summary.companies) {
      console.log(`  ${c.displayName}${c.number === 3 ? " (pitch)" : ""}: ${c.title}; eligible people: ${c.eligiblePeople}`);
      console.log(`    ${c.link}`);
    }
    console.log(
      env.ORGANISER_PASSCODE
        ? `\nOrganiser passcode: set in this environment (${env.ORGANISER_PASSCODE.length} characters).`
        : "\nOrganiser passcode: NOT SET. Set ORGANISER_PASSCODE in the server environment before opening /organiser.",
    );
    if (summary.warnings.length > 0) {
      console.log("\nWarnings:");
      for (const w of summary.warnings) console.log(`  - ${w}`);
    }
  } finally {
    await opened.close();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`seed: ${describeError(error)}`);
    process.exit(2);
  },
);
