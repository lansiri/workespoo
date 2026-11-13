/** Run personas through the interview, compute the rubric, and build the report. */
import { gte } from "drizzle-orm";
import type { InterviewMode } from "@/contracts";
import type { Db } from "@/db/client";
import { llmCall } from "@/db/schema";
import type { SimDeps } from "./deps";
import { computeMetrics } from "./metrics";
import type { Persona } from "./persona";
import { buildReport, type Report } from "./report";
import { runSimulatedInterview, type SimulatedRun } from "./run";
import { buildUsageReport, type UsageReport } from "./usage";

export type SimulationOptions = {
  mode?: InterviewMode;
  deps?: SimDeps;
  engine: "real" | "fake";
  now?: () => Date;
  log?: (line: string) => void;
};

export async function runSimulation(db: Db, personas: Persona[], options: SimulationOptions): Promise<{ runs: SimulatedRun[]; report: Report; usage: UsageReport }> {
  const now = options.now ?? (() => new Date());
  const since = now();
  const wallStart = new Date(); // real time, for attributing `llm_call` rows (`now` may be a test clock)
  const runs: SimulatedRun[] = [];
  for (const persona of personas) {
    runs.push(await runSimulatedInterview(db, persona, options.mode ?? persona.interviewMode, { deps: options.deps, log: options.log }));
  }
  // A small margin guards against clock differences between this process and the database.
  const calls = await db.select().from(llmCall).where(gte(llmCall.at, new Date(since.getTime() - 5_000)));
  const metrics = computeMetrics(runs, calls);
  const report = buildReport(runs, metrics, {
    generatedAt: now().toISOString(),
    engine: options.engine,
    mode: options.mode ?? "persona",
    personas: personas.length,
  });
  const usage = await buildUsageReport(
    db,
    runs.flatMap((r) => (r.timing ? [{ label: `${r.persona.id} (${r.mode})`, ...r.timing }] : [])),
    { startedAt: wallStart, endedAt: new Date() },
  );
  return { runs, report, usage };
}
