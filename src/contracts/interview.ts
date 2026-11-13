import { z } from "zod";
import { Id, IsoDateTime, Lang, SentenceLabel } from "./common";
import { LookingFor, SignalKind } from "./signal";

/** `express`: three questions for the live pitch. `full`: five to seven questions. */
export const InterviewMode = z.enum(["express", "full"]);
export type InterviewMode = z.infer<typeof InterviewMode>;

export const InterviewStatus = z.enum(["active", "completed", "abandoned"]);
export type InterviewStatus = z.infer<typeof InterviewStatus>;

export const TurnRole = z.enum(["interviewer", "participant"]);
export type TurnRole = z.infer<typeof TurnRole>;

export const InputMode = z.enum(["voice", "text"]);
export type InputMode = z.infer<typeof InputMode>;

/**
 * Areas a conversation should touch. The interview spec defines when each counts as covered.
 * Kept as a closed list so prompts, the extractor and the UI agree.
 */
export const CoverageArea = z.enum([
  "recent_work",
  "strongest_skill",
  "tools_and_methods",
  "working_with_others",
  "what_next",
  "practicalities",
]);
export type CoverageArea = z.infer<typeof CoverageArea>;

export const Turn = z.object({
  id: Id,
  interviewId: Id,
  index: z.number().int().min(0),
  role: TurnRole,
  text: z.string(),
  /** `text` split into sentences when the turn is stored. Evidence refers to these by index. */
  sentences: z.array(z.string()),
  inputMode: InputMode.nullable(),
  at: IsoDateTime,
});
export type Turn = z.infer<typeof Turn>;

export const Interview = z.object({
  id: Id,
  talentId: Id,
  mode: InterviewMode,
  lang: Lang,
  status: InterviewStatus,
  startedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type Interview = z.infer<typeof Interview>;

/** One signal as the turn extractor returns it. Code resolves `refs` and grounds the phrase in ESCO. */
export const ExtractedSignal = z.object({
  phrase: z.string().min(1).max(80),
  kind: SignalKind,
  refs: z.array(SentenceLabel).min(1).max(6),
  hasExample: z.boolean(),
});
export type ExtractedSignal = z.infer<typeof ExtractedSignal>;

/**
 * JSON the turn extractor returns after each participant turn.
 * `steer` is a one-line note fed into the next interviewer prompt. It must never contain
 * an evaluation of the person.
 */
export const TurnExtraction = z.object({
  signals: z.array(ExtractedSignal).max(8),
  covered: z.array(CoverageArea),
  lookingFor: LookingFor.partial().nullable(),
  steer: z.string().max(240),
  readyToWrapUp: z.boolean(),
});
export type TurnExtraction = z.infer<typeof TurnExtraction>;

/** Request body for starting an interview. `consent` must be true or the request is rejected. */
export const StartInterviewRequest = z.object({
  mode: InterviewMode,
  lang: Lang.optional(),
  consent: z.object({
    interview: z.literal(true),
    voiceVendor: z.boolean(),
    liveDemo: z.boolean(),
  }),
});
export type StartInterviewRequest = z.infer<typeof StartInterviewRequest>;

export const StartInterviewResponse = z.object({
  interviewId: Id,
  talentId: Id,
  opening: Turn,
});
export type StartInterviewResponse = z.infer<typeof StartInterviewResponse>;

/** Request body for one participant turn. The response is a server-sent event stream. */
export const TurnRequest = z.object({
  text: z.string().min(1).max(4000),
  inputMode: InputMode,
});
export type TurnRequest = z.infer<typeof TurnRequest>;
