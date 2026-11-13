// Long-running worker process. Run with `npm run worker`.
// No queue logic here yet: feature agents register job handlers below.

const HEARTBEAT_MS = 60_000;

type JobHandler = (payload: unknown) => Promise<void>;
const handlers = new Map<string, JobHandler>();

export function registerHandler(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
}

// ---------------------------------------------------------------------------
// JOB HANDLERS: register them here, e.g. registerHandler("ingest-jobs", fn);
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`);
}

async function main(): Promise<void> {
  log(`started, ${handlers.size} handler(s) registered`);
  const timer = setInterval(() => log("heartbeat"), HEARTBEAT_MS);

  await new Promise<void>((resolve) => {
    const stop = (signal: string) => {
      log(`received ${signal}, shutting down`);
      clearInterval(timer);
      resolve();
    };
    process.once("SIGTERM", () => stop("SIGTERM"));
    process.once("SIGINT", () => stop("SIGINT"));
  });

  log("stopped");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
