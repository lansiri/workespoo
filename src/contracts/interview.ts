import { z } from "zod";
import { Id, InputMode, IsoDateTime, SentenceLabel, UiLang } from "./common";
import { SignalKind } from "./signal";

/** `express`: exactly three questions, for the live pitch. `full`: five to seven questions. */
export const InterviewMode = z.enum(["express", "full"]);
export type InterviewMode = z.infer<typeof InterviewMode>;

export const InterviewStatus = z.enum(["active", "completed", "abandoned"]);
export type InterviewStatus = z.infer<typeof InterviewStatus>;

export const InterviewStage = z.enum([
  "opening",
  "awaiting_answer",
  "replying",
  "closing",
  "synthesising",
]);
export type InterviewStage = z.infer<typeof InterviewStage>;

export const TurnRole = z.enum(["interviewer", "participant"]);
export type TurnRole = z.infer<typeof TurnRole>;

/** What a turn was. `review_note` holds words the person adds during card review. */
export const TurnKind = z.enum([
  "opening",
  "question",
  "probe",
  "repair",
  "closing",
  "answer",
  "review_note",
]);
export type TurnKind = z.infer<typeof TurnKind>;

/** Areas a conversation touches, in priority order. See `docs/specs/interview.md` section 3. */
export const CoverageArea = z.enum([
  "recent_work",
  "example",
  "tools",
  "people",
  "beyond",
  "open_floor",
  "looking_for",
]);
export type CoverageArea = z.infer<typeof CoverageArea>;

export const CORE_AREAS = ["example", "tools", "people", "beyond"] as const satisfies readonly CoverageArea[];

export const CoverageStatus = z.enum(["open", "asked", "thin", "covered", "skipped"]);
export type CoverageStatus = z.infer<typeof CoverageStatus>;

/** Situations the extractor can flag. Only counts are stored, never the text that caused them. */
export const InterviewFlag = z.enum([
  "short",
  "buzzwords",
  "off_topic",
  "question_to_ai",
  "protected_info",
  "distress",
  "wants_stop",
  "injection",
]);
export type InterviewFlag = z.infer<typeof InterviewFlag>;

export const CvSeed = z.object({ topic: z.string().max(120), question: z.string().max(240) });
export type CvSeed = z.infer<typeof CvSeed>;

/** Durable interview state, stored as jsonb on the interview row. Owned by the interview engine. */
export const InterviewState = z.object({
  stage: InterviewStage,
  questionsAsked: z.number().int().min(0),
  repairsInRow: z.number().int().min(0),
  coverage: z.record(CoverageArea, CoverageStatus),
  reasked: z.array(CoverageArea),
  probesUsed: z.number().int().min(0),
  /** Signal ids that were already probed for an example. */
  probed: z.array(z.string()),
  /** The extractor's latest steering note. Never an evaluation of the person. */
  lastNote: z.string().max(240),
  flagCounts: z.partialRecord(InterviewFlag, z.number().int().min(0)),
  cvSeeds: z.array(CvSeed).max(2),
  uiLang: UiLang,
  startedAt: IsoDateTime,
  /** Ids of the signals the latest extraction created or updated. The planner reads these. */
  lastExtracted: z.array(z.string()).optional(),
  /** Flags from the last two extractions, oldest first. Flag names only, never the text behind them. */
  recentFlags: z.array(z.array(InterviewFlag)).max(2).optional(),
});
export type InterviewState = z.infer<typeof InterviewState>;

export function initialInterviewState(uiLang: UiLang, startedAt: IsoDateTime): InterviewState {
  return {
    stage: "opening",
    questionsAsked: 0,
    repairsInRow: 0,
    coverage: {
      recent_work: "open",
      example: "open",
      tools: "open",
      people: "open",
      beyond: "open",
      open_floor: "open",
      looking_for: "open",
    },
    reasked: [],
    probesUsed: 0,
    probed: [],
    lastNote: "",
    flagCounts: {},
    cvSeeds: [],
    uiLang,
    startedAt,
  };
}

export const Turn = z.object({
  id: Id,
  interviewId: Id,
  /** 0-based over all turns: T0 is the opening, T1 the first answer. */
  index: z.number().int().min(0),
  role: TurnRole,
  kind: TurnKind,
  /** The area an interviewer turn targets, or the area a participant turn answers. */
  target: CoverageArea.nullable(),
  text: z.string(),
  /** `text` split into sentences when the turn is stored. Evidence refers to these, 1-based. */
  sentences: z.array(z.string()),
  /** The sentences as first stored, set when the person corrects the transcript. */
  sentencesOriginal: z.array(z.string()).nullable(),
  /** Detected language of a participant turn. Hidden from companies and organisers. */
  lang: z.string().max(8).nullable(),
  inputMode: InputMode.nullable(),
  redactedAt: IsoDateTime.nullable(),
  at: IsoDateTime,
});
export type Turn = z.infer<typeof Turn>;

export const Interview = z.object({
  id: Id,
  talentId: Id,
  mode: InterviewMode,
  /** Conversation language as detected (for example `en`, `fi`, `unknown`). Never shown to companies. */
  lang: z.string().min(2).max(8),
  status: InterviewStatus,
  state: InterviewState,
  startedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type Interview = z.infer<typeof Interview>;

/* ------------------------------------------------------------------------------------------
 * Model outputs. Shapes follow docs/specs/prompts/turn-extractor.md and card-synthesis.md.
 * ---------------------------------------------------------------------------------------- */

export const ExtractorSignal = z.object({
  /** `new`, or the id of a known signal this adds evidence to. */
  ref: z.string().regex(/^(new|s\d+)$/),
  phrase: z.string().min(2).max(60),
  kind: SignalKind,
  evidence: z.array(SentenceLabel).min(1).max(4),
  hasExample: z.boolean(),
});
export type ExtractorSignal = z.infer<typeof ExtractorSignal>;

/** JSON the turn extractor returns after each participant turn. */
export const ExtractorOutput = z.object({
  lang: z.string().min(2).max(3),
  signals: z.array(ExtractorSignal).max(5),
  /** Only the areas this turn touched. */
  coverage: z.partialRecord(CoverageArea, z.enum(["covered", "thin"])),
  flags: z.array(InterviewFlag),
  /** One-line steering note for the next question. */
  note: z.string().max(200),
});
export type ExtractorOutput = z.infer<typeof ExtractorOutput>;

export const SynthSignal = z.object({
  phrase: z.string().min(2).max(60),
  kind: SignalKind,
  evidence: z.array(SentenceLabel).min(1).max(3),
  /** Ids of the live signals this one was built from. */
  from: z.array(z.string().regex(/^s\d+$/)).max(6),
  rendering: z.string().min(5).max(220),
});
export type SynthSignal = z.infer<typeof SynthSignal>;

/** JSON the analyst model returns when synthesising a card at the end of an interview. */
export const SynthOutput = z.object({
  headline: z.string().min(3).max(90),
  summary: z.string().min(5).max(300),
  signals: z.array(SynthSignal).max(14),
  roles: z.array(z.string().max(60)).max(3),
  rolesEvidence: z.array(SentenceLabel).max(3),
});
export type SynthOutput = z.infer<typeof SynthOutput>;

/**
 * JSON the analyst model returns when it matches card phrases to ESCO candidates
 * (docs/specs/prompts/card-synthesis.md, prompt C). `i` is the item's number in the request,
 * `choice` the candidate's number, or 0 for "none fits".
 */
export const EscoPickOutput = z.object({
  picks: z.array(z.object({ i: z.number().int().min(0), choice: z.number().int().min(0).max(8) })).max(20),
});
export type EscoPickOutput = z.infer<typeof EscoPickOutput>;

/* ------------------------------------------------------------------------------------------
 * API requests and responses
 * ---------------------------------------------------------------------------------------- */

/** Request body for starting an interview. `consent.interview` must be true. */
export const StartInterviewRequest = z.object({
  mode: InterviewMode,
  uiLang: UiLang,
  consent: z.object({
    interview: z.literal(true),
    voiceVendor: z.boolean(),
    liveDemo: z.boolean(),
  }),
  /** Optional CV text. It only seeds questions, is untrusted, and is discarded after the session. */
  cvText: z.string().max(20000).optional(),
});
export type StartInterviewRequest = z.infer<typeof StartInterviewRequest>;

export const StartInterviewResponse = z.object({
  interviewId: Id,
  talentId: Id,
  handle: z.string(),
  opening: Turn,
});
export type StartInterviewResponse = z.infer<typeof StartInterviewResponse>;

/** Request body for one participant turn. The response is a server-sent event stream. */
export const TurnRequest = z.object({
  text: z.string().min(1).max(4000),
  inputMode: InputMode,
  /** Language code reported by the voice adapter, when it has one. */
  sttLang: z.string().max(8).optional(),
  /**
   * An id the browser makes up for this answer. Sending the same id again (a retry after a
   * network error) must not store a second answer.
   */
  clientTurnId: z.string().min(8).max(64).optional(),
});
export type TurnRequest = z.infer<typeof TurnRequest>;

/** Stored length cap for a participant turn, and how much of it models see. */
export const TURN_MAX_STORED_CHARS = 2000;
export const TURN_MAX_MODEL_CHARS = 1200;
