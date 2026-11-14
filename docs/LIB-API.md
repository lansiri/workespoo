# Shared library API (`src/lib`)

Lead-owned. This file is the contract between the agents that build `src/lib` and the feature streams that use it. Signatures here are binding: implement them exactly, and code against them exactly. If a signature is wrong for your use, say so under "Requests for the lead"; do not work around it.

`Db` is the type exported from `@/db/client`. Every function that touches the database takes `db: Db` as its first parameter so tests can pass a PGlite instance from `createTestDb()`.

## `src/lib/ids.ts`

```ts
export type IdPrefix =
  | "tal" | "int" | "trn" | "job" | "co" | "nc" | "req" | "jm" | "dig" | "pick"
  | "intro" | "ag" | "ev" | "con" | "ntf" | "note";
/** `${prefix}_${12 random lowercase alphanumerics}`. */
export function newId(prefix: IdPrefix): string;
/** 32 random URL-safe characters, for signed links (digest, agenda). */
export function newToken(): string;
/** A pseudonymous handle such as `Birch-27`. Scheme: docs/specs/signal-card.md section 6. */
export function newHandle(isTaken: (handle: string) => Promise<boolean>): Promise<string>;
```

## `src/lib/http.ts`

```ts
export class HttpError extends Error {
  constructor(status: number, code: string, message?: string);
  readonly status: number;
  readonly code: string;
}
/** Parse and validate a JSON request body. Throws HttpError(400, "invalid_body"). */
export function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T>;
/** Turn any thrown value into a JSON error response `{ error: { code, message } }`. Never leaks stack traces. */
export function errorResponse(error: unknown): Response;
/** Wrap a route handler: `export const POST = route(async (request, ctx) => ...)`. Catches and maps errors. */
export function route<C>(handler: (request: Request, ctx: C) => Promise<Response>): (request: Request, ctx: C) => Promise<Response>;
```

## `src/lib/session.ts`

Signed, HTTP-only cookie (`SESSION_SECRET`). Demo-grade: no passwords for talent.

```ts
export type Session = { talentId?: string; organiser?: boolean };
export function getSession(): Promise<Session>;
export function setTalentSession(talentId: string): Promise<void>;
export function setOrganiserSession(): Promise<void>;
export function clearSession(): Promise<void>;
/** Returns the session's talent id. If `expected` is given, it must match. Throws HttpError 401 or 403. */
export function requireTalent(expected?: string): Promise<string>;
/** Throws HttpError 401 unless the organiser passcode was entered in this session. */
export function requireOrganiser(): Promise<void>;
/** Timing-safe comparison with ORGANISER_PASSCODE. */
export function verifyOrganiserPasscode(input: string): boolean;
/** Resolve a company from the secret in its digest link. Null when unknown. */
export function companyFromToken(db: Db, token: string): Promise<{ id: string; displayName: string } | null>;
```

## `src/lib/audit.ts`

```ts
export function audit(db: Db, event: {
  actor: Actor; action: AuditAction; subjectType: SubjectType; subjectId: string;
  detail?: Record<string, unknown>;   // ids and counts only: never transcript text, names or contacts
}): Promise<void>;
export function listAudit(db: Db, filter?: {
  subjectType?: SubjectType; subjectId?: string; action?: AuditAction; limit?: number; beforeId?: number;
}): Promise<AuditEvent[]>;             // newest first, default limit 100
```

`audit` rejects a `detail` that contains an email address or a phone number (it throws in tests and logs and strips in production).

## `src/lib/consent.ts`

```ts
export const CONSENT_TEXT_VERSION: string;
export function recordConsent(db: Db, c: { subjectType: "talent" | "company"; subjectId: string; kind: ConsentKind }): Promise<void>;
export function withdrawConsent(db: Db, c: { subjectType: "talent" | "company"; subjectId: string; kind: ConsentKind }): Promise<void>;
export function hasConsent(db: Db, c: { subjectType: "talent" | "company"; subjectId: string; kind: ConsentKind }): Promise<boolean>;
```

## `src/lib/redact.ts`

```ts
/** Replace email addresses and phone numbers with `[removed]`. Used on job descriptions before sentence splitting. */
export function redactContacts(text: string): string;
export function containsContact(text: string): boolean;
```

## `src/lib/sentences.ts` (exists)

`splitSentences(text)`, `renderEvidence(sentences, sentenceFrom, sentenceTo)` (1-based), `labelSentences(turnIndex, sentences)`. This is the only sentence splitter in the project; the interview spec's `Intl.Segmenter` wording is replaced by it.

## `src/lib/queue.ts`

A `job_queue` table polled with `FOR UPDATE SKIP LOCKED`. Kinds are open strings namespaced by feature (`jobs.ingest_source`, `interview.extract_turn`, ...).

```ts
export type JobDefinition = { kind: string; run(payload: unknown, ctx: { db: Db; attempt: number }): Promise<void> };
export function defineJob<T>(kind: string, schema: z.ZodType<T>,
  handler: (payload: T, ctx: { db: Db; attempt: number }) => Promise<void>): JobDefinition;
export function enqueue(db: Db, kind: string, payload: unknown,
  opts?: { runAfter?: Date; dedupeKey?: string; maxAttempts?: number }): Promise<void>;   // same open dedupeKey: no-op
/** Process every job that is ready now, then return how many ran. For tests and one-off scripts. */
export function runReadyJobs(db: Db, definitions: JobDefinition[]): Promise<number>;
/** Long-running loop for the worker process. Failed jobs retry with backoff until maxAttempts. */
export function runWorkerLoop(db: Db, definitions: JobDefinition[],
  opts?: { pollMs?: number; signal?: AbortSignal; workerId?: string }): Promise<void>;
/** Recurring work: every tick, enqueue `kind` with a dedupe key for the current period. */
export type Schedule = { kind: string; everyMinutes: number; payload?: unknown };
export function runSchedules(db: Db, schedules: Schedule[], signal?: AbortSignal): Promise<void>;
```

Each feature exports `jobs: JobDefinition[]` and `schedules: Schedule[]` from `src/features/<name>/jobs.ts`. `src/worker/index.ts` (lead-owned) imports them all.

## `src/lib/sse.ts` and `src/lib/sse-client.ts`

```ts
// server
export function sseResponse(
  run: (send: (event: InterviewEvent) => void, signal: AbortSignal) => Promise<void>,
): Response;   // text/event-stream, no buffering headers, closes when `run` resolves or the client disconnects

// client ("use client" safe, no server imports)
export function readSse(response: Response, onEvent: (event: InterviewEvent) => void, signal?: AbortSignal): Promise<void>;
```

## `src/lib/llm` (the model gateway)

No Anthropic SDK. OpenAI-compatible chat completions through the `openai` package with a custom base URL per provider. Provider and model per role come from env: `LLM_LIVE`, `LLM_ANALYST`, `LLM_BULK`, each `provider:model`, optionally a comma-separated fallback list.

```ts
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmMeta = {
  provider: string; model: string; latencyMs: number; firstTokenMs: number | null;
  tokensIn: number | null; tokensOut: number | null; ok: boolean; error: string | null; attempts: number;
};
export type LlmOptions = {
  role: LlmRole;            // "live" | "analyst" | "bulk"
  purpose: string;          // e.g. "interview.live", "interview.extract", "card.synthesis"; logged per call
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;       // idle timeout for one attempt
  deadlineMs?: number;      // total budget incl. rate-limit waits and retries; to first text for chatStream. Defaults: live 6 s, analyst 60 s, bulk 180 s
  signal?: AbortSignal;
  db?: Db;                  // when given, one `llm_call` row is written
  guard?: string | null;    // caller-supplied note about what an output guard did, stored on the row
};

export function chatText(opts: LlmOptions): Promise<{ text: string; meta: LlmMeta }>;

/** Yields text deltas. Reasoning output (`<think>` blocks, `reasoning_content`) is never yielded. */
export function chatStream(opts: LlmOptions): AsyncIterable<string> & { meta: Promise<LlmMeta> };

/**
 * JSON output validated against a Zod schema. Before validating: strip code fences and any text
 * before the first `{` and after the last `}`, then apply `coerce` if given. On a validation
 * failure, retry once with the extra user message
 * "Your output was not valid. Error: <summary, max 300 chars>. Return only the JSON object in the exact format."
 * A second failure or a timeout resolves with `data: null`; it does not throw.
 */
export function chatJson<T>(opts: LlmOptions & {
  schema: z.ZodType<T>;
  coerce?: (raw: unknown) => unknown;
}): Promise<{ data: T; meta: LlmMeta } | { data: null; error: string; meta: LlmMeta }>;

/** True when at least one provider for the role has a key configured. */
export function llmConfigured(role: LlmRole): boolean;
```

Testing without a model:

```ts
/** Install a fake for the duration of a test. The responder gets the options and returns text (or an object, which is JSON-stringified). */
export function setLlmFake(responder: ((opts: LlmOptions) => string | object | Promise<string | object>) | null): void;
```

`LLM_MODE=replay` serves recorded responses from `fixtures/llm/<purpose>/<hash>.json`; `LLM_MODE=record` writes them. In `NODE_ENV=test` the default is `replay`, so a test that reaches a model without a fake or a recording fails with a clear message. Tests never call a live model.

## `src/lib/mask.ts`

```ts
export const MASKED_EMPLOYER_WORD = "the company";
/** Whole names, names without their legal form, and long first words, longest first. */
export function employerTerms(...names: Array<string | null | undefined>): string[];
/** Replace the employer's name in posting-derived text. `employer` is one name or the terms from `employerTerms()`. */
export function maskEmployer(text: string, employer: string | readonly string[], replacement?: string): string;
```

Every feature that shows posting-derived text for a masked company uses this; no feature keeps its own copy.

## `src/lib/esco.ts`

```ts
export type EscoCandidate = { uri: string; labelEn: string; labelFi: string | null; similarity: number };
/** Trigram candidates over English and Finnish labels of non-retired concepts, best first. */
export function escoCandidates(db: Db, phrase: string,
  opts?: { type?: "skill" | "occupation"; limit?: number }): Promise<EscoCandidate[]>;
/** The best skill match at or above `minSimilarity` (default 0.45), or null. */
export function escoTopMatch(db: Db, phrase: string, minSimilarity?: number): Promise<EscoRef | null>;
export function escoByUris(db: Db, uris: string[]): Promise<Map<string, EscoRef>>;
```

## `src/lib/esco-pick.ts`

```ts
/** Prompt C: one `analyst` call chooses ESCO labels among candidates for a batch of phrases (card synthesis, and the interview's live notes). Key to ref, null for none; a failed call falls back to `escoTopMatch`. */
export function pickEscoLabels(db: Db, items: { key: string; phrase: string; kind: SignalKind }[],
  opts?: { purpose?: string; deadlineMs?: number }): Promise<Map<string, EscoRef | null>>;
```

## `src/lib/jobs-lit.ts`

```ts
/**
 * Active postings linked to these ESCO skill URIs: directly through `job_skill`, or through
 * occupations in `esco_occupation_skill`. Postings that belong to a masked demo company are
 * excluded. Pure SQL, no model call.
 */
export function jobsLitForSkillUris(db: Db, skillUris: string[],
  opts?: { municipalityCodes?: string[]; sampleSize?: number }): Promise<{ count: number; sample: JobTeaser[] }>;
```

## `src/lib/sql.ts`

```ts
/** Raw `db.execute(sql...)` returns an array with postgres.js and `{ rows }` with PGlite. This hides that. */
export function rowsOf<T>(result: unknown): T[];
```

## `src/lib/lexicon.ts` (exists)

`findBannedEvaluative(text)`, `findProtectedQuestion(text)`, `findProtectedCard(text)`, `findProtectedRequirement(text)`, `findSpeechCue(text)`, `findReasonJudgement(text, { pronouns })`, `stripQualityWords(phrase)`. The only word lists in the project, in English, Finnish and Swedish. The interview guard, the extractor merge step and card synthesis all use them. Do not copy the lists from the specs into feature code.

## `src/lib/i18n` (interface languages: English, Finnish, Swedish)

Every string a person can see goes through this. No page hardcodes interface text.

```ts
// src/lib/i18n/types.ts (exists)
export type Messages<T extends Record<string, string>> = Record<UiLang, T>;   // every language, same keys
export const UI_LANGS: readonly ["en", "fi", "sv"];
export const UI_LANG_NAMES: Record<UiLang, string>;      // "English", "Suomi", "Svenska"
export const UI_LANG_LOCALES: Record<UiLang, string>;    // "en-GB", "fi-FI", "sv-SE" (speech and formatting)

// src/lib/i18n/index.ts (isomorphic: safe in server and client code)
export function pick<T extends Record<string, string>>(messages: Messages<T>, lang: UiLang): T;
export function fmt(template: string, vars: Record<string, string | number>): string;   // "{count} postings"

// src/lib/i18n/server.ts (server components and route handlers)
export const UI_LANG_COOKIE = "ui_lang";
export function getUiLang(): Promise<UiLang>;   // cookie, else Accept-Language (fi, sv, en), else "en"

// src/lib/i18n/client.tsx ("use client")
export function I18nProvider(props: { lang: UiLang; children: React.ReactNode }): React.JSX.Element;
export function useUiLang(): UiLang;
export function useMessages<T extends Record<string, string>>(messages: Messages<T>): T;
export function LanguageSwitcher(): React.JSX.Element;   // sets the cookie and refreshes
```

How a feature uses it:

```ts
// src/features/<name>/messages.ts
import type { Messages } from "@/lib/i18n/types";
export const cardMessages = {
  en: { approve: "Approve my card", removed: "Removed" },
  fi: { approve: "Hyväksy korttini", removed: "Poistettu" },
  sv: { approve: "Godkänn mitt kort", removed: "Borttagen" },
} satisfies Messages<{ approve: string; removed: string }>;

// server component:  const m = pick(cardMessages, await getUiLang());
// client component:  const m = useMessages(cardMessages);
```

Shared content lives in `src/lib/i18n/content/`: `core.ts` (navigation, common buttons and errors), `copy.ts` (the microcopy from `docs/specs/copy.md` in all three languages) and `interview-lines.ts` (the interviewer's scripted lines, fallback question bank, command words and stopword lists). Use those before writing new strings. Each feature keeps its own extra strings in its own `messages.ts`, so no two streams edit the same catalogue.
