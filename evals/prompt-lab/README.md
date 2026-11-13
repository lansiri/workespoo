# Prompt lab

Tries the product's prompts against the real model, so prompt wording and model settings are decided on evidence instead of hope. Results here feed `docs/llm-capabilities.md` and `docs/specs/prompts/PATCHES.md`.

## The model

One model is available today: `kimi-k3-1-pro` on Verda (`https://inference.verda.com/v1`, OpenAI-compatible, hosted in Finland). It serves all three roles. Settings live in `.env.local` (git-ignored):

| Role | Setting | Why |
|---|---|---|
| `live` | `reasoning_effort: "none"` | First word in about 0.9 to 1.9 s. With default reasoning it is 3 to 4 s. |
| `analyst` | `reasoning_effort: "low"` | Careful output at 1.5 to 5 s. |
| `bulk` | `reasoning_effort: "low"` | Same. |

Known from the first scout: `json_object` and `json_schema` response formats both work; reasoning arrives in a separate `reasoning_content` field, which the gateway drops; `enable_thinking` and `chat_template_kwargs` are ignored; Finnish and Swedish replies read naturally.

## Running cases

```
npm run lab -- evals/prompt-lab/<item>/cases.json --out evals/prompt-lab/<item>/results --repeat 2
npm run lab -- <file> --only <caseId> --repeat 5      # re-run one case
```

A case file names a role, an optional Zod schema exported from `src/contracts`, and a list of cases, each a full list of chat messages. JSON cases go through `chatJson` exactly as production does; free-text cases go through `chatStream` and record the time to the first word. One result file per case and run, plus `_summary.json`. See the header of `run.ts`.

To try a different setting for one run, set the variable inline, for example `LLM_EXTRA_BODY_LIVE='{"reasoning_effort":"low"}' npm run lab -- ...`.

## Rules for anyone working here

- Build each prompt from the template in its spec under `docs/specs/prompts/`, filling the placeholders. Do not improve the prompt silently: run the spec's wording first, record what happens, then test a change as a separate variant.
- Realistic inputs: postings from `fixtures/jobs/tmt-sample.json`, ESCO concepts from `fixtures/esco/subset.json`, answers the way people actually talk. Cover English, Finnish and Swedish.
- Judge outputs against the rules in the spec and in `CLAUDE.md`, and check them mechanically wherever possible: the contract schema, `src/lib/lexicon.ts` for banned and protected wording, references that must resolve.
- Keep to your own directory under `evals/prompt-lab/`. Do not edit specs, source code or other items' files, and do not run git commands that change anything.
- At most two model requests in flight (the runner enforces it for one process: do not start several runners at once), and stay within the number of calls your instructions give you. Every call spends the owner's credit.
- Never print, copy or commit an API key.
- Everything people-related here is synthetic.
