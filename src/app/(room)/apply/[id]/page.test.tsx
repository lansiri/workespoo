// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationStatus } from "@/contracts";

const h = vi.hoisted(() => ({
  talentId: undefined as string | undefined,
  application: null as unknown,
  job: null as unknown,
  voice: null as string | null,
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/session", () => ({ getSession: async () => ({ talentId: h.talentId }) }));
vi.mock("@/lib/consent", async (orig) => ({ ...(await orig<typeof import("@/lib/consent")>()), activeConsentTextVersion: async () => h.voice }));
vi.mock("@/features/application", () => ({
  loadOwnApplication: async () => h.application,
  getApplyJob: async () => h.job,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/components/site/SiteShell", () => ({ SiteShell: () => null }));

import { ApplicationGone } from "@/features/application/ui/ApplyJobsView";
import { ApplyStart } from "@/features/application/ui/ApplyStart";
import { ApplicationResult } from "@/features/application/ui/ApplicationResult";
import { ApplicationReview, ApplicationSent } from "@/features/application/ui/ApplicationReview";
import { JobInterviewRoom, JobRoomChromeProvider } from "@/features/application/ui/JobInterviewRoom";
import ApplicationPage from "./page";

const props = (id: string, search: Record<string, string> = {}) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search) }) as never;

type El = { type: unknown; props: { children?: El | El[]; [k: string]: unknown } };
/** The page's element is `<SiteShell>{view}</SiteShell>`, or the room's provider around the shell. */
const viewOf = (el: unknown): El => {
  const root = el as El;
  const shell = root.type === JobRoomChromeProvider ? (root.props.children as El) : root;
  return shell.props.children as El;
};

const own = (status: ApplicationStatus) => ({
  id: "app-1",
  jobId: "job-1",
  companyName: "Demo company 03",
  masked: true,
  title: "Warehouse worker",
  status,
  plan: { needCardId: "n", needCardVersion: 1, lang: "en", requirements: [{ requirementId: "r1" }] },
  state: { cursor: 0, followUps: {}, progress: {}, noted: {} },
  turns: [],
  assessment: null,
  points: null,
  position: null,
  createdAt: "2026-11-14T10:00:00Z",
  submittedAt: null,
});

beforeEach(() => {
  h.talentId = "tal-1";
  h.application = null;
  h.job = null;
  h.voice = null;
});

describe("the application page chooses its view by status", () => {
  it.each([
    ["interviewing", JobInterviewRoom],
    ["review", ApplicationReview],
    ["submitted", ApplicationSent],
    ["assessed", ApplicationResult],
  ] as const)("%s", async (status, view) => {
    h.application = own(status);
    expect(viewOf(await ApplicationPage(props("app-1"))).type).toBe(view);
  });

  it("the room gets the voice consent from the record, never from the URL", async () => {
    h.application = own("interviewing");
    const off = viewOf(await ApplicationPage(props("app-1", { voice: "1" })));
    expect(off.props.voiceConsented).toBe(false);
    h.voice = "2026-11-v2";
    const on = viewOf(await ApplicationPage(props("app-1")));
    expect(on.props.voiceConsented).toBe(true);
    expect(on.props.voiceOwnServer).toBe(false);
  });

  it("an application that is gone or not theirs gets the neutral page", async () => {
    h.application = null;
    expect(viewOf(await ApplicationPage(props("app-9"))).type).toBe(ApplicationGone);
  });

  it("signed out goes to the interview", async () => {
    h.talentId = undefined;
    await expect(ApplicationPage(props("app-1"))).rejects.toThrow("redirect:/interview");
  });
});

describe("/apply/new", () => {
  const job = { jobId: "job-1", title: "Warehouse worker", companyName: "Demo company 03", masked: true, summary: "", requirements: [], application: null };

  it("shows the start screen for a job the person can apply to", async () => {
    h.job = job;
    const view = viewOf(await ApplicationPage(props("new", { job: "job-1" })));
    expect(view.type).toBe(ApplyStart);
    expect((view.props.job as { jobId: string }).jobId).toBe("job-1");
  });

  it("gives the start screen only what it needs, nothing that could name an employer", async () => {
    h.job = { ...job, realEmployer: "Real Oy" };
    const view = viewOf(await ApplicationPage(props("new", { job: "job-1" })));
    expect(Object.keys(view.props.job as object).sort()).toEqual(["companyName", "jobId", "masked", "requirements", "title"]);
  });

  it("goes on to the application that already exists", async () => {
    h.job = { ...job, application: { id: "app-7", status: "review" } };
    await expect(ApplicationPage(props("new", { job: "job-1" }))).rejects.toThrow("redirect:/apply/app-7");
  });

  it("an unknown or missing job gets the neutral page", async () => {
    h.job = null;
    expect(viewOf(await ApplicationPage(props("new", { job: "nope" }))).type).toBe(ApplicationGone);
    expect(viewOf(await ApplicationPage(props("new"))).type).toBe(ApplicationGone);
  });
});
