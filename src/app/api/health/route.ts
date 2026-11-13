import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

async function checkDb(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("db timeout")), 2000);
    });
    await Promise.race([getDb().execute(sql`select 1`), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const dbOk = await checkDb();
  return Response.json(
    {
      status: dbOk ? "ok" : "degraded",
      commit: getEnv().GIT_COMMIT ?? "unknown",
      time: new Date().toISOString(),
      db: dbOk ? "ok" : "down",
    },
    { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
