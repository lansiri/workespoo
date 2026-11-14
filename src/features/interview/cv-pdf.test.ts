import { readdirSync, readFileSync } from "node:fs";
import { createDeflate } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { CV_PDF_DEADLINE_MS, CV_PDF_MAX_BYTES, CV_TEXT_MAX_CHARS, looksLikePdf, readCvPdf, runPdfChild } from "./cv-pdf";
import { createRateLimiter } from "./cv-rate-limit";

const anon = vi.hoisted(() => ({ seen: [] as number[], throwNext: false }));
vi.mock("./cv-anonymise", async (orig) => {
  const real = await orig<typeof import("./cv-anonymise")>();
  return {
    ...real,
    anonymiseCv: (text: string) => {
      anon.seen.push(text.length);
      if (anon.throwNext) {
        anon.throwNext = false;
        throw new SyntaxError("Invalid regular expression: secret words from the cv");
      }
      return real.anonymiseCv(text);
    },
  };
});

/**
 * A minimal one-page PDF with one text line per entry (Helvetica, WinAnsi, so ä and ö work).
 * `author` goes into the document info, which must never be read.
 */
function makePdf(lines: string[], opts: { author?: string; pages?: number } = {}): Uint8Array {
  const pages = opts.pages ?? 1;
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = ["BT", "/F1 11 Tf", "14 TL", "72 760 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");

  const objects: string[] = [];
  const pageIds = Array.from({ length: pages }, (_, i) => 4 + i);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  const contentId = 4 + pages;
  for (const id of pageIds) {
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
  }
  objects[contentId] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  const infoId = contentId + 1;
  objects[infoId] = `<< /Author (${esc(opts.author ?? "")}) /Title (CV) >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out, "latin1");
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/**
 * pdf.js needs the global `Iterator` (Node 22 and later; production runs Node 22). On an older
 * local Node the parsing tests are skipped; the input checks still run.
 */
const pdfjsRuns = typeof (globalThis as { Iterator?: unknown }).Iterator !== "undefined";
const parses = it.skipIf(!pdfjsRuns);

describe("readCvPdf", () => {
  parses("reads the text layer line by line and anonymises it", async () => {
    const pdf = makePdf(
      [
        "Maija Meikäläinen",
        "maija@example.fi   +358 40 123 4567",
        "Syntymäaika: 12.3.1988",
        "",
        "WORK EXPERIENCE",
        "Warehouse Worker, Posti 2015-2019",
        "Drove forklifts and checked incoming deliveries.",
        "Maija trained two new colleagues on the scanners.",
      ],
      { author: "Maija Meikäläinen" },
    );
    const result = await readCvPdf(pdf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("Drove forklifts and checked incoming deliveries.");
    expect(result.text).toContain("trained two new colleagues on the scanners.");
    expect(result.text).not.toMatch(/Maija|Meikäläinen|@|\+358|1988|2015|Syntymäaika/);
    expect(result.removed.name).toBeGreaterThanOrEqual(2);
  });

  it("refuses something that is not a PDF", async () => {
    expect(await readCvPdf(new TextEncoder().encode("hello, this is not a pdf"))).toEqual({ ok: false, error: "not_pdf" });
    expect(await readCvPdf(new Uint8Array(0))).toEqual({ ok: false, error: "not_pdf" });
  });

  it("refuses a file over the size limit before parsing it", async () => {
    const big = new Uint8Array(CV_PDF_MAX_BYTES + 1);
    big.set(new TextEncoder().encode("%PDF-1.4"));
    expect(await readCvPdf(big)).toEqual({ ok: false, error: "too_large" });
  });

  parses("says when there is no text layer (a scanned page)", async () => {
    expect(await readCvPdf(makePdf([]))).toEqual({ ok: false, error: "no_text" });
  });

  parses("refuses more than ten pages", async () => {
    expect(await readCvPdf(makePdf(["Drove forklifts and checked deliveries every day."], { pages: 11 }))).toEqual({
      ok: false,
      error: "too_many_pages",
    });
  });

  parses("a broken PDF is unreadable, not a crash", async () => {
    const broken = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 9 0 R >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF");
    const result = await readCvPdf(broken);
    expect(result.ok).toBe(false);
  });

  it("looksLikePdf finds the header within the first kilobyte", () => {
    expect(looksLikePdf(new TextEncoder().encode("   %PDF-1.7"))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("PK\u0003\u0004"))).toBe(false);
  });
});

/** A one-page PDF whose content stream is `body`, optionally deflated (FlateDecode). */
function makeRawPdf(body: Buffer, flate: boolean): Uint8Array {
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    parts.push(buf);
    len += buf.length;
  };
  push("%PDF-1.4\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
  ];
  objs.forEach((o, i) => {
    offsets[i + 1] = len;
    push(`${i + 1} 0 obj\n${o}\nendobj\n`);
  });
  offsets[5] = len;
  push(`5 0 obj\n<< /Length ${body.length}${flate ? " /Filter /FlateDecode" : ""} >>\nstream\n`);
  push(body);
  push("\nendstream\nendobj\n");
  const xref = len;
  let x = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(Buffer.concat(parts));
}

/** Deflate `megabytes` MB of zeros without ever holding them in this process. */
async function zeroBomb(megabytes: number): Promise<Buffer> {
  const z = createDeflate();
  const out: Buffer[] = [];
  z.on("data", (c: Buffer) => out.push(c));
  const done = new Promise<void>((r) => z.on("end", () => r()));
  const chunk = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < megabytes; i++) {
    if (!z.write(chunk)) await new Promise((r) => z.once("drain", r));
  }
  z.end();
  await done;
  return Buffer.concat(out);
}

/** Processes whose command line names the child script, found by scanning /proc. */
function childCount(): number {
  let n = 0;
  try {
    for (const pid of readdirSync("/proc")) {
      if (!/^\d+$/.test(pid)) continue;
      try {
        if (readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("cv-pdf-child.mjs")) n += 1;
      } catch {
        // the process ended while we looked
      }
    }
  } catch {
    // no /proc here
  }
  return n;
}

describe("reading in a child process", () => {
  // The tiny font keeps pdf.js from dropping the run: the child really returns the full cut.
  parses("a very long run of letters reaches the anonymiser cut to the limit", async () => {
    const word = "a".repeat(400_000);
    const pdf = makeRawPdf(Buffer.from(`BT /F1 0.01 Tf 0 760 Td (${word}) Tj ET`, "latin1"), false);
    const child = await runPdfChild(pdf);
    expect(child.ok && child.text.length).toBe(CV_TEXT_MAX_CHARS);
    anon.seen.length = 0;
    const result = await readCvPdf(pdf);
    expect(result.ok).toBe(true);
    expect(anon.seen).toEqual([CV_TEXT_MAX_CHARS]);
  }, 90_000);

  // Needs the anonymiser's regular expression fix (a 20,000-letter run takes 10 s or more today).
  it.todo("a 20,000-letter run is anonymised in under two seconds");

  it("an anonymiser that throws gives 'unreadable', not an exception", async () => {
    if (!pdfjsRuns) return;
    anon.throwNext = true;
    const result = await readCvPdf(makePdf(["Drove forklifts and checked incoming deliveries every day."]));
    expect(result).toEqual({ ok: false, error: "unreadable" });
  });

  parses("a stream that expands to hundreds of megabytes is killed, and the event loop keeps turning", async () => {
    const bomb = await zeroBomb(900);
    const pdf = makeRawPdf(bomb, true);
    expect(pdf.length).toBeLessThan(CV_PDF_MAX_BYTES);
    const rssBefore = process.memoryUsage().rss;
    let last = Date.now();
    let worstGap = 0;
    const timer = setInterval(() => {
      const t = Date.now();
      worstGap = Math.max(worstGap, t - last);
      last = t;
    }, 20);
    const started = Date.now();
    const result = await readCvPdf(pdf);
    clearInterval(timer);
    expect(result).toEqual({ ok: false, error: "unreadable" });
    expect(Date.now() - started).toBeLessThan(CV_PDF_DEADLINE_MS);
    expect(worstGap).toBeLessThan(220);
    expect(process.memoryUsage().rss - rssBefore).toBeLessThan(150 * 1024 * 1024);
    expect(childCount()).toBe(0);
  }, 30_000);

  parses("a child that never answers is killed at the deadline, no child is left and the slot is free", async () => {
    const started = Date.now();
    const answer = await runPdfChild(new TextEncoder().encode("%PDF-1.4"), "hang");
    const took = Date.now() - started;
    expect(answer).toEqual({ ok: false });
    expect(took).toBeGreaterThanOrEqual(CV_PDF_DEADLINE_MS - 100);
    expect(took).toBeLessThan(CV_PDF_DEADLINE_MS + 2_500);
    expect(childCount()).toBe(0);
    // The slot is free: two more parses of a bad file are answered, none is "busy".
    const bad = new TextEncoder().encode("%PDF-1.4 broken");
    const results = await Promise.all([readCvPdf(bad), readCvPdf(bad)]);
    for (const r of results) expect(r.ok === false && r.error).not.toBe("busy");
  }, 30_000);

  it("gives the child none of the parent's secrets", async () => {
    process.env.DATABASE_URL = "postgres://secret";
    process.env.LLM_API_KEY = "secret";
    try {
      const answer = await runPdfChild(new TextEncoder().encode("%PDF-1.4"), "env");
      // Node 20 cannot run the child at all; where it runs, check what it was given.
      if (!pdfjsRuns) return expect(answer).toEqual({ ok: false });
      expect(answer.ok).toBe(true);
      if (!answer.ok) return;
      const names = answer.text.split(",");
      expect(names).not.toContain("DATABASE_URL");
      expect(names).not.toContain("LLM_API_KEY");
      expect(names.filter((n) => !["PATH", "NODE_ENV", "CV_PDF_TEST_MODE"].includes(n))).toEqual([]);
    } finally {
      delete process.env.DATABASE_URL;
      delete process.env.LLM_API_KEY;
    }
  });
});

describe("createRateLimiter", () => {
  it("counts per key inside a window and stays bounded", () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 3, now: () => t });
    expect([allow("a"), allow("a"), allow("a")]).toEqual([0, 0, 1]);
    expect(allow("b")).toBe(0);
    t = 1500;
    expect(allow("a")).toBe(0);
    for (const k of ["c", "d", "e", "f"]) allow(k);
    expect(allow("a")).toBe(0);
  });

  it("tells how long until the oldest call leaves the window", () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 2, windowMs: 60_000, maxKeys: 3, now: () => t });
    allow("a");
    t = 20_000;
    allow("a");
    t = 30_000;
    expect(allow("a")).toBe(30);
  });
});
