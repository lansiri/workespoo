/** Publishing and following interview events (the `interview_event` table plus an in-process nudge). */
import { and, asc, eq, gt } from "drizzle-orm";
import { InterviewEvent } from "@/contracts";
import type { Db } from "@/db/client";
import { interviewEvent } from "@/db/schema";
import { notify, subscribe } from "./runtime";

/** Safety-net poll of the table when no in-process nudge arrives. */
export const FOLLOW_POLL_MS = 1000;

/** Persist an event and wake followers in this process. Returns the event id. */
export async function publishEvent(db: Db, interviewId: string, event: InterviewEvent): Promise<number> {
  const [row] = await db
    .insert(interviewEvent)
    .values({ interviewId, type: event.type, payload: event })
    .returning({ id: interviewEvent.id });
  notify(interviewId);
  return row?.id ?? 0;
}

export async function* followEvents(
  db: Db,
  interviewId: string,
  opts: { afterEventId?: number; signal?: AbortSignal } = {},
): AsyncGenerator<{ id: number; event: InterviewEvent }, void, void> {
  const { signal } = opts;
  let lastId = opts.afterEventId ?? 0;
  let dirty = true;
  let wake: (() => void) | null = null;
  const nudge = () => {
    dirty = true;
    wake?.();
  };
  const unsubscribe = subscribe(interviewId, nudge);
  const poll = setInterval(nudge, FOLLOW_POLL_MS);
  signal?.addEventListener("abort", nudge, { once: true });
  try {
    while (!signal?.aborted) {
      dirty = false;
      const rows = await db
        .select({ id: interviewEvent.id, payload: interviewEvent.payload })
        .from(interviewEvent)
        .where(and(eq(interviewEvent.interviewId, interviewId), gt(interviewEvent.id, lastId)))
        .orderBy(asc(interviewEvent.id));
      for (const row of rows) {
        lastId = row.id;
        const parsed = InterviewEvent.safeParse(row.payload);
        if (parsed.success) yield { id: row.id, event: parsed.data };
        if (signal?.aborted) return;
      }
      if (dirty || signal?.aborted) continue;
      await new Promise<void>((resolve) => {
        wake = resolve;
        if (dirty || signal?.aborted) resolve();
      });
      wake = null;
    }
  } finally {
    clearInterval(poll);
    unsubscribe();
    signal?.removeEventListener("abort", nudge);
  }
}
