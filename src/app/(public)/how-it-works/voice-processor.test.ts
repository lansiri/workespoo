// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";

const stt = vi.hoisted(() => ({ sttAvailable: vi.fn() }));
vi.mock("@/features/voice/server/stt", () => stt);

import { voiceProcessor } from "./voice-processor";

function setEnv(vars: Record<string, string>) {
  for (const k of ["ELEVENLABS_API_KEY", "VOICE_ADAPTER"]) vi.stubEnv(k, vars[k] ?? "");
  resetEnvCache();
}

beforeEach(() => stt.sttAvailable.mockReset());
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("voiceProcessor", () => {
  it("is none when voice is switched off", async () => {
    setEnv({ VOICE_ADAPTER: "none" });
    stt.sttAvailable.mockResolvedValue(true);
    expect(await voiceProcessor()).toBe("none");
  });

  it("is elevenlabs when a key is set and the adapter is not browser", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k" });
    stt.sttAvailable.mockResolvedValue(true);
    expect(await voiceProcessor()).toBe("elevenlabs");
  });

  it("is server when the recogniser is available", async () => {
    setEnv({});
    stt.sttAvailable.mockResolvedValue(true);
    expect(await voiceProcessor()).toBe("server");
  });

  it("is browser when the recogniser is not available", async () => {
    setEnv({});
    stt.sttAvailable.mockResolvedValue(false);
    expect(await voiceProcessor()).toBe("browser");
  });

  it("is browser when the adapter is browser, without asking the recogniser", async () => {
    setEnv({ VOICE_ADAPTER: "browser", ELEVENLABS_API_KEY: "k" });
    stt.sttAvailable.mockResolvedValue(true);
    expect(await voiceProcessor()).toBe("browser");
    expect(stt.sttAvailable).not.toHaveBeenCalled();
  });

  it("falls back to browser when the configuration cannot be read", async () => {
    setEnv({ VOICE_ADAPTER: "not-an-adapter" });
    stt.sttAvailable.mockResolvedValue(true);
    expect(await voiceProcessor()).toBe("browser");
  });
});
