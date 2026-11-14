/** The live skill-label step: a note gets a looser, model-chosen ESCO label during the interview. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { InterviewEvent } from "@/contracts";
import { escoConcept, interviewEvent, job, jobSkill, signal } from "@/db/schema";
import { resetLlmState, setLlmFake, type LlmOptions } from "@/lib/llm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { runExtraction } from "./extractor";
import { removeAnswer, settleInterview, startInterview, stopInterview, submitTurn } from "./index";
import { loadInterview, mutateState, readState } from "./store";

const synth = vi.hoisted(() => vi.fn());
vi.mock("@/features/card", () => ({ synthesiseCard: (...args: unknown[]) => synth(...args) }));

let t: TestDb;
const URI = "http://data.europa.eu/esco/skill/labels-pallet";
beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(escoConcept).values({ uri: URI, type: "skill", labelEn: "Pallet checking procedures", labelFi: "Lavojen tarkistus" });
  await t.db.insert(job).values({
    id: "job_lbl_1", source: "tmt", sourceId: "lbl1", url: "https://x.example/lbl1", title: "Warehouse worker", employerName: "Acme",
    municipality: "Espoo", municipalityCode: "049",
  });
  await t.db.insert(jobSkill).values({ jobId: "job_lbl_1", skillUri: URI, origin: "posting" });
}, 120_000);
afterAll(() => t.close());
beforeEach(() => {
  synth.mockReset();
  synth.mockResolvedValue({ talentId: "x", version: 1, fallback: false });
});
afterEach(() => resetLlmState());

type Sig = { phrase: string };
type Fake = {
  extract: (n: number) => Sig[] | Promise<Sig[]>;
  pick?: (o: LlmOptions) => object | Promise<object>;
};
const calls = { extract: 0, pick: [] as LlmOptions[] };

function install(f: Fake) {
  calls.extract = 0;
  calls.pick = [];
  setLlmFake(async (o) => {
    if (o.purpose === "interview.extract") {
      calls.extract++;
      const labels = [...o.messages[1]!.content.matchAll(/\[T(\d+)\.S1\]/g)];
      const turnIndex = labels.at(-1)?.[1] ?? "1";
      const signals = await f.extract(calls.extract);
      return {
        lang: "en",
        signals: signals.map((s) => ({ ref: "new", phrase: s.phrase, kind: "skill", evidence: [`T${turnIndex}.S1`], hasExample: false })),
        coverage: {},
        flags: [],
        note: "",
      };
    }
    if (o.purpose === "interview.esco_pick") {
      calls.pick.push(o);
      if (!f.pick) throw new Error("no pick fake");
      return f.pick(o);
    }
    if (o.purpose === "interview.live") return "Okay. Could you describe a typical day in that work?";
    return { seeds: [] };
  });
}

const PHRASE = "Pallet checks on arrival"; // no near-exact ESCO label, a candidate for the model
const ANSWER = "I worked at a logistics centre in Vantaa and mostly received goods.";
async function say(id: string, text = ANSWER) {
  for await (const e of submitTurn(t.db, id, { text, inputMode: "text" }, {})) void e;
}
const start = async () => (await startInterview(t.db, { mode: "express", uiLang: "en", consent: { interview: true, voiceVendor: false, liveDemo: false } })).interviewId;
const rowsOf = (id: string) => t.db.select().from(signal).where(eq(signal.interviewId, id)).orderBy(asc(signal.id));
const eventsOf = async (id: string) =>
  (await t.db.select().from(interviewEvent).where(eq(interviewEvent.interviewId, id)).orderBy(asc(interviewEvent.id))).map((r) => r.payload as InterviewEvent);
type Lit = Extract<InterviewEvent, { type: "jobs.lit" }>;
const litOf = async (id: string) => (await eventsOf(id)).filter((e): e is Lit => e.type === "jobs.lit");
const pickFirst = (o: LlmOptions) => {
  const n = o.messages[1]!.content.split("\n").findIndex((l) => l.startsWith("i=0"));
  const lines = o.messages[1]!.content.split("\n");
  const at = lines.slice(n + 1).findIndex((l) => l.includes("Pallet checking procedures"));
  return { picks: [{ i: 0, choice: at + 1 }] };
};

describe("live skill labels", () => {
  it("gives a note the picked label, publishes signal.updated and a second jobs.lit from the linked posting", async () => {
    install({ extract: () => [{ phrase: PHRASE }], pick: pickFirst });
    const id = await start();
    await say(id);
    await settleInterview(t.db, id);
    expect(calls.pick).toHaveLength(1);
    expect(calls.pick[0]).toMatchObject({ role: "analyst", purpose: "interview.esco_pick", deadlineMs: 10_000 });
    expect(calls.pick[0]!.messages.map((m) => m.content).join("\n")).not.toContain("logistics centre");
    const [row] = await rowsOf(id);
    expect(row).toMatchObject({ phrase: PHRASE, escoUri: URI, escoLabelEn: "Pallet checking procedures", escoLabelFi: "Lavojen tarkistus", status: "proposed" });
    const events = await eventsOf(id);
    const updated = events.find((e) => e.type === "signal.updated") as Extract<InterviewEvent, { type: "signal.updated" }>;
    expect(updated.signal).toMatchObject({ id: row!.id, esco: { uri: URI }, status: "proposed" });
    const lit = await litOf(id);
    expect(lit.map((l) => l.count)).toEqual([0, 1]);
    const order = events.map((e) => e.type);
    expect(order.indexOf("jobs.lit")).toBeLessThan(order.indexOf("signal.updated"));
  });

  it("a pick of none writes nothing, publishes no second jobs.lit, and the note is not asked about again", async () => {
    install({ extract: (n) => [{ phrase: n === 1 ? PHRASE : "Pallet checking on delivery" }], pick: () => ({ picks: [{ i: 0, choice: 0 }] }) });
    const id = await start();
    await say(id);
    await settleInterview(t.db, id);
    expect(calls.pick).toHaveLength(1);
    expect((await rowsOf(id))[0]!.escoUri).toBeNull();
    expect(await litOf(id)).toHaveLength(1);
    expect((await eventsOf(id)).filter((e) => e.type === "signal.updated")).toHaveLength(0);
    await say(id);
    await settleInterview(t.db, id);
    expect(calls.pick).toHaveLength(2); // only the new note, not the first one
    expect(calls.pick[1]!.messages[1]!.content).not.toContain(PHRASE);
    expect(readState((await loadInterview(t.db, id))!).escoAsked).toHaveLength(2);
  });

  it.each([
    ["fails", () => { throw new Error("boom"); }],
    ["is late", () => { throw new Error("The 10000 ms deadline for this analyst call passed"); }],
  ])("a call that %s changes nothing and the note is not asked again", async (_name, pick) => {
    install({ extract: (n) => (n === 1 ? [{ phrase: PHRASE }] : []), pick });
    const id = await start();
    await say(id);
    await settleInterview(t.db, id);
    expect(calls.pick).toHaveLength(1);
    expect((await rowsOf(id))[0]!.escoUri).toBeNull();
    expect(await litOf(id)).toHaveLength(1);
    await say(id);
    await settleInterview(t.db, id);
    expect(calls.pick).toHaveLength(1);
  });

  it("leaves out notes that already have a label, and makes no call when none is left", async () => {
    install({ extract: () => [{ phrase: "Pallet checking procedures" }], pick: pickFirst });
    const id = await start();
    await say(id);
    await settleInterview(t.db, id);
    expect((await rowsOf(id))[0]!.escoUri).toBe(URI); // exact label from the strict match
    expect(calls.pick).toHaveLength(0);
    // a new note next to a labelled one: only the new one is sent
    install({ extract: () => [{ phrase: PHRASE }], pick: pickFirst });
    await say(id);
    await settleInterview(t.db, id);
    expect(calls.pick).toHaveLength(1);
    expect(calls.pick[0]!.messages[1]!.content).toContain(PHRASE);
    expect(calls.pick[0]!.messages[1]!.content).not.toContain("phrase: Pallet checking procedures");
  });

  it("one call covers several new notes", async () => {
    install({
      extract: () => [{ phrase: PHRASE }, { phrase: "Checking pallet deliveries" }, { phrase: "Pallet checking on delivery" }],
      pick: () => ({ picks: [] }),
    });
    const id = await start();
    await say(id);
    await settleInterview(t.db, id);
    expect(calls.pick).toHaveLength(1);
    const text = calls.pick[0]!.messages[1]!.content;
    expect(text).toContain("i=0 |");
    expect(text).toContain("i=1 |");
    expect(text).toContain("i=2 |");
  });

  it("makes no call once the interview is closing", async () => {
    install({ extract: (n) => (n === 1 ? [] : [{ phrase: PHRASE }]), pick: pickFirst });
    const id = await start();
    await say(id);
    await settleInterview(t.db, id);
    await mutateState(t.db, id, (st) => ({ ...st, stage: "closing" }));
    await runExtraction(t.db, id, 1); // a late extraction of the first answer, with the interview closing
    await settleInterview(t.db, id);
    expect(calls.extract).toBe(2);
    expect((await rowsOf(id))).toHaveLength(1);
    expect(calls.pick).toHaveLength(0);
  });

  it("finishing does not wait for a label call that is still running, and a late label is dropped", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    install({
      extract: () => [{ phrase: PHRASE }],
      pick: async (o) => {
        await gate;
        return pickFirst(o);
      },
    });
    const id = await start();
    await say(id);
    await vi.waitFor(() => expect(calls.pick).toHaveLength(1));
    await stopInterview(t.db, id);
    await vi.waitFor(() => expect(synth).toHaveBeenCalledTimes(1)); // synthesis started with the label call still running
    release();
    await settleInterview(t.db, id);
    expect((await rowsOf(id))[0]!.escoUri).toBeNull();
    expect(await litOf(id)).toHaveLength(1);
  });

  it("a label that is racing the closing line never publishes after it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    install({
      extract: () => [{ phrase: PHRASE }],
      pick: async (o) => {
        await gate;
        return pickFirst(o);
      },
    });
    const id = await start();
    await say(id);
    await vi.waitFor(() => expect(calls.pick).toHaveLength(1));
    release();
    await stopInterview(t.db, id);
    await settleInterview(t.db, id);
    const events = await eventsOf(id);
    const closeAt = events.findIndex((e) => e.type === "turn.done" && e.closing);
    expect(closeAt).toBeGreaterThanOrEqual(0);
    const after = events.slice(closeAt + 1).filter((e) => e.type === "jobs.lit" || e.type === "signal.updated");
    expect(after).toHaveLength(0);
  });

  it("a note whose answer was removed while the call ran gets no label", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    install({
      extract: () => [{ phrase: PHRASE }],
      pick: async (o) => {
        await gate;
        return pickFirst(o);
      },
    });
    const id = await start();
    await say(id);
    await vi.waitFor(() => expect(calls.pick).toHaveLength(1));
    await removeAnswer(t.db, id, 1);
    release();
    await settleInterview(t.db, id);
    const [row] = await rowsOf(id);
    expect(row).toMatchObject({ status: "removed", escoUri: null });
    expect(await litOf(id)).toHaveLength(1);
    expect((await eventsOf(id)).filter((e) => e.type === "signal.updated" && e.signal.esco)).toHaveLength(0);
  });
});
