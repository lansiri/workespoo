import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { appMeta } from "./schema";

describe("test database", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  it("round-trips app_meta", async () => {
    await t.db.insert(appMeta).values({ key: "hello", value: { a: 1 } });
    const rows = await t.db.select().from(appMeta).where(eq(appMeta.key, "hello"));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toEqual({ a: 1 });
    expect(rows[0].updatedAt).toBeInstanceOf(Date);
  });

  it("has pg_trgm", async () => {
    const res = await t.db.execute<{ s: number }>(sql`select similarity('abc','abd')::float as s`);
    const row = (res as unknown as { rows: { s: number }[] }).rows[0];
    expect(row.s).toBeGreaterThan(0);
  });
});
