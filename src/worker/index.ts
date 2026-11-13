// Long-running worker process. Run with `npm run worker`.
// Features register their jobs and schedules in ./registry.

import { closeDb, getDb } from "@/db/client";
import { runSchedules, runWorkerLoop } from "@/lib/queue";
import { allJobs, allSchedules, backgroundKinds } from "./registry";

const HEARTBEAT_MS = 60_000;
/** Loops that take any job, quick ones first. One more loop takes quick jobs only. */
const GENERAL_LOOPS = Math.max(1, Number.parseInt(process.env.WORKER_LOOPS ?? "2", 10) || 2);

function log(msg: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`);
}

async function main(): Promise<void> {
  const db = getDb();
  const abort = new AbortController();
  log(`started, ${allJobs.length} job kind(s), ${allSchedules.length} schedule(s), ${GENERAL_LOOPS} general loop(s) and 1 for quick jobs`);
  const quickJobs = allJobs.filter((j) => !backgroundKinds.includes(j.kind));
  const timer = setInterval(() => log("heartbeat"), HEARTBEAT_MS);

  const stop = (signal: string) => {
    if (abort.signal.aborted) return;
    log(`received ${signal}, shutting down`);
    abort.abort();
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));

  try {
    await Promise.all([
      runWorkerLoop(db, quickJobs, { signal: abort.signal, workerId: `worker-${process.pid}-quick` }),
      ...Array.from({ length: GENERAL_LOOPS }, (_, i) =>
        runWorkerLoop(db, allJobs, { signal: abort.signal, workerId: `worker-${process.pid}-${i + 1}`, last: backgroundKinds }),
      ),
      runSchedules(db, allSchedules, abort.signal),
    ]);
  } finally {
    clearInterval(timer);
    await closeDb();
  }
  log("stopped");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
