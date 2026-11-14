// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UiLang } from "@/contracts";
import { audit } from "@/lib/audit";
import { auditLog, job, llmCall } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";
import { HowItWorksView } from "./HowItWorksView";
import { howTexts, pageContent, voiceSentence, type VoiceProcessor } from "./messages";
import { loadStats, type HowStats } from "./stats";

const stats: HowStats = {
  openPostings: 12,
  modelCalls: 345,
  firstWordMedianMs: 1400,
  picksApproved: 3,
  picksRemoved: 1,
  introsAgreed: 2,
};

const render = (lang: UiLang, s: HowStats | null = stats, voice: VoiceProcessor = "browser") =>
  renderToStaticMarkup(createElement(HowItWorksView, { lang, voice, stats: s }));

describe("How this works: server speech", () => {
  it.each(["en", "fi", "sv"] as const)("says the audio goes to our own server in %s", (lang) => {
    const body = pageContent(lang, "server").sections[6].body;
    expect(body).toMatch(/WorkEspoo/);
    expect(body).toContain(voiceSentence(lang, "server"));
    expect(voiceSentence(lang, "server")).not.toBe(voiceSentence(lang, "browser"));
    expect(body).not.toMatch(/\{\w+\}/);
  });
});

describe("How this works: text", () => {
  it.each(["en", "fi", "sv"] as const)("renders every section in %s", (lang) => {
    const html = render(lang);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('data-testid="how-title"');
    const c = pageContent(lang, "browser");
    // one section per paragraph heading plus the numbers section
    expect(html.match(/data-testid="how-section"/g)).toHaveLength(c.sections.length + 1);
    expect(html.match(/<h2/g)).toHaveLength(c.sections.length + 1);
    expect(html).toContain('data-testid="how-numbers"');
    expect(html).toContain(`lang="${lang}"`);
  });

  it("no English sentence is left in the Finnish or Swedish page", () => {
    const sentences = (html: string) =>
      html
        .replace(/<[^>]+>/g, "\n")
        .split(/\n|(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30);
    const en = sentences(render("en"));
    expect(en.length).toBeGreaterThan(15);
    for (const lang of ["fi", "sv"] as const) {
      const other = render(lang);
      for (const s of en) expect(other, s).not.toContain(s);
    }
  });

  it("claims what the product does and leaves out what it does not do", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      const c = pageContent(lang, "browser");
      const body = c.sections.map((s) => s.body).join(" ");
      const data = c.sections[6].body;
      expect(data).toContain("24");
      expect(data).not.toMatch(/\{\w+\}/);
      // not built: correcting one transcribed sentence, adding a note of one's own, testing under other names
      expect(body).not.toMatch(/correct any sentence|add your own|voit korjata|lisätä omasi|rätta vilken|lägga till egna|different names|eri nimillä|olika namn/i);
      // built and claimed: the CV is used for up to two questions and not kept
      expect(data).toMatch(/two questions|kahden kysymyksen|högst två frågor/);
    }
    expect(pageContent("en", "browser").sections[6].heading).toBe("Your data");
    expect(pageContent("en", "browser").sections[6].body).toContain("download your data or delete it");
    expect(pageContent("en", "browser").sections[2].body).toContain("remove any answer");
    expect(pageContent("en", "browser").sections[3].body).toContain("change or remove any note");
    expect(pageContent("fi", "browser").sections[6].body).toContain("avoimin painoin");
    expect(pageContent("en", "browser").sections[7].heading).toBe("Limits we know about");
  });

  it("says the interviewer's voice is made on our own server where there is one", () => {
    expect(pageContent("en", "browser").sections[6].body).toContain("made on our own server");
    expect(pageContent("fi", "browser").sections[6].body).toContain("oma palvelimemme");
    expect(pageContent("sv", "browser").sections[6].body).toContain("vår egen server");
  });

  it("names the model as configured and the voice service from the voice configuration", () => {
    const en = (v: VoiceProcessor) => pageContent("en", v).sections[6].body;
    expect(en("browser")).toContain("your browser's own speech service");
    expect(en("browser")).not.toContain("ElevenLabs");
    expect(en("elevenlabs")).toContain("ElevenLabs");
    expect(en("none")).toContain("Voice is switched off");
    expect(en("browser")).toContain("an open-weight AI model (Kimi K3.1) run by Verda on servers in Finland");
    for (const lang of ["fi", "sv"] as const) {
      expect(pageContent(lang, "browser").sections[6].body).toContain("Kimi K3.1");
      expect(pageContent(lang, "browser").sections[6].body).toContain("Verda");
    }
  });
});

describe("How this works: numbers", () => {
  it("renders each number with its key, and the fixed zero", () => {
    const html = render("en");
    const keys = [...html.matchAll(/data-testid="how-number" data-key="([^"]+)"/g)].map((m) => m[1]);
    expect(keys).toEqual([
      "open-postings",
      "model-calls",
      "first-word-median",
      "picks-approved",
      "picks-removed",
      "intros-agreed",
      "decisions-without-human",
    ]);
    expect(html).toContain('data-key="decisions-without-human">0<');
    expect(html).toContain("1.4 s");
    expect(html).toContain(howTexts.en.noHumanNote);
  });

  it("leaves the numbers out but renders the rest when the database cannot be read", () => {
    const html = render("fi", null);
    expect(html).toContain('data-testid="how-title"');
    expect(html).not.toContain("how-numbers");
    expect(html).not.toContain("how-number");
    expect(html.match(/data-testid="how-section"/g)).toHaveLength(pageContent("fi", "browser").sections.length);
  });
});

describe("How this works: totals from the database", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await createTestDb();
  });
  afterEach(async () => {
    await t.close();
  });

  const NOW = new Date("2026-11-14T12:00:00Z");
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
  const call = (role: "live" | "bulk", firstTokenMs: number | null, at: Date, ok = true) => ({
    role,
    provider: "verda",
    model: "m",
    purpose: "interview.live",
    latencyMs: 100,
    firstTokenMs,
    ok,
    at,
  });
  const posting = (n: number, extra: Partial<typeof job.$inferInsert> = {}) => ({
    id: `job_${n}`,
    source: "tmt" as const,
    sourceId: `s${n}`,
    url: `https://example.test/${n}`,
    title: `Posting ${n}`,
    ...extra,
  });

  it("counts open postings, model calls, the 24 hour median and the audit actions", async () => {
    await t.db.insert(job).values([
      posting(1),
      posting(2),
      posting(3, { active: false }),
      posting(4, { expiresAt: hoursAgo(1) }),
      posting(5, { expiresAt: new Date(NOW.getTime() + 3600_000) }),
    ]);
    await t.db.insert(llmCall).values([
      call("live", 1000, hoursAgo(1)),
      call("live", 3000, hoursAgo(2)),
      call("live", 2000, hoursAgo(3)),
      call("live", 99999, hoursAgo(30)), // too old for the median
      call("live", 88888, hoursAgo(1), false), // failed
      call("bulk", 5, hoursAgo(1)), // wrong role
      { ...call("live", 70000, hoursAgo(1)), purpose: "interview.extract" }, // not a streamed reply
    ]);
    for (const [action, n] of [["pick.approved", 3], ["pick.removed", 2], ["intro.accepted", 1]] as const) {
      for (let i = 0; i < n; i++) {
        await audit(t.db, {
          actor: "organiser",
          action,
          subjectType: action === "intro.accepted" ? "intro" : "pick",
          subjectId: `${action}_${i}`,
        });
      }
    }

    const s = await loadStats(t.db, NOW);
    expect(s).toEqual({
      openPostings: 3,
      modelCalls: 7,
      firstWordMedianMs: 2000,
      picksApproved: 3,
      picksRemoved: 2,
      introsAgreed: 1,
    });
    const rows = await t.db.select().from(auditLog);
    expect(JSON.stringify(s)).not.toContain(rows[0].subjectId);
  });

  it("gives a null median when there are no live replies and zero for empty tables", async () => {
    expect(await loadStats(t.db, NOW)).toEqual({
      openPostings: 0,
      modelCalls: 0,
      firstWordMedianMs: null,
      picksApproved: 0,
      picksRemoved: 0,
      introsAgreed: 0,
    });
  });

  it("returns null instead of throwing when the query fails, and makes no model call", async () => {
    const before = (await t.db.select().from(llmCall)).length;
    const broken = { select: () => { throw new Error("db down"); } } as never;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await loadStats(broken, NOW)).toBeNull();
    expect(await loadStats(t.db, NOW)).not.toBeNull();
    expect((await t.db.select().from(llmCall)).length).toBe(before);
    warn.mockRestore();
  });
});
