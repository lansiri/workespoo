/**
 * A small per-client limit in memory for the CV upload (the site is one web process). The table
 * is bounded: expired entries are dropped first and, if it is still full, the oldest client.
 */
export type RateLimiter = (key: string) => boolean;

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  maxKeys: number;
  now?: () => number;
}): RateLimiter {
  const now = opts.now ?? Date.now;
  const table = new Map<string, number[]>();
  return (key) => {
    const t = now();
    const recent = (table.get(key) ?? []).filter((at) => t - at < opts.windowMs);
    table.delete(key); // re-inserted below, so the Map's order is least recently used first
    if (recent.length >= opts.limit) {
      table.set(key, recent);
      return false;
    }
    recent.push(t);
    table.set(key, recent);
    if (table.size > opts.maxKeys) {
      for (const [k, v] of table) {
        if (v.every((at) => t - at >= opts.windowMs)) table.delete(k);
      }
      while (table.size > opts.maxKeys) {
        const oldest = table.keys().next().value;
        if (oldest === undefined) break;
        table.delete(oldest);
      }
    }
    return true;
  };
}

/** The client address: the first one in `x-forwarded-for` (Caddy sets it), else a shared bucket. */
export function clientKey(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first.slice(0, 64) : "unknown";
}
