/** Helpers for tests: a fake `fetchImpl` and small builders. Not used by production code. */
import type { FetchLike } from "./polite-fetch";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export type FakeRoute = (url: URL, init: RequestInit | undefined) => Response | Promise<Response> | undefined;

/** A fetch that answers from `routes` (first to return a Response wins) and records every call. */
export function fakeFetch(routes: FakeRoute[]): FetchLike & { calls: Array<{ url: string; method: string; body?: unknown }> } {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const impl = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({
      url: input,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    for (const route of routes) {
      const res = await route(url, init);
      if (res) return res;
    }
    return jsonResponse({ error: "no route" }, 404);
  };
  return Object.assign(impl, { calls });
}

/** Options that make the polite client instant in tests. */
export const FAST = { minIntervalMs: 0, backoffMs: 0 } as const;
