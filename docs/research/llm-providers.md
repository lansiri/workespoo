# Model providers

The app never calls Anthropic. Every model call goes through `src/lib/llm`, which speaks the OpenAI chat-completions format to whichever providers are configured in env. Researched 2026-11-13; anything marked "unverified" must be confirmed by the probe script once a key exists.

## Roles

| Role | Used for | What matters |
|---|---|---|
| `live` | The interviewer's spoken turn; light per-turn signal extraction | Time to first token. Reasoning/thinking must be off or minimal, or a voice loop has dead air. |
| `analyst` | End-of-interview Signal Card synthesis, Need Card drafting, match reasons | Reliable JSON, careful reading, long context |
| `bulk` | Synthetic personas and simulated candidates | Cost and rate limits |

Each role maps to `provider:model` in env and has an ordered fallback list.

## NVIDIA API (Nemotron and others)

- Base URL `https://integrate.api.nvidia.com/v1`, key format `nvapi-...`, OpenAI-compatible.
- `GET /v1/models` is public (83 models listed today). IDs seen on 2026-11-13:
  - Nemotron chat: `nvidia/nemotron-3.5-lightning-30b-a3b`, `nvidia/nemotron-3.5-bolt-e4b`, `nvidia/nemotron-nano-3-30b-a3b`, `nvidia/nemotron-3-super-120b-a12b`, `nvidia/nemotron-3.5-super-vl-120b-a12b`, `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-4-340b-instruct`
  - Also hosted there: `deepseek-ai/deepseek-v4.1-flash`, `moonshotai/kimi-k2.6`
  - Embeddings (not used by default): `nvidia/nemotron-3.5-embed-1b`, `nvidia/nemotron-3.5-embed-8b`
- Free tier: roughly 40 requests a minute per model, best effort, sometimes much lower at peak. It is for evaluation, not production. The gateway must rate-limit and back off, and the live demo should not depend on this tier alone.
- Unverified: JSON-schema `response_format` support per model, how reasoning is switched off per model, tool-calling support.

## Verda Inference (EU-hosted, Finland)

- In preview. One key works for both OpenAI and Anthropic wire formats; we use the OpenAI format.
- Listed models include Kimi K3.1 Pro (1M context, $2.00 input / $0.20 cached / $10.00 output per million tokens; reasoning tokens bill as output) and DeepSeek V4.1 Flash (1M context, switchable thinking, from $0.15 per million input tokens).
- Unverified: the base URL (read it from Verda's docs or dashboard), exact model IDs (the model-listing endpoint returns an `endpoint_model` such as `moonshotai/Kimi-K3`), rate limits, JSON-schema support.

## Starting assignment (confirm by measurement)

| Role | With a Verda key | With only an NVIDIA key |
|---|---|---|
| `live` | DeepSeek V4.1 Flash, thinking off | `nvidia/nemotron-3.5-lightning-30b-a3b` or `deepseek-ai/deepseek-v4.1-flash` |
| `analyst` | Kimi K3.1 Pro | `nvidia/nemotron-3-ultra-550b-a55b` or `moonshotai/kimi-k2.6` |
| `bulk` | DeepSeek V4.1 Flash | `nvidia/nemotron-3-super-120b-a12b` |

## What the gateway must handle

- Streaming text for `live`, with time-to-first-token logged.
- JSON output: try `response_format: {type: "json_schema"}` when the provider profile says it is supported, otherwise `{type: "json_object"}` with the schema in the prompt. Always validate with Zod and retry once with the validation errors.
- Reasoning output: strip `<think>...</think>` blocks and ignore `reasoning_content` fields; never show them to users.
- Per-provider rate limiting, retries with backoff on 429 and 5xx, and falling through to the next provider for the role.
- Record and replay: `LLM_MODE=record` saves each request and response under `fixtures/llm/`; `LLM_MODE=replay` serves them back so tests are deterministic and never call a live model.
- An audit row per call: role, provider, model, latency, token counts, purpose. Prompts and outputs are stored only for synthetic sessions.

## Probe script

`npm run llm:probe` runs a fixed set of checks against every configured `provider:model` and writes `docs/llm-capabilities.md`: time to first token, tokens per second, whether JSON-schema mode works, JSON validity over ten extraction prompts, whether reasoning can be disabled, and a Finnish sample for human review.
