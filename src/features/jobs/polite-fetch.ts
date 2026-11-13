/**
 * A small polite HTTP client for the public job and ESCO endpoints: generic User-Agent,
 * at most `maxConcurrent` requests in flight and one request start per `minIntervalMs`
 * per host, a timeout, and retries with backoff on 429, 5xx and network errors.
 */

export const USER_AGENT = "Mozilla/5.0 (compatible; workespoo-prototype)";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type PoliteOptions = {
  /** Injected in tests so nothing touches the network. */
  fetchImpl?: FetchLike;
  /** Requests in flight per host. Default 3. */
  maxConcurrent?: number;
  /** Minimum gap between request starts per host. Default 250 ms (4 per second). */
  minIntervalMs?: number;
  /** Per-attempt timeout. Default 30 s. */
  timeoutMs?: number;
  /** Retries after the first attempt. Default 2. */
  retries?: number;
  /** First backoff; doubles on each retry. Default 1000 ms. */
  backoffMs?: number;
};

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpStatusError";
  }
}

type HostState = { active: number; nextStart: number; waiters: Array<() => void> };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type PoliteFetcher = {
  getJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  postJson<T = unknown>(url: string, body: unknown): Promise<T>;
};

export function createPoliteFetcher(opts: PoliteOptions = {}): PoliteFetcher {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const maxConcurrent = opts.maxConcurrent ?? 3;
  const minIntervalMs = opts.minIntervalMs ?? 250;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 1000;
  const hosts = new Map<string, HostState>();

  function state(host: string): HostState {
    let s = hosts.get(host);
    if (!s) {
      s = { active: 0, nextStart: 0, waiters: [] };
      hosts.set(host, s);
    }
    return s;
  }

  async function acquire(host: string): Promise<void> {
    const s = state(host);
    while (s.active >= maxConcurrent) {
      await new Promise<void>((resolve) => s.waiters.push(resolve));
    }
    s.active++;
    const start = Math.max(Date.now(), s.nextStart);
    s.nextStart = start + minIntervalMs;
    const wait = start - Date.now();
    if (wait > 0) await sleep(wait);
  }

  function release(host: string): void {
    const s = state(host);
    s.active--;
    s.waiters.shift()?.();
  }

  async function request<T>(url: string, init: RequestInit): Promise<T> {
    const host = new URL(url).host;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
      await acquire(host);
      try {
        const res = await fetchImpl(url, {
          ...init,
          headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init.headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 429 || res.status >= 500) {
          lastError = new HttpStatusError(res.status, url);
          continue;
        }
        if (!res.ok) throw new HttpStatusError(res.status, url);
        return (await res.json()) as T;
      } catch (error) {
        if (error instanceof HttpStatusError) throw error; // 4xx other than 429: do not retry
        lastError = error; // network error, timeout, bad JSON
      } finally {
        release(host);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  return {
    getJson: (url, init) => request(url, { ...init, method: "GET" }),
    postJson: (url, body) =>
      request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}
