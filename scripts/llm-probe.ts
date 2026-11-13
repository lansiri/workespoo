/**
 * Probe every configured provider:model and write docs/llm-capabilities.md.
 * Run: npm run llm:probe [-- provider:model ...]
 * Never prints keys or full prompts. With no provider configured it says so and exits 0.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  PROVIDER_NAMES,
  getExtraBody,
  getProvider,
  getRoleEntries,
  parseRoleList,
  type Provider,
  type RoleEntry,
} from "../src/lib/llm/config";
import { createRawClient } from "../src/lib/llm/client";
import type { ChatClient, CompletionResult, StreamChunk } from "../src/lib/llm/client";
import { parseLenientJson } from "../src/lib/llm/json";
import { stripThink } from "../src/lib/llm/think";
import { redact } from "../src/lib/llm/core";
import { LlmRole } from "../src/contracts/trust";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), f));
  } catch {
    // file missing: fine
  }
}

type Target = { entry: RoleEntry; provider: Provider; extra: Record<string, unknown> };
type Row = {
  id: string;
  ttft: string;
  tps: string;
  jsonObject: string;
  jsonSchema: string;
  jsonValid: string;
  reasoningDefault: string;
  reasoningExtra: string;
  finnish: string;
};

const roles = LlmRole.options;
const Extraction = z.object({ skill: z.string().min(1), years: z.number().nullable() });
const PROMPTS = [
  "I fixed bicycles for five years at a small shop.",
  "Two summers as a lifeguard at the Espoo swimming hall.",
  "I speak Finnish, Swedish and some Arabic and I answered customer calls.",
  "I have never had a job but I coded a small game with Python.",
  "Ran the cash register at a grocery store for 18 months.",
  "I volunteered coaching a youth floorball team.",
  "Worked in a warehouse driving a forklift, about 3 years.",
  "Cleaned offices at night while studying nursing.",
  "I baked bread at my uncle's bakery every weekend.",
  "Helped elderly neighbours with their phones and computers.",
].map((t) => `Extract the main skill and years of experience (null if unknown) from: "${t}". Reply with JSON {"skill": string, "years": number|null}.`);

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
const errText = (e: unknown) => {
  const status = (e as { status?: number })?.status;
  return redact(status ? `HTTP ${status}` : e instanceof Error ? e.message.slice(0, 60) : "error");
};

async function streamOnce(client: ChatClient, model: string, extra: Record<string, unknown>, prompt: string, maxTokens: number) {
  const t0 = performance.now();
  const res = (await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.2,
    stream: true,
    stream_options: { include_usage: true },
    ...extra,
  })) as AsyncIterable<StreamChunk>;
  let first: number | null = null;
  let content = "";
  let sawReasoningField = false;
  let completionTokens: number | null = null;
  let chunksWithText = 0;
  for await (const c of res) {
    const d = c.choices?.[0]?.delta;
    if (d?.reasoning_content || d?.reasoning) sawReasoningField = true;
    if (d?.content) {
      first ??= performance.now() - t0;
      content += d.content;
      chunksWithText++;
    }
    if (c.usage?.completion_tokens) completionTokens = c.usage.completion_tokens;
  }
  const total = performance.now() - t0;
  return { first, total, content, sawReasoningField, tokens: completionTokens ?? chunksWithText };
}

async function completeOnce(client: ChatClient, model: string, extra: Record<string, unknown>, prompt: string, format?: Record<string, unknown>) {
  const res = (await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0,
    stream: false,
    ...(format ? { response_format: format } : {}),
    ...extra,
  })) as CompletionResult;
  return res.choices?.[0]?.message?.content ?? "";
}

async function probe(t: Target): Promise<Row> {
  const client = createRawClient(t.provider);
  const { entry, extra } = t;
  const row: Row = {
    id: `${entry.provider}:${entry.model}`,
    ttft: "n/a", tps: "n/a", jsonObject: "n/a", jsonSchema: "n/a", jsonValid: "n/a",
    reasoningDefault: "n/a", reasoningExtra: Object.keys(extra).length ? "n/a" : "no extra body", finnish: "",
  };
  const noExtra: Record<string, unknown> = {};

  try {
    const r = await streamOnce(client, entry.model, noExtra, "Write two short sentences about Espoo.", 120);
    row.ttft = r.first === null ? "no text" : `${Math.round(r.first)} ms`;
    const gen = r.first === null ? 0 : r.total - r.first;
    row.tps = r.first !== null && gen > 50 ? (r.tokens / (gen / 1000)).toFixed(1) : "too short";
  } catch (e) {
    row.ttft = `error ${errText(e)}`;
  }

  const askJson = '{"skill": string, "years": number|null}';
  for (const [key, format] of [
    ["jsonObject", { type: "json_object" }],
    ["jsonSchema", { type: "json_schema", json_schema: { name: "response", schema: z.toJSONSchema(Extraction) } }],
  ] as const) {
    try {
      const out = await completeOnce(client, entry.model, noExtra, `Return JSON ${askJson} for: five years of bike repair.`, format);
      const ok = Extraction.safeParse(parseLenientJson(stripThink(out))).success;
      row[key] = ok ? "accepted" : "accepted, output invalid";
    } catch (e) {
      row[key] = `rejected (${errText(e)})`;
    }
  }

  let valid = 0;
  let tried = 0;
  for (const p of PROMPTS) {
    tried++;
    try {
      const out = await completeOnce(client, entry.model, extra, p, { type: "json_object" });
      if (Extraction.safeParse(parseLenientJson(stripThink(out))).success) valid++;
    } catch {
      try {
        const out = await completeOnce(client, entry.model, extra, p);
        if (Extraction.safeParse(parseLenientJson(stripThink(out))).success) valid++;
      } catch {
        // counts as invalid
      }
    }
  }
  row.jsonValid = `${valid}/${tried}`;

  const reasoningCheck = async (ex: Record<string, unknown>) => {
    try {
      const r = await streamOnce(client, entry.model, ex, "What is 17 times 23? Answer briefly.", 400);
      const think = /<think>/i.test(r.content);
      return r.sawReasoningField || think ? `yes (${[r.sawReasoningField && "reasoning field", think && "think tags"].filter(Boolean).join(", ")})` : "no";
    } catch (e) {
      return `error ${errText(e)}`;
    }
  };
  row.reasoningDefault = await reasoningCheck(noExtra);
  if (Object.keys(extra).length) row.reasoningExtra = await reasoningCheck(extra);

  try {
    const out = await completeOnce(client, entry.model, extra, "Kirjoita kolme lausetta suomeksi siitä, miksi työhaastattelussa kannattaa kertoa omin sanoin, mitä on oppinut.");
    row.finnish = stripThink(out);
  } catch (e) {
    row.finnish = `error ${errText(e)}`;
  }
  return row;
}

function targets(): { list: Target[]; skipped: string[] } {
  const seen = new Set<string>();
  const list: Target[] = [];
  const skipped: string[] = [];
  const add = (entry: RoleEntry, role: (typeof roles)[number] | null) => {
    const id = `${entry.provider}:${entry.model}`;
    if (seen.has(id)) return;
    const provider = getProvider(entry.provider);
    if (!provider) {
      skipped.push(`${id} (no key or base URL for ${entry.provider})`);
      seen.add(id);
      return;
    }
    seen.add(id);
    list.push({ entry, provider, extra: role ? getExtraBody(role, entry.provider) : {} });
  };
  for (const role of roles) for (const e of getRoleEntries(role)) add(e, role);
  for (const e of parseRoleList(process.argv.slice(2).filter((a) => !a.startsWith("-")).join(","))) add(e, null);
  return { list, skipped };
}

async function main() {
  const { list, skipped } = targets();
  if (list.length === 0) {
    console.log(
      "No LLM provider is configured, so there is nothing to probe.\n" +
        `Set a key (${PROVIDER_NAMES.map((p) => (p === "custom" ? "CUSTOM_LLM_API_KEY" : `${p.toUpperCase()}_API_KEY`)).join(", ")}; verda and custom also need a base URL) ` +
        "and LLM_LIVE, LLM_ANALYST or LLM_BULK as provider:model, or pass provider:model as arguments.",
    );
    if (skipped.length) console.log(`Skipped: ${skipped.join("; ")}`);
    return;
  }
  const rows: Row[] = [];
  for (const t of list) {
    console.log(`Probing ${t.entry.provider}:${t.entry.model} ...`);
    rows.push(await probe(t));
  }
  const header = ["provider:model", "TTFT", "tokens/s", "json_object", "json_schema", "JSON valid (10)", "reasoning (default)", "reasoning (extra body)"];
  const md = [
    "# LLM capabilities",
    "",
    `Generated by \`npm run llm:probe\` on ${new Date().toISOString()}. Numbers are single-run and noisy; re-run before relying on them.`,
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${[r.id, r.ttft, r.tps, r.jsonObject, r.jsonSchema, r.jsonValid, r.reasoningDefault, r.reasoningExtra].map(cell).join(" | ")} |`),
    "",
    "## Finnish samples (for human review)",
    "",
    ...rows.flatMap((r) => [`**${r.id}**`, "", ...r.finnish.split("\n").map((l) => `> ${l}`), ""]),
    ...(skipped.length ? ["## Skipped", "", ...skipped.map((s) => `- ${s}`), ""] : []),
  ].join("\n");
  const file = path.resolve(process.cwd(), "docs", "llm-capabilities.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, md + "\n", "utf8");
  console.log("\n" + md + `\nWritten to ${file}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("llm:probe failed:", redact(e instanceof Error ? e.message : String(e)));
    process.exit(1);
  },
);
