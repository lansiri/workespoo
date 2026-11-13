import { beforeEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
let acceptLanguage: string | null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "ui_lang" && cookieValue !== undefined ? { name, value: cookieValue } : undefined),
  }),
  headers: async () => ({ get: (n: string) => (n === "accept-language" ? acceptLanguage : null) }),
}));

import { getUiLang } from "./server";

beforeEach(() => {
  cookieValue = undefined;
  acceptLanguage = null;
});

describe("getUiLang", () => {
  it("cookie wins over Accept-Language", async () => {
    cookieValue = "sv";
    acceptLanguage = "fi";
    expect(await getUiLang()).toBe("sv");
  });
  it("ignores an unsupported cookie", async () => {
    cookieValue = "de";
    acceptLanguage = "fi";
    expect(await getUiLang()).toBe("fi");
  });
  it("parses Accept-Language with q-values", async () => {
    acceptLanguage = "da, en;q=0.4, sv-FI;q=0.8";
    expect(await getUiLang()).toBe("sv");
  });
  it("does not map nb or da", async () => {
    acceptLanguage = "nb, da";
    expect(await getUiLang()).toBe("en");
  });
  it("defaults to en", async () => {
    expect(await getUiLang()).toBe("en");
  });
});
