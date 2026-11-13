import { customType, timestamp } from "drizzle-orm/pg-core";

/** Postgres `tsvector`, used for the generated full-text column on postings. */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const createdAt = () => timestamptz("created_at").notNull().defaultNow();
