import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Placeholder table. The lead replaces this schema.
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
