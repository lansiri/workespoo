import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { company } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";

const jar = new Map<string, string>();
const setSpy = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, options: unknown) => {
      setSpy(name, value, options);
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));

import {
  SESSION_COOKIE,
  clearSession,
  companyFromToken,
  decodeSession,
  encodeSession,
  getSession,
  requireOrganiser,
  requireTalent,
  setOrganiserSession,
  setTalentSession,
  verifyOrganiserPasscode,
} from "./session";

beforeEach(() => {
  jar.clear();
  setSpy.mockClear();
  process.env.SESSION_SECRET = "test-secret-one";
  process.env.ORGANISER_PASSCODE = "open-sesame";
  resetEnvCache();
});

describe("session cookie", () => {
  it("is empty by default", async () => {
    expect(await getSession()).toEqual({});
  });

  it("round-trips a talent session with secure cookie attributes", async () => {
    await setTalentSession("tal_abc");
    expect(await getSession()).toEqual({ talentId: "tal_abc" });
    const options = setSpy.mock.calls[0][2];
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 2_592_000, secure: false });
  });

  it("sets Secure in production", async () => {
    const prev = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCache();
    await setTalentSession("tal_abc");
    expect(setSpy.mock.calls[0][2].secure).toBe(true);
    vi.stubEnv("NODE_ENV", prev ?? "test");
    resetEnvCache();
  });

  it("holds talent and organiser at once, in either order", async () => {
    await setTalentSession("tal_abc");
    await setOrganiserSession();
    expect(await getSession()).toEqual({ talentId: "tal_abc", organiser: true });
    jar.clear();
    await setOrganiserSession();
    await setTalentSession("tal_x");
    expect(await getSession()).toEqual({ talentId: "tal_x", organiser: true });
  });

  it("clears", async () => {
    await setTalentSession("tal_abc");
    await clearSession();
    expect(await getSession()).toEqual({});
  });

  it("rejects tampering, a different secret, garbage and expiry", async () => {
    const value = encodeSession({ talentId: "tal_abc" });
    expect(decodeSession(value)).toEqual({ talentId: "tal_abc" });

    const [body, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ t: "tal_other", exp: 9_999_999_999 })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`)).toEqual({});
    const orgForged = Buffer.from(JSON.stringify({ o: 1, exp: 9_999_999_999 })).toString("base64url");
    expect(decodeSession(`${orgForged}.${sig}`)).toEqual({});
    expect(decodeSession(`${body}.${sig.slice(0, -2)}AA`)).toEqual({});
    expect(decodeSession(`${body}.`)).toEqual({});
    expect(decodeSession("garbage")).toEqual({});
    expect(decodeSession(undefined)).toEqual({});

    process.env.SESSION_SECRET = "another-secret";
    resetEnvCache();
    expect(decodeSession(value)).toEqual({});

    process.env.SESSION_SECRET = "test-secret-one";
    resetEnvCache();
    expect(decodeSession(value, Date.now() + 31 * 86_400_000)).toEqual({});
  });

  it("treats a tampered cookie in the jar as no session", async () => {
    jar.set(SESSION_COOKIE, encodeSession({ organiser: true }) + "x");
    expect(await getSession()).toEqual({});
  });
});

describe("require*", () => {
  it("requireTalent: 401 without session, 403 on mismatch, id on match", async () => {
    await expect(requireTalent()).rejects.toMatchObject({ status: 401 });
    await setTalentSession("tal_a");
    expect(await requireTalent()).toBe("tal_a");
    expect(await requireTalent("tal_a")).toBe("tal_a");
    await expect(requireTalent("tal_b")).rejects.toMatchObject({ status: 403 });
  });

  it("requireOrganiser: 401 unless organiser flag", async () => {
    await expect(requireOrganiser()).rejects.toMatchObject({ status: 401 });
    await setTalentSession("tal_a");
    await expect(requireOrganiser()).rejects.toMatchObject({ status: 401 });
    await setOrganiserSession();
    await expect(requireOrganiser()).resolves.toBeUndefined();
  });
});

describe("verifyOrganiserPasscode", () => {
  it("accepts only the exact passcode", () => {
    expect(verifyOrganiserPasscode("open-sesame")).toBe(true);
    expect(verifyOrganiserPasscode("open-sesame ")).toBe(false);
    expect(verifyOrganiserPasscode("")).toBe(false);
  });
  it("rejects everything when no passcode is configured", () => {
    delete process.env.ORGANISER_PASSCODE;
    resetEnvCache();
    expect(verifyOrganiserPasscode("")).toBe(false);
    expect(verifyOrganiserPasscode("anything")).toBe(false);
  });
});

describe("companyFromToken", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await t.db.insert(company).values({ id: "co_1", displayName: "Acme", source: "synthetic", digestToken: "tok123" });
  }, 90_000);
  afterAll(() => t.close());

  it("resolves a known token and returns null otherwise", async () => {
    expect(await companyFromToken(t.db, "tok123")).toEqual({ id: "co_1", displayName: "Acme" });
    expect(await companyFromToken(t.db, "nope")).toBeNull();
    expect(await companyFromToken(t.db, "")).toBeNull();
  });
});
