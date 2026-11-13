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
  timeoutMs?: number;
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
