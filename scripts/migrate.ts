import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
