# Second pass, model gateway: stay inside a shared rate limit, live calls first

## Why

One API key serves every model call of the product: the live interviewer, the turn extractor, card synthesis, Need Cards, match reasons and pick reasons, from two processes (web and worker). The provider allows 40 requests a minute for the whole key. Today a call that gets HTTP 429 waits for the `Retry-After` time (capped at 20 s) and tries again inside the same exhausted minute, twice. In the prompt lab that stalled calls for 20 to 48 seconds, including the interviewer's reply to a person who is waiting. Evidence: `docs/specs/prompts/PATCHES.md` (open blocker 1, patch IL-2) and `docs/llm-capabilities.md`.

## Yours

`src/lib/llm/**`, the model lines of `.env.example`. This is a lead-owned path handed to you for this task. Nothing else. Keep `chatText`, `chatStream`, `chatJson`, `setLlmFake`, record and replay working exactly as documented in `docs/LIB-API.md`: every feature depends on them, and 955 tests run through the fake.

## Build

1. **One gate per provider** in `limiter.ts`, replacing the separate semaphore and `RpmLimiter` calls in `core.ts` (which pace only NVIDIA today). `acquire({ role, signal, deadlineAt })` resolves with a release function and the time waited. A waiting call is let through when all of these hold:
   - fewer than `LLM_MAX_CONCURRENCY` (default 8) requests in flight for the provider; for `analyst` and `bulk`, fewer than that minus `LLM_LIVE_RESERVE_SLOTS` (default 2, floor of 1 usable slot);
   - fewer requests sent in the last 60 seconds than the provider's budget; for `analyst` and `bulk`, fewer than the budget minus `LLM_LIVE_RESERVE_RPM` (default 6, floor of 1);
   - the provider is not paused for this role (item 2).
   The budget is `floor(<PROVIDER>_MAX_RPM × LLM_RPM_SHARE)`, at least 1. `VERDA_MAX_RPM` defaults to 36, `NVIDIA_MAX_RPM` to 30, `CUSTOM_LLM_MAX_RPM` to 0, which means no per-minute limit. `LLM_RPM_SHARE` (default 1, between 0 and 1) is this process's share, so web and worker can split one key. Order: `live` before `analyst` before `bulk`, first come first served within a role, and a lower role is never let through while a higher one waits. A request counts against the minute when it is sent.
2. **HTTP 429.** Pause the provider: for `analyst` and `bulk` until the `Retry-After` time (10 s when the header is missing, at most 60 s); for `live` at most 1 s. Then:
   - if the role's list has another provider entry, move to it at once without waiting;
   - otherwise `live` tries once more after its pause and then fails (callers have a scripted fallback);
   - otherwise `analyst` and `bulk` wait out the pause and try again, as often as the deadline allows. These retries do not count against `MAX_RETRIES`, which stays at 2 for network errors and 5xx.
   The old 20 s cap on `Retry-After` goes.
3. **Deadlines.** `LlmOptions.deadlineMs` is declared already. Enforce it: one budget for the whole call from the moment it is made, covering waits at the gate, retries and backoff. For `chatStream` it ends when the first text is yielded; after that only the idle timeout (`timeoutMs`) applies. For `chatText` and `chatJson` it covers the whole answer, and for `chatJson` the repair attempt too. Defaults: live 6000, analyst 60000, bulk 180000. When it passes, abort the request in flight and fail the call. An attempt never outlives the deadline.
4. **What callers see.** `LlmMeta` gains `queuedMs` (total time waited at the gate over all attempts). `LlmError` gains `reason`: `"rate_limited" | "deadline" | "timeout" | "provider_error" | "not_configured"`. `chatJson` keeps resolving `{ data: null, error, meta }` instead of throwing. The `llm_call` row gets `attempts` and `queuedMs` (the columns `attempts` and `queued_ms` exist). Error text never contains prompt, output or key text, as today.
5. **Unchanged**: fake, record and replay modes never touch the gate or the clock; JSON mode handling; think-block stripping; the probe.
6. `.env.example`: document the new variables in one line each.

## Tests

Use the `timing` seam (`now`, `sleep`); no real waiting. At least: priority order across roles; the live reserve for slots and for the minute budget; `LLM_RPM_SHARE`; the window sliding after 60 s; a 429 pausing background roles for the `Retry-After` time while a live call fails within about a second; background calls surviving several 429s until the deadline; falling through to a second provider on 429 without waiting; a deadline passing while queued, during a retry wait, and during a request; abort while queued leaves no waiter behind and frees no slot twice; `queuedMs` and `attempts` on the meta and on the `llm_call` row; a `chatJson` repair attempt inside one deadline. Keep every existing test passing.

## Watch out for

- A live call must never wait behind background calls for a slot or for the minute budget.
- A released slot must wake the right waiter; an aborted waiter must not swallow a wake-up.
- Do not add a dependency.
