import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { resetEnvCache } from "@/lib/env";
import { VoiceConfig } from "@/contracts/voice";

const mocks = vi.hoisted(() => ({
  createToken: vi.fn(),
  stream: vi.fn(),
  piperAvailable: vi.fn(() => false),
  synthesise: vi.fn(),
}));

vi.mock("@/features/voice/server/piper", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/voice/server/piper")>()),
  piperAvailable: mocks.piperAvailable,
  synthesise: mocks.synthesise,
}));

vi.mock("@/features/voice/server/client", () => ({
  createElevenLabsClient: () => ({
    tokens: { singleUse: { create: mocks.createToken } },
    textToSpeech: { stream: mocks.stream },
  }),
}));

import { GET as getConfig } from "./config/route";
import { POST as postToken } from "./token/route";
import { POST as postTts } from "./tts/route";
import { ttsLimiter } from "@/features/voice/server/limiter";
import { PiperBusyError, PiperFailedError, wavFile } from "@/features/voice/server/piper";

function setEnv(vars: Record<string, string>) {
  for (const k of [
    "ELEVENLABS_API_KEY",
    "VOICE_ADAPTER",
    "ELEVENLABS_VOICE_ID",
    "ELEVENLABS_TTS_MODEL",
    "ELEVENLABS_STT_MODEL",
  ]) {
    vi.stubEnv(k, vars[k] ?? "");
  }
  resetEnvCache();
}

const ttsReq = (body: unknown) =>
  new Request("http://x/api/voice/tts", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function audioStream(chunks: number[][]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new Uint8Array(ch));
      c.close();
    },
  });
}

beforeEach(() => {
  mocks.createToken.mockReset();
  mocks.stream.mockReset();
  mocks.synthesise.mockReset();
  mocks.piperAvailable.mockReset();
  mocks.piperAvailable.mockReturnValue(false);
  setEnv({});
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("GET /api/voice/config", () => {
  it("is browser with no key", async () => {
    const body = await (await getConfig()).json();
    expect(body.adapter).toBe("browser");
    expect(typeof body.processor).toBe("string");
  });
  it("is elevenlabs with a key", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k" });
    expect(await (await getConfig()).json()).toEqual({
      adapter: "elevenlabs",
      processor: "ElevenLabs",
    });
  });
  it("respects VOICE_ADAPTER=browser even with a key", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k", VOICE_ADAPTER: "browser" });
    expect((await (await getConfig()).json()).adapter).toBe("browser");
  });
  it("is none when VOICE_ADAPTER=none", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k", VOICE_ADAPTER: "none" });
    expect((await (await getConfig()).json()).adapter).toBe("none");
  });
  it("says the browser speaks when Piper is missing", async () => {
    const body = VoiceConfig.parse(await (await getConfig()).json());
    expect(body).toEqual({
      adapter: "browser",
      processor: "your browser's speech service",
      tts: "browser",
    });
  });
  it("says our server speaks when Piper is present and there is no key", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    const body = VoiceConfig.parse(await (await getConfig()).json());
    expect(body).toEqual({
      adapter: "browser",
      processor: "your browser's speech service",
      tts: "server",
    });
  });
  it("keeps ElevenLabs when its key is set, even with Piper present", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    setEnv({ ELEVENLABS_API_KEY: "k" });
    expect(await (await getConfig()).json()).toEqual({
      adapter: "elevenlabs",
      processor: "ElevenLabs",
    });
  });
  it("does not offer server speech with VOICE_ADAPTER=browser and a key", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    setEnv({ ELEVENLABS_API_KEY: "k", VOICE_ADAPTER: "browser" });
    expect((await (await getConfig()).json()).tts).toBe("browser");
  });
  it("is none with VOICE_ADAPTER=none even with Piper present", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    setEnv({ VOICE_ADAPTER: "none" });
    expect(await (await getConfig()).json()).toEqual({ adapter: "none", processor: "none" });
  });
});

describe("POST /api/voice/token", () => {
  it("is 503 without a key", async () => {
    const res = await postToken();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "voice_unavailable" });
  });
  it("passes the minted token through", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k", ELEVENLABS_STT_MODEL: "scribe_v2_realtime" });
    mocks.createToken.mockResolvedValue({ token: "tok_123" });
    const res = await postToken();
    expect(res.status).toBe(200);
    expect(mocks.createToken).toHaveBeenCalledWith("realtime_scribe");
    expect(await res.json()).toMatchObject({
      token: "tok_123",
      expiresInSeconds: 900,
      modelId: "scribe_v2_realtime",
    });
  });
  it("maps an upstream failure to a safe 502", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k" });
    mocks.createToken.mockRejectedValue(new Error("secret detail xi-api-key"));
    const res = await postToken();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

describe("POST /api/voice/tts", () => {
  it("is 503 without a key", async () => {
    expect((await postTts(ttsReq({ text: "hi", lang: "en" }))).status).toBe(503);
  });

  it("rejects an invalid body with 400", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k" });
    expect((await postTts(ttsReq({ text: "", lang: "en" }))).status).toBe(400);
    expect((await postTts(ttsReq({ text: "x".repeat(601), lang: "en" }))).status).toBe(400);
    expect((await postTts(ttsReq("not json"))).status).toBe(400);
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("streams the audio bytes with an audio content type", async () => {
    setEnv({
      ELEVENLABS_API_KEY: "k",
      ELEVENLABS_VOICE_ID: "voice1",
      ELEVENLABS_TTS_MODEL: "eleven_flash_v2_5",
    });
    mocks.stream.mockResolvedValue(audioStream([[1, 2], [3]]));
    const res = await postTts(ttsReq({ text: "Hello there.", lang: "en" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(mocks.stream).toHaveBeenCalledWith(
      "voice1",
      expect.objectContaining({ text: "Hello there.", modelId: "eleven_flash_v2_5" }),
      expect.anything(),
    );
    expect(ttsLimiter.inFlight).toBe(0);
  });

  it("defaults the model to eleven_flash_v2_5", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k" });
    mocks.stream.mockResolvedValue(audioStream([[1]]));
    await (await postTts(ttsReq({ text: "Hi.", lang: "fi" }))).arrayBuffer();
    expect(mocks.stream.mock.calls[0][1].modelId).toBe("eleven_flash_v2_5");
  });

  it("maps upstream failures to safe JSON errors and frees the slot", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k" });
    mocks.stream.mockRejectedValueOnce(
      new ElevenLabsError({ message: "bad key abc", statusCode: 401 }),
    );
    let res = await postTts(ttsReq({ text: "Hi.", lang: "en" }));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("abc");

    mocks.stream.mockRejectedValueOnce(
      new ElevenLabsError({ message: "slow down", statusCode: 429 }),
    );
    res = await postTts(ttsReq({ text: "Hi.", lang: "en" }));
    expect(res.status).toBe(429);

    mocks.stream.mockRejectedValueOnce(new Error("socket hang up"));
    res = await postTts(ttsReq({ text: "Hi.", lang: "en" }));
    expect(res.status).toBe(502);
    expect(ttsLimiter.inFlight).toBe(0);
  });

  it("answers 429 when too many requests are in flight", async () => {
    setEnv({ ELEVENLABS_API_KEY: "k" });
    const held = [];
    for (let i = 0; i < 50; i += 1) {
      const r = ttsLimiter.tryAcquire();
      if (!r) break;
      held.push(r);
    }
    const res = await postTts(ttsReq({ text: "Hi.", lang: "en" }));
    expect(res.status).toBe(429);
    expect(mocks.stream).not.toHaveBeenCalled();
    held.forEach((r) => r());
  });
});

describe("POST /api/voice/tts with Piper", () => {
  it("is 503 with neither a key nor Piper", async () => {
    expect((await postTts(ttsReq({ text: "hi", lang: "en" }))).status).toBe(503);
    expect(mocks.synthesise).not.toHaveBeenCalled();
  });

  it("uses ElevenLabs, not Piper, when the key is set", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    setEnv({ ELEVENLABS_API_KEY: "k" });
    mocks.stream.mockResolvedValue(audioStream([[1]]));
    const res = await postTts(ttsReq({ text: "Hi.", lang: "en" }));
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    await res.arrayBuffer();
    expect(mocks.synthesise).not.toHaveBeenCalled();
  });

  it("answers with Piper's WAV when there is no key", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    const wav = wavFile(Buffer.from([1, 0, 2, 0]), 22050);
    mocks.synthesise.mockResolvedValue(wav);
    const res = await postTts(ttsReq({ text: "Hei vaan.", lang: "fi" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await res.arrayBuffer()).equals(wav)).toBe(true);
    expect(mocks.synthesise).toHaveBeenCalledWith("Hei vaan.", "fi", expect.any(AbortSignal));
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("validates the body before synthesising", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    expect((await postTts(ttsReq({ text: "", lang: "en" }))).status).toBe(400);
    expect(mocks.synthesise).not.toHaveBeenCalled();
  });

  it("is 503 with VOICE_ADAPTER=none", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    setEnv({ VOICE_ADAPTER: "none" });
    expect((await postTts(ttsReq({ text: "Hi.", lang: "en" }))).status).toBe(503);
  });

  it("gives 429 when Piper is busy and a safe 502 when it fails", async () => {
    mocks.piperAvailable.mockReturnValue(true);
    mocks.synthesise.mockRejectedValueOnce(new PiperBusyError());
    let res = await postTts(ttsReq({ text: "Hi.", lang: "en" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "voice_busy" });

    mocks.synthesise.mockRejectedValueOnce(new PiperFailedError("Speech process stopped"));
    res = await postTts(ttsReq({ text: "Hi.", lang: "en" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "voice_upstream_failed" });
  });
});
