import { z } from "zod";
import { Id } from "./common";
import { CoverageArea, CoverageStatus, TurnKind } from "./interview";
import { JobTeaser } from "./jobs";
import { SignalPublic } from "./signal";

/**
 * Everything the server streams to the browser during an interview. One JSON object per
 * server-sent event, in the `data:` field. The `type` field discriminates.
 *
 * `turn.delta` and `turn.done` come back on the response to POST /api/interview/{id}/turn.
 * The rest arrive on GET /api/interview/{id}/events as background work finishes.
 * Signals are sent without the internal `hasExample` field.
 */
export const InterviewEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn.delta"), text: z.string() }),
  z.object({
    type: z.literal("turn.done"),
    turnIndex: z.number().int().min(0),
    text: z.string(),
    kind: TurnKind,
    /** True when this was the interviewer's closing line. */
    closing: z.boolean(),
  }),
  z.object({ type: z.literal("signal.proposed"), signal: SignalPublic }),
  z.object({ type: z.literal("signal.updated"), signal: SignalPublic }),
  z.object({
    type: z.literal("jobs.lit"),
    /** Active postings linked to the person's signals so far. */
    count: z.number().int().min(0),
    sample: z.array(JobTeaser).max(6),
  }),
  z.object({
    type: z.literal("coverage.updated"),
    areas: z.partialRecord(CoverageArea, CoverageStatus),
  }),
  z.object({ type: z.literal("interview.completed"), interviewId: Id, talentId: Id }),
  /** The draft card is ready for review. */
  z.object({ type: z.literal("card.ready"), talentId: Id }),
  z.object({ type: z.literal("error"), message: z.string(), retryable: z.boolean() }),
]);
export type InterviewEvent = z.infer<typeof InterviewEvent>;

export type InterviewEventType = InterviewEvent["type"];

/** Encode one event as a server-sent event frame. */
export function encodeSseEvent(event: InterviewEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
