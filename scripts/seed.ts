/**
 * `npm run seed [-- --reset] [--companies 8|12] [--mode express|full] [--fake] [--pglite]`
 *
 * Builds the demo: the event on Thursday 26 November 2026, masked "Demo company NN" companies
 * from real postings, their Need Cards, the simulated pool, eligibility, and yesterday's digest
 * history. Idempotent. `--reset` removes the demo state first (synthetic people, demo companies,
 * the event) and rebuilds it. `--fake` and `--pglite` use an in-memory database and save nothing.
 */
import { parseArgs } from "node:util";
import { InterviewMode } from "../src/contracts";
import { realSeedDeps } from "../src/features/synth/deps";
import { describeError } from "../src/features/synth/errors";
import { createFakeEngine } from "../src/features/synth/fake-engine";
import { loadPersonas } from "../src/features/synth/persona";
import { openDb } from "../src/features/synth/script-db";
import { seedDemo } from "../src/features/synth/seed";
import { getEnv } from "../src/lib/env";

async function main() {
  const { values } = parseArgs({
    options: {
      reset: { type: "boolean", default: false },
      companies: { type: "string", default: "8" },
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
    const summary = await seedDemo(opened.db, {
      deps,
      personas,
      companies,
      mode,
      reset: values.reset,
      appUrl: env.APP_URL,
      log: (line) => console.error(`  ${line}`),
    });

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
