import type { LlmRole } from "@/contracts/trust";
import { getEnv } from "@/lib/env";

export const PROVIDER_NAMES = ["nvidia", "verda", "custom"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type Provider = { name: ProviderName; baseURL: string; apiKey: string };
export type RoleEntry = { provider: ProviderName; model: string };
export type JsonMode = "json_object" | "json_schema" | "none";

const ROLE_VARS = { live: "LLM_LIVE", analyst: "LLM_ANALYST", bulk: "LLM_BULK" } as const;
const EXTRA_VARS = {
  live: "LLM_EXTRA_BODY_LIVE",
  analyst: "LLM_EXTRA_BODY_ANALYST",
  bulk: "LLM_EXTRA_BODY_BULK",
} as const;

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** A provider is usable only with a key and a base URL. */
export function getProvider(name: ProviderName): Provider | null {
  const env = getEnv();
  const pick = {
    nvidia: [env.NVIDIA_BASE_URL, env.NVIDIA_API_KEY],
    verda: [env.VERDA_BASE_URL, env.VERDA_API_KEY],
    custom: [env.CUSTOM_LLM_BASE_URL, env.CUSTOM_LLM_API_KEY],
  }[name];
  const baseURL = clean(pick[0]);
  const apiKey = clean(pick[1]);
  return baseURL && apiKey ? { name, baseURL, apiKey } : null;
}

/** Every configured key, for redacting error text. */
export function configuredSecrets(): string[] {
  return PROVIDER_NAMES.map((n) => getProvider(n)?.apiKey).filter((k): k is string => !!k);
}

/** Parse `provider:model,provider:model`. The model id keeps any `/` and `:`; only the first `:` splits. */
export function parseRoleList(raw: string | undefined): RoleEntry[] {
  const out: RoleEntry[] = [];
  for (const part of (raw ?? "").split(",")) {
    const item = part.trim();
    const i = item.indexOf(":");
    if (i <= 0) continue;
    const provider = item.slice(0, i).trim().toLowerCase();
    const model = item.slice(i + 1).trim();
    if (!model || !(PROVIDER_NAMES as readonly string[]).includes(provider)) continue;
    out.push({ provider: provider as ProviderName, model });
  }
  return out;
}

/** The role's ordered fallback list, without providers that have no key. */
export function getRoleEntries(role: LlmRole): RoleEntry[] {
  const raw = getEnv()[ROLE_VARS[role]];
  return parseRoleList(raw).filter((e) => getProvider(e.provider) !== null);
}

/**
 * Extra request body per role, from `LLM_EXTRA_BODY_<ROLE>` (JSON object). A `by_provider`
 * key holds per-provider objects that are merged over the shared part:
 * `{"by_provider":{"nvidia":{"chat_template_kwargs":{"enable_thinking":false}}}}`.
 * Invalid JSON is ignored (the variable name is warned about, never its value).
 */
export function getExtraBody(role: LlmRole, provider: ProviderName): Record<string, unknown> {
  const name = EXTRA_VARS[role];
  const raw = clean(process.env[name]);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    const { by_provider, ...shared } = parsed as Record<string, unknown>;
    const specific =
      by_provider && typeof by_provider === "object"
        ? ((by_provider as Record<string, unknown>)[provider] as Record<string, unknown> | undefined)
        : undefined;
    return { ...shared, ...(specific && typeof specific === "object" ? specific : {}) };
  } catch {
    console.warn(`[llm] ${name} is not a valid JSON object and is ignored`);
    return {};
  }
}

export function getJsonMode(): JsonMode {
  const v = clean(process.env.LLM_JSON_MODE)?.toLowerCase();
  return v === "json_schema" || v === "none" ? v : "json_object";
}

function positiveInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const nvidiaMaxRpm = () => positiveInt("NVIDIA_MAX_RPM", 30);
export const maxConcurrency = () => positiveInt("LLM_MAX_CONCURRENCY", 8);

function nonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Slots kept free for `live` calls (default 2). */
export const liveReserveSlots = () => nonNegativeInt("LLM_LIVE_RESERVE_SLOTS", 2);
/** Requests per minute kept free for `live` calls (default 6). */
export const liveReserveRpm = () => nonNegativeInt("LLM_LIVE_RESERVE_RPM", 6);

/** This process's share of the provider's per-minute limit: 0 to 1, default 1. */
export function rpmShare(): number {
  const n = Number.parseFloat(process.env.LLM_RPM_SHARE ?? "");
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1;
}

/** Requests per minute for the whole key; 0 means no per-minute limit. */
export function providerMaxRpm(provider: string): number {
  if (provider === "verda") return nonNegativeInt("VERDA_MAX_RPM", 36);
  if (provider === "nvidia") return nonNegativeInt("NVIDIA_MAX_RPM", 30);
  return nonNegativeInt("CUSTOM_LLM_MAX_RPM", 0);
}

/** This process's per-minute budget for a provider, or null for no limit. */
export function providerRpmBudget(provider: string): number | null {
  const max = providerMaxRpm(provider);
  return max === 0 ? null : Math.max(1, Math.floor(max * rpmShare()));
}

/** Default total budget of one call by role. */
export const defaultDeadlineMs = (role: LlmRole) => (role === "live" ? 6_000 : role === "analyst" ? 60_000 : 180_000);

export const DEFAULT_MAX_TOKENS = 800;
export const DEFAULT_TEMPERATURE = 0.2;
export const defaultTimeoutMs = (role: LlmRole) => (role === "live" ? 15_000 : 30_000);

export function llmConfigured(role: LlmRole): boolean {
  return getRoleEntries(role).length > 0;
}
