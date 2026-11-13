// Long-running worker process. Run with `npm run worker`.
// Features register their jobs and schedules in ./registry.

import { closeDb, getDb } from "@/db/client";
import { runSchedules, runWorkerLoop } from "@/lib/queue";
import { allJobs, allSchedules } from "./registry";

const HEARTBEAT_MS = 60_000;

function log(msg: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`);
}

async function main(): Promise<void> {
  const db = getDb();
  const abort = new AbortController();
  log(`started, ${allJobs.length} job kind(s), ${allSchedules.length} schedule(s)`);
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
      runWorkerLoop(db, allJobs, { signal: abort.signal }),
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
