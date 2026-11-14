import { describe, expect, it } from "vitest";
import { CV_PDF_MAX_BYTES, looksLikePdf, readCvPdf } from "./cv-pdf";

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
