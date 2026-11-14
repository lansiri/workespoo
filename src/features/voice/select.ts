import type { VoiceConfig } from "@/contracts/voice";

/** The adapters this build can actually run. `http` in the contract has no implementation yet. */
export type RunnableAdapterId = "elevenlabs" | "browser" | "server";
export type AdapterOverride = "auto" | RunnableAdapterId;

/**
 * Decide which adapter to use, or null when voice is off (text only).
 * - `none` from the server always wins: voice is disabled for this deployment.
 * - `only` names the one way of handling speech this person agreed to (the own-server consent
 *   wording gives `server`). The answer is then that adapter or nothing, never another one: if
 *   our recogniser is down, speaking fails and the person types, and the audio goes nowhere else.
 * - A manual override (test page) wins over the server's choice.
 * - An adapter id we have not built (`http`) falls back to the browser engine.
 */
export function selectAdapterId(
  config: VoiceConfig | null,
  override: AdapterOverride = "auto",
  only?: RunnableAdapterId,
): RunnableAdapterId | null {
  if (!config) return null;
  if (config.adapter === "none") return null;
  if (only) return only;
  if (override !== "auto") return override;
  if (config.adapter === "elevenlabs") return "elevenlabs";
  return config.adapter === "server" ? "server" : "browser";
}
