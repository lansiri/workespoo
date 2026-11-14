import { describe, expect, it, vi } from "vitest";
import { CvUploadResponse } from "@/contracts";

const h = vi.hoisted(() => ({ result: null as unknown, calls: 0 }));
vi.mock("@/features/interview/cv-pdf", async (orig) => {
  const real = await orig<typeof import("@/features/interview/cv-pdf")>();
  return {
    ...real,
    readCvPdf: async () => {
      h.calls += 1;
      return h.result;
    },
  };
});

import { POST } from "./route";

const PDF = new TextEncoder().encode("%PDF-1.4");
let nextClient = 0;
/** Each request comes from a new client address unless the test names one. */
function upload(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/interview/cv", {
    method: "POST",
    body,
    headers: { "content-type": "application/pdf", "x-forwarded-for": `10.0.0.${++nextClient}`, ...headers },
  });
}

describe("POST /api/interview/cv", () => {
  it("returns the anonymised text and the counts, never cached", async () => {
    h.result = {
      ok: true,
      text: "WORK EXPERIENCE\nDrove forklifts.",
      removed: { name: 1, contact: 2, id: 0, date: 1, personal: 0, section: 0, protected: 0, country: 0 },
    };
    const res = await POST(upload(new Uint8Array([37, 80, 68, 70, 45])));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = CvUploadResponse.parse(await res.json());
    expect(body.text).toContain("Drove forklifts.");
    expect(body.removed.name).toBe(1);
  });

  it("refuses a body over 2 MB without reading it into the parser", async () => {
    const before = h.calls;
    const res = await POST(upload(new Uint8Array(2 * 1024 * 1024 + 10)));
    expect(res.status).toBe(413);
    expect(h.calls).toBe(before);
  });

  it.each([
    ["not_pdf", 415],
    ["no_text", 422],
    ["too_many_pages", 422],
    ["unreadable", 422],
    ["busy", 429],
  ] as const)("maps %s to %i", async (error, status) => {
    h.result = { ok: false, error };
    const res = await POST(upload(PDF));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code: error } });
  });

  it("limits uploads per client address and does not share the limit between clients", async () => {
    h.result = { ok: false, error: "unreadable" };
    const a = { "x-forwarded-for": "203.0.113.7, 10.1.1.1" };
    const before = h.calls;
    for (let i = 0; i < 20; i++) expect((await POST(upload(PDF, a))).status).toBe(422);
    const limited = await POST(upload(PDF, a));
    expect(limited.status).toBe(429);
    const wait = Number(limited.headers.get("retry-after"));
    expect(wait).toBeGreaterThan(50);
    expect(wait).toBeLessThanOrEqual(60);
    expect(await limited.json()).toEqual({ error: { code: "busy" } });
    expect(h.calls).toBe(before + 20);
    expect((await POST(upload(PDF, { "x-forwarded-for": "203.0.113.8" }))).status).toBe(422);
    expect((await POST(upload(PDF, { "x-forwarded-for": "203.0.113.7" }))).status).toBe(429);
  });

  it("does not charge the limit for bodies that are not a PDF", async () => {
    h.result = { ok: false, error: "unreadable" };
    const a = { "x-forwarded-for": "198.51.100.9" };
    for (let i = 0; i < 30; i++) expect((await POST(upload(new TextEncoder().encode("junk"), a))).status).toBe(415);
    expect((await POST(upload(PDF, a))).status).toBe(422);
  });
});
