import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";
import { requireEnv } from "@/lib/env";

export { schema };

/**
 * Database type that both the production (postgres.js) instance and the
 * PGlite test instance satisfy. Feature code takes `db: Db`.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type ProdDb = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

let instance: ProdDb | undefined;

/** Lazy singleton. Connects on first query, not at import. */
export function getDb(): ProdDb {
  if (!instance) {
    const client = postgres(requireEnv("DATABASE_URL"), { max: 10, connect_timeout: 5 });
    instance = drizzle(client, { schema });
  }
  return instance;
}

/** Close the singleton (scripts and shutdown). */
export async function closeDb(): Promise<void> {
  if (instance) {
    const db = instance;
    instance = undefined;
    await db.$client.end({ timeout: 5 });
  }
}
