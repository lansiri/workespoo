import { beforeEach, describe, expect, it } from "vitest";
import { getExtraBody, getJsonMode, getRoleEntries, parseRoleList, nvidiaMaxRpm, maxConcurrency } from "./config";
import { llmConfigured, resetLlmState, setLlmFake } from "./index";
import { setEnv } from "./testkit";

beforeEach(() => {
  resetLlmState();
  setEnv();
});

describe("parseRoleList", () => {
  it("splits on the first colon only and keeps / and : in model ids", () => {
    expect(parseRoleList("nvidia:nvidia/nemotron-3.5-lightning-30b-a3b, verda:moonshotai/Kimi-K3:thinking")).toEqual([
      { provider: "nvidia", model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
      { provider: "verda", model: "moonshotai/Kimi-K3:thinking" },
    ]);
  });
  it("drops unknown providers and malformed items", () => {
    expect(parseRoleList("bogus:x,nvidia:,:m,nomodel,custom:m")).toEqual([{ provider: "custom", model: "m" }]);
    expect(parseRoleList(undefined)).toEqual([]);
  });
});

describe("role entries and llmConfigured", () => {
  it("skips providers without a key (and verda without a base URL)", () => {
    setEnv({ LLM_LIVE: "nvidia:a,verda:b,custom:c", CUSTOM_LLM_BASE_URL: "http://x/v1", CUSTOM_LLM_API_KEY: "k" });
    expect(getRoleEntries("live")).toEqual([{ provider: "custom", model: "c" }]);
    setEnv({ LLM_LIVE: "nvidia:a,verda:b", NVIDIA_API_KEY: "k", VERDA_API_KEY: "k2" });
    expect(getRoleEntries("live")).toEqual([{ provider: "nvidia", model: "a" }]);
    setEnv({ LLM_LIVE: "nvidia:a,verda:b", NVIDIA_API_KEY: "k", VERDA_API_KEY: "k2", VERDA_BASE_URL: "http://v/v1" });
    expect(getRoleEntries("live").map((e) => e.provider)).toEqual(["nvidia", "verda"]);
  });
  it("llmConfigured is true only with a keyed provider (or a fake)", () => {
    expect(llmConfigured("live")).toBe(false);
    setEnv({ LLM_LIVE: "nvidia:a" });
    expect(llmConfigured("live")).toBe(false);
    setEnv({ LLM_LIVE: "nvidia:a", NVIDIA_API_KEY: "k" });
    expect(llmConfigured("live")).toBe(true);
    expect(llmConfigured("analyst")).toBe(false);
    setEnv();
    setLlmFake(() => "x");
    expect(llmConfigured("bulk")).toBe(true);
  });
});

describe("other settings", () => {
  it("merges extra body shared plus per provider and ignores bad JSON", () => {
    setEnv({ LLM_EXTRA_BODY_LIVE: '{"a":1,"by_provider":{"nvidia":{"b":2}}}' });
    expect(getExtraBody("live", "nvidia")).toEqual({ a: 1, b: 2 });
    expect(getExtraBody("live", "verda")).toEqual({ a: 1 });
    expect(getExtraBody("bulk", "nvidia")).toEqual({});
    setEnv({ LLM_EXTRA_BODY_LIVE: "{nope" });
    expect(getExtraBody("live", "nvidia")).toEqual({});
  });
  it("has the documented defaults", () => {
    expect(getJsonMode()).toBe("json_object");
    expect(nvidiaMaxRpm()).toBe(30);
    expect(maxConcurrency()).toBe(8);
    setEnv({ LLM_JSON_MODE: "json_schema", NVIDIA_MAX_RPM: "5", LLM_MAX_CONCURRENCY: "2" });
    expect([getJsonMode(), nvidiaMaxRpm(), maxConcurrency()]).toEqual(["json_schema", 5, 2]);
    setEnv({ LLM_JSON_MODE: "garbage" });
    expect(getJsonMode()).toBe("json_object");
  });
});
