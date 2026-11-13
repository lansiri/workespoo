import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { escoOccupationFetch, escoOccupationSkill } from "@/db/schema";
import { createPoliteFetcher, HttpStatusError, type PoliteOptions } from "./polite-fetch";

export const ESCO_API_BASE = "https://ec.europa.eu/esco/api";
export const ESCO_VERSION = "v1.2.1";
const ESCO_OCCUPATION_PREFIX = "http://data.europa.eu/esco/occupation/";

export type OccupationCrawlResult = {
  /** Occupation URIs still to fetch when the run started (before `limit`). */
  pending: number;
  fetched: number;
  /** Links stored (essential + optional). */
  links: number;
  /** Answered with a permanent client error (recorded as `ok = false`, not retried). */
  missing: number;
  /** Network or server errors after retries (not recorded, so a later run retries them). */
  failed: number;
};

function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}

function linkedUris(links: unknown, relation: string): string[] {
  const list = (links as Record<string, unknown> | null | undefined)?.[relation];
  if (!Array.isArray(list)) return [];
  return list
    .map((l) => (l as { uri?: unknown })?.uri)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

/** Occupation URIs on active postings that have not been fetched yet. */
export async function pendingOccupationUris(db: Db): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT u AS uri
    FROM job j, unnest(j.esco_occupation_uris) AS u
    WHERE j.active
      AND u LIKE ${ESCO_OCCUPATION_PREFIX + "%"}
      AND NOT EXISTS (SELECT 1 FROM esco_occupation_fetch f WHERE f.occupation_uri = u)
    ORDER BY u
  `);
  return unwrapRows<{ uri: string }>(result).map((r) => r.uri);
}

/**
 * For occupation URIs used by active postings and not yet fetched, call the ESCO API once and
 * store the essential and optional skill links in `esco_occupation_skill`. Paced at 2 requests
 * per second. Finnish national occupations (no ESCO page) are not fetched.
 */
export async function crawlOccupationSkills(
  db: Db,
  opts: PoliteOptions & { limit?: number; onProgress?: (message: string) => void } = {},
): Promise<OccupationCrawlResult> {
  const http = createPoliteFetcher({ maxConcurrent: 1, minIntervalMs: 500, timeoutMs: 30_000, ...opts });
  const log = opts.onProgress ?? (() => {});
  const pending = await pendingOccupationUris(db);
  const todo = opts.limit !== undefined ? pending.slice(0, Math.max(0, opts.limit)) : pending;
  const result: OccupationCrawlResult = { pending: pending.length, fetched: 0, links: 0, missing: 0, failed: 0 };

  for (const uri of todo) {
    const url = `${ESCO_API_BASE}/resource/occupation?uri=${encodeURIComponent(uri)}&language=en&selectedVersion=${ESCO_VERSION}`;
    try {
      const data = await http.getJson<{ _links?: unknown }>(url);
      const essential = linkedUris(data._links, "hasEssentialSkill");
      const optional = linkedUris(data._links, "hasOptionalSkill");
      const rows = new Map<string, "essential" | "optional">();
      for (const s of optional) rows.set(s, "optional");
      for (const s of essential) rows.set(s, "essential"); // essential wins when a skill is in both
      await db.transaction(async (tx) => {
        await tx.delete(escoOccupationSkill).where(sql`${escoOccupationSkill.occupationUri} = ${uri}`);
        if (rows.size > 0) {
          await tx
            .insert(escoOccupationSkill)
            .values([...rows].map(([skillUri, relation]) => ({ occupationUri: uri, skillUri, relation })));
        }
        await tx
          .insert(escoOccupationFetch)
          .values({ occupationUri: uri, ok: true, skillCount: rows.size })
          .onConflictDoUpdate({
            target: escoOccupationFetch.occupationUri,
            set: { ok: true, skillCount: rows.size, fetchedAt: new Date() },
          });
      });
      result.fetched++;
      result.links += rows.size;
    } catch (error) {
      if (error instanceof HttpStatusError && error.status >= 400 && error.status < 500) {
        await db
          .insert(escoOccupationFetch)
          .values({ occupationUri: uri, ok: false, skillCount: 0 })
          .onConflictDoUpdate({
            target: escoOccupationFetch.occupationUri,
            set: { ok: false, skillCount: 0, fetchedAt: new Date() },
          });
        result.missing++;
      } else {
        result.failed++;
      }
      log(`occupation ${uri} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
