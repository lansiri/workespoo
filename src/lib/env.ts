import { z } from "zod";

// Empty strings (from `KEY=` lines in .env files) count as unset.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

// One or more `provider:model` entries, comma-separated, in fallback order. The model id may
// itself contain `/` and `:`. Spaces around commas are allowed.
const modelRef = optional(
  z.string().refine(
    (value) => {
      const entries = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      return entries.length > 0 && entries.every((entry) => /^[^:\s]+:\S+$/.test(entry));
    },
    { message: "expected provider:model, optionally a comma-separated list" },
  ),
);

const schema = z.object({
  DATABASE_URL: optional(z.string()),
  APP_URL: optional(z.string()),
  NODE_ENV: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["development", "test", "production"]).default("development"),
  ),
  GIT_COMMIT: optional(z.string()),
  ORGANISER_PASSCODE: optional(z.string()),
  SESSION_SECRET: optional(z.string()),
  LLM_MODE: optional(z.enum(["live", "record", "replay"])),
  LLM_LIVE: modelRef,
  LLM_ANALYST: modelRef,
  LLM_BULK: modelRef,
  NVIDIA_BASE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().default("https://integrate.api.nvidia.com/v1"),
  ),
  NVIDIA_API_KEY: optional(z.string()),
  VERDA_BASE_URL: optional(z.string()),
  VERDA_API_KEY: optional(z.string()),
  CUSTOM_LLM_BASE_URL: optional(z.string()),
  CUSTOM_LLM_API_KEY: optional(z.string()),
  ELEVENLABS_API_KEY: optional(z.string()),
  VOICE_ADAPTER: optional(z.enum(["elevenlabs", "browser", "none"])),
  LIVE_SESSION_TTL_HOURS: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().positive().default(24),
  ),
});

export type Env = Omit<z.infer<typeof schema>, "LLM_MODE"> & {
  LLM_MODE: "live" | "record" | "replay";
};

let cached: Env | undefined;

/** Parse process.env on first call, then cache. Never runs at import time. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  cached = {
    ...parsed,
    LLM_MODE: parsed.LLM_MODE ?? (parsed.NODE_ENV === "test" ? "replay" : "live"),
  };
  return cached;
}

/** Drop the cache (tests only). */
export function resetEnvCache(): void {
  cached = undefined;
}

/** Return a variable that must be set, or throw a clear error at the point of use. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getEnv()[key];
  if (value === undefined || value === null) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value as NonNullable<Env[K]>;
}
