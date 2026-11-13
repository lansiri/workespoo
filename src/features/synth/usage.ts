/**
 * Where the time and the model calls went in a simulation or a seed, read from the `llm_call`
 * rows (`attempts`, `queued_ms`). The lead runs these scripts against the real model with one
 * process and needs to see what each interview cost, in calls and in waiting.
 */
import { and, gte, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { llmCall } from "@/db/schema";

export type PurposeUsage = { calls: number; failed: number; attempts: number; queuedMs: number };

export type Usage = {
  calls: number;
  failed: number;
  /** Requests actually sent, counting provider retries and validation retries. */
  attempts: number;
  /** Time spent waiting for a rate-limit slot, summed over all calls. */
  queuedMs: number;
  byPurpose: Record<string, PurposeUsage>;
  /** Failed calls by the first words of the recorded error, which never contains prompt or output text. */
  failures: Record<string, number>;
};

export type UsageWindow = { label: string; startedAt: Date; endedAt: Date };
export type UsageEntry = { label: string; wallMs: number; usage: Usage };
export type UsageReport = { interviews: UsageEntry[]; total: UsageEntry };

type CallRow = { purpose: string; ok: boolean; error: string | null; attempts: number | null; queuedMs: number | null };

/** A short, stable key for a failure: letters only, first four words, at most 60 characters. */
export function failureReason(error: string | null): string {
  const words = (error ?? "unknown").toLowerCase().replace(/[^a-z_ ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 4).join(" ").slice(0, 60) || "unknown";
}

export function summariseCalls(rows: readonly CallRow[]): Usage {
  const usage: Usage = { calls: 0, failed: 0, attempts: 0, queuedMs: 0, byPurpose: {}, failures: {} };
  for (const row of rows) {
    const p = (usage.byPurpose[row.purpose] ??= { calls: 0, failed: 0, attempts: 0, queuedMs: 0 });
    // A row written before the gateway pass has no attempts: it was one request.
    const attempts = row.attempts ?? 1;
    const queued = row.queuedMs ?? 0;
    p.calls++;
    p.attempts += attempts;
    p.queuedMs += queued;
    usage.calls++;
    usage.attempts += attempts;
    usage.queuedMs += queued;
    if (!row.ok) {
      p.failed++;
      usage.failed++;
      const reason = failureReason(row.error);
      usage.failures[reason] = (usage.failures[reason] ?? 0) + 1;
    }
  }
  return usage;
}

async function callsBetween(db: Db, from: Date, to: Date): Promise<CallRow[]> {
  return db
    .select({ purpose: llmCall.purpose, ok: llmCall.ok, error: llmCall.error, attempts: llmCall.attempts, queuedMs: llmCall.queuedMs })
    .from(llmCall)
    .where(and(gte(llmCall.at, from), lte(llmCall.at, to)));
}

/** Margin for a clock that differs a little between this process and the database. */
const MARGIN_MS = 2_000;

/**
 * Usage per window (one per interview, in order) and for the whole run. Windows are sequential,
 * so a call belongs to the window it falls into; `total` covers everything from the first start
 * to `endedAt`, including work between interviews such as Need Card drafting.
 */
export async function buildUsageReport(db: Db, windows: readonly UsageWindow[], total: { startedAt: Date; endedAt: Date }): Promise<UsageReport> {
  const interviews: UsageEntry[] = [];
  for (const w of windows) {
    const rows = await callsBetween(db, new Date(w.startedAt.getTime() - MARGIN_MS), new Date(w.endedAt.getTime() + MARGIN_MS));
    interviews.push({ label: w.label, wallMs: w.endedAt.getTime() - w.startedAt.getTime(), usage: summariseCalls(rows) });
  }
  const all = await callsBetween(db, new Date(total.startedAt.getTime() - MARGIN_MS), new Date(total.endedAt.getTime() + MARGIN_MS));
  return {
    interviews,
    total: { label: "total", wallMs: total.endedAt.getTime() - total.startedAt.getTime(), usage: summariseCalls(all) },
  };
}

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function purposeLine(purpose: string, p: PurposeUsage): string {
  return `${purpose} ${p.calls}${p.failed > 0 ? ` (${p.failed} failed)` : ""}`;
}

function entryLines(e: UsageEntry): string[] {
  const u = e.usage;
  const purposes = Object.entries(u.byPurpose).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => purposeLine(k, v)).join(", ") || "none";
  const failures = Object.entries(u.failures).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  return [
    `${e.label}: wall ${sec(e.wallMs)}, ${u.calls} calls (${u.attempts} requests), waited for a rate-limit slot ${sec(u.queuedMs)}`,
    `  by purpose: ${purposes}`,
    `  failures by reason: ${failures}`,
  ];
}

/** Plain text, one block per interview and one for the total. */
export function renderUsage(report: UsageReport): string {
  return [...report.interviews.flatMap(entryLines), "", ...entryLines(report.total)].join("\n");
}
