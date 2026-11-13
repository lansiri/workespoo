// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startInterview } from "@/features/interview";
import { createTestDb, type TestDb } from "../../../../../tests/helpers/db";

const h = vi.hoisted(() => ({ db: null as unknown, talentId: undefined as string | undefined }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));
vi.mock("@/lib/session", () => ({ getSession: async () => ({ talentId: h.talentId }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("@/features/interview/InterviewRoom", () => ({ InterviewRoom: () => null }));

import InterviewPage from "./page";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(() => t.close());

const props = (id: string, search: Record<string, string>) =>
  ({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search) }) as never;
const voiceOf = (el: unknown) => (el as { props: { voiceConsented: boolean } }).props.voiceConsented;

describe("interview page voice consent", () => {
  it("ignores ?voice=1 without a recorded voice_vendor consent", async () => {
    const r = await startInterview(t.db, { mode: "express", uiLang: "en", consent: { interview: true, voiceVendor: false, liveDemo: false } });
    h.talentId = r.talentId;
    expect(voiceOf(await InterviewPage(props(r.interviewId, { voice: "1" })))).toBe(false);
  });

  it("enables voice when the consent was recorded", async () => {
    const r = await startInterview(t.db, { mode: "express", uiLang: "en", consent: { interview: true, voiceVendor: true, liveDemo: false } });
    h.talentId = r.talentId;
    expect(voiceOf(await InterviewPage(props(r.interviewId, {})))).toBe(true);
  });
});
