import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { resetEnvCache } from "@/lib/env";
import { VoiceConfig } from "@/contracts/voice";

const mocks = vi.hoisted(() => ({
  createToken: vi.fn(),
  stream: vi.fn(),
  piperAvailable: vi.fn(() => false),
  synthesise: vi.fn(),
  getSession: vi.fn(),
  hasConsent: vi.fn(),
  transcribe: vi.fn(),
  sttAvailable: vi.fn(async () => false),
  sttUrl: vi.fn((): string | undefined => "ws://stt:6006"),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/consent", () => ({ hasConsent: mocks.hasConsent }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/features/voice/server/stt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/voice/server/stt")>()),
  transcribe: mocks.transcribe,
  sttAvailable: mocks.sttAvailable,
  sttUrl: mocks.sttUrl,
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
import { POST as postStt } from "./stt/route";
import { sttAudioBudget, sttConsentMemory } from "@/features/voice/server/config";
import { SttBusyError, SttFailedError } from "@/features/voice/server/stt";
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
  mocks.getSession.mockReset();
  mocks.hasConsent.mockReset();
  mocks.transcribe.mockReset();
  mocks.sttAvailable.mockReset();
  mocks.sttAvailable.mockResolvedValue(false);
  mocks.sttUrl.mockReturnValue("ws://stt:6006");
  sttConsentMemory.clear();
  sttAudioBudget.clear();
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

describe("GET /api/voice/config with our own recogniser", () => {
  it("is server when the recogniser answers", async () => {
    mocks.sttAvailable.mockResolvedValue(true);
    expect(VoiceConfig.parse(await (await getConfig()).json())).toEqual({
      adapter: "server",
      processor: "WorkEspoo's own server",
      tts: "browser",
    });
    mocks.piperAvailable.mockReturnValue(true);
    expect((await (await getConfig()).json()).tts).toBe("server");
  });
  it("is browser when the probe says no", async () => {
    expect((await (await getConfig()).json()).adapter).toBe("browser");
  });
  it("is browser when forced, without probing", async () => {
    mocks.sttAvailable.mockResolvedValue(true);
    setEnv({ VOICE_ADAPTER: "browser" });
    expect((await (await getConfig()).json()).adapter).toBe("browser");
    expect(mocks.sttAvailable).not.toHaveBeenCalled();
  });
});

describe("POST /api/voice/stt", () => {
  const pcmBytes = (...values: number[]) => {
    const b = new Int16Array(values);
    return new Uint8Array(b.buffer);
  };
  const sttReq = (body?: BodyInit | null, headers: Record<string, string> = {}, signal?: AbortSignal) =>
    new Request("http://x/api/voice/stt", { method: "POST", body, headers, signal });
  const talent = () => mocks.getSession.mockResolvedValue({ talentId: "tal_1" });

  beforeEach(() => {
    mocks.hasConsent.mockResolvedValue(true);
    mocks.transcribe.mockResolvedValue("hello");
  });

  it("is 401 without a session", async () => {
    mocks.getSession.mockResolvedValue({});
    const res = await postStt(sttReq(pcmBytes(1, 2)));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("is 403 without consent, and asks again next time", async () => {
    talent();
    mocks.hasConsent.mockResolvedValue(false);
    const res = await postStt(sttReq(pcmBytes(1, 2)));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "voice_consent_missing" });
    await postStt(sttReq(pcmBytes(1, 2)));
    expect(mocks.hasConsent).toHaveBeenCalledTimes(2);
  });

  it("remembers a yes", async () => {
    talent();
    expect((await postStt(sttReq(pcmBytes(1, 2)))).status).toBe(200);
    expect((await postStt(sttReq(pcmBytes(1, 2)))).status).toBe(200);
    expect(mocks.hasConsent).toHaveBeenCalledTimes(1);
  });

  it("is 503 with the adapter off or no URL", async () => {
    talent();
    setEnv({ VOICE_ADAPTER: "none" });
    expect((await postStt(sttReq(pcmBytes(1, 2)))).status).toBe(503);
    setEnv({});
    mocks.sttUrl.mockReturnValue(undefined);
    const res = await postStt(sttReq(pcmBytes(1, 2)));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "voice_unavailable" });
  });

  it("lets an organiser in without a consent lookup", async () => {
    mocks.getSession.mockResolvedValue({ organiser: true });
    const res = await postStt(sttReq(pcmBytes(1, 2)));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ text: "hello" });
    expect(mocks.hasConsent).not.toHaveBeenCalled();
  });

  it("hands the exact samples to the recogniser, little-endian", async () => {
    talent();
    const bytes = new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0x01, 0x00]);
    await postStt(sttReq(bytes));
    const [samples, opts] = mocks.transcribe.mock.calls[0];
    expect(samples).toBeInstanceOf(Int16Array);
    expect([...samples]).toEqual([-32768, 32767, 1]);
    expect(opts.signal).toBeDefined();
  });

  it("rejects empty and odd bodies with 400", async () => {
    talent();
    expect((await postStt(sttReq(new Uint8Array(0)))).status).toBe(400);
    expect((await postStt(sttReq(new Uint8Array(3)))).status).toBe(400);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("is 413 for a declared length over the cap, without reading", async () => {
    talent();
    const req = sttReq(pcmBytes(1, 2), { "content-length": String(30 * 16000 * 2 + 1) });
    const res = await postStt(req);
    expect(res.status).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it("is 413 for a stream over the cap whatever the headers say", async () => {
    talent();
    const res = await postStt(sttReq(new Uint8Array(30 * 16000 * 2 + 2), { "content-length": "4" }));
    expect(res.status).toBe(413);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("limits audio per caller and not across callers", async () => {
    const twenty = new Uint8Array(20 * 16000 * 2);
    talent();
    for (let i = 0; i < 4; i++) expect((await postStt(sttReq(twenty))).status).toBe(200);
    const limited = await postStt(sttReq(twenty));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "voice_rate_limited" });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    mocks.getSession.mockResolvedValue({ talentId: "tal_2" });
    expect((await postStt(sttReq(twenty))).status).toBe(200);
  });

  it("maps busy, abort and other failures", async () => {
    talent();
    mocks.transcribe.mockRejectedValueOnce(new SttBusyError());
    const busy = await postStt(sttReq(pcmBytes(1, 2)));
    expect(busy.status).toBe(429);
    expect(busy.headers.get("retry-after")).toBe("1");
    expect(await busy.json()).toEqual({ error: "voice_busy" });

    const abort = new Error("aborted");
    abort.name = "AbortError";
    mocks.transcribe.mockRejectedValueOnce(abort);
    expect((await postStt(sttReq(pcmBytes(1, 2)))).status).toBe(499);

    mocks.transcribe.mockRejectedValueOnce(new SttFailedError("secret words"));
    const failed = await postStt(sttReq(pcmBytes(1, 2)));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "voice_upstream_failed" });
  });
});
