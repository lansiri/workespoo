import type { VoiceConfig } from "@/contracts/voice";

/** The adapters this build can actually run. `http` in the contract has no implementation yet. */
export type RunnableAdapterId = "elevenlabs" | "browser";
export type AdapterOverride = "auto" | RunnableAdapterId;

/**
 * Decide which adapter to use, or null when voice is off (text only).
 * - `none` from the server always wins: voice is disabled for this deployment.
 * - A manual override (test page) wins over the server's choice.
 * - An adapter id we have not built (`http`) falls back to the browser engine.
 */
export function selectAdapterId(
  config: VoiceConfig | null,
  override: AdapterOverride = "auto",
): RunnableAdapterId | null {
  if (!config) return null;
  if (config.adapter === "none") return null;
  if (override !== "auto") return override;
  return config.adapter === "elevenlabs" ? "elevenlabs" : "browser";
}
