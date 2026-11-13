/**
 * `npm run sim -- --n 15 [--mode express|full] [--fake] [--pglite] [--db] [--out evals]`
 *
 * Runs the synthetic personas through the interview engine, computes the evaluation rubric of
 * docs/specs/interview.md section 10 and writes `evals/report.md` and `evals/report.json`.
 * `--fake` uses a built-in stand-in for the features that are not merged yet and an in-memory
 * database: it proves the harness, and the report says so. The real features run against an
 * in-memory database loaded with the fixture postings by default (`--pglite` says so
 * explicitly). `--db` is the only way to use DATABASE_URL; it refuses when the demo event
 * exists, because simulated people stay in the pool.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { InterviewMode } from "../src/contracts";
import { describeError } from "../src/features/synth/errors";
import { createFakeEngine } from "../src/features/synth/fake-engine";
import { loadPersonas } from "../src/features/synth/persona";
import { realSimDeps } from "../src/features/synth/deps";
import { DEMO_EVENT_ID } from "../src/features/synth/seed";
import { renderMarkdown } from "../src/features/synth/report";
import { assertNoDemoEvent, openDb, simUsesMemory } from "../src/features/synth/script-db";
import { runSimulation } from "../src/features/synth/simulate";

async function main() {
  const { values } = parseArgs({
    options: {
      n: { type: "string", default: "15" },
      mode: { type: "string" },
      fake: { type: "boolean", default: false },
      pglite: { type: "boolean", default: false },
      db: { type: "boolean", default: false },
      out: { type: "string", default: "evals" },
    },
  });
  const personas = loadPersonas();
  const n = Number.parseInt(values.n ?? "15", 10);
  if (!Number.isInteger(n) || n < 1 || n > personas.length) throw new Error(`--n must be between 1 and ${personas.length} (there are ${personas.length} persona files)`);
  const mode = values.mode === undefined ? undefined : InterviewMode.parse(values.mode);

  const opened = await openDb(simUsesMemory(values));
  try {
    if (!opened.memory) await assertNoDemoEvent(opened.db, DEMO_EVENT_ID);
    const deps = values.fake ? createFakeEngine(opened.db, { personas }) : realSimDeps();
    const log = (line: string) => console.error(`  ${line}`);
    console.error(`Simulating ${n} interviews (${values.fake ? "fake engine" : "real features"}${opened.memory ? ", in-memory database" : ""})`);
    const { report } = await runSimulation(opened.db, personas.slice(0, n), { mode, deps, engine: values.fake ? "fake" : "real", log });

    const dir = path.resolve(process.cwd(), values.out ?? "evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(path.join(dir, "report.md"), `${renderMarkdown(report)}\n`);

    for (const m of report.metrics) {
      const value = m.value === null ? "n/a" : Number.isInteger(m.value) ? String(m.value) : m.value.toFixed(3);
      console.log(`${m.status.toUpperCase().padEnd(4)} ${m.id.padEnd(3)} ${m.name}: ${value} (${m.threshold}${m.enforced ? "" : ", report only"})`);
    }
    console.log(`\nOverall: ${report.verdict.toUpperCase()}. Wrote ${path.join(dir, "report.md")} and report.json`);
    process.exitCode = report.verdict === "pass" ? 0 : 1;
  } finally {
    await opened.close();
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(`sim: ${describeError(error)}`);
    process.exit(2);
  },
);
