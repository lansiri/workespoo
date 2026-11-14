/**
 * Reading the text of an uploaded CV PDF (docs/specs/prompts/cv-seed.md, rule 2).
 *
 * The file is held in memory for this one call and is never written to disk, stored, logged or
 * audited. Only the text layer is read: no metadata (it often holds the author's name), no
 * images, no fonts loaded into the page, no scripts. A scanned PDF has no text layer, and we
 * say so rather than run character recognition.
 */
import type { CvUploadError } from "@/contracts";
import { anonymiseCv, type AnonymisedCv } from "./cv-anonymise";

export const CV_PDF_MAX_BYTES = 2 * 1024 * 1024;
export const CV_PDF_MAX_PAGES = 10;
export const CV_PDF_DEADLINE_MS = 10_000;
/** Same limit as `cvText` in `StartInterviewRequest`. */
export const CV_TEXT_MAX_CHARS = 20_000;
/** Fewer readable characters than this means there is no usable text layer. */
const MIN_TEXT_CHARS = 40;
/** PDF parsing is CPU work: a handful at a time, the rest are told to try again. */
const MAX_CONCURRENT = 3;

export type CvPdfError = CvUploadError;

export type CvPdfResult = ({ ok: true } & AnonymisedCv) | { ok: false; error: CvPdfError };

let running = 0;

/** A PDF starts with `%PDF-`, allowed within the first kilobyte. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("deadline")), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The text layer of the PDF, pages joined, lines kept. */
export async function extractPdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // pdf.js takes ownership of the buffer it is given: pass a copy. This pdf.js has no eval path
  // for fonts any more (the CVE-2024-4367 class); fonts are not loaded into any page either.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    disableFontFace: true,
    enableXfa: false,
    stopAtErrors: false,
  });
  try {
    if (pdf.numPages > CV_PDF_MAX_PAGES) return { pages: pdf.numPages, text: "" };
    const { text } = await extractText(pdf, { mergePages: true });
    return { pages: pdf.numPages, text };
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}

/** Read and anonymise a CV PDF. Never throws. Nothing of the file outlives the call. */
export async function readCvPdf(bytes: Uint8Array): Promise<CvPdfResult> {
  if (bytes.length > CV_PDF_MAX_BYTES) return { ok: false, error: "too_large" };
  if (bytes.length === 0 || !looksLikePdf(bytes)) return { ok: false, error: "not_pdf" };
  if (running >= MAX_CONCURRENT) return { ok: false, error: "busy" };

  // The slot is held until pdf.js is really done, even when we stop waiting for it.
  running += 1;
  const work = extractPdfText(bytes).finally(() => {
    running -= 1;
  });
  work.catch(() => {});
  try {
    const { pages, text } = await withDeadline(work, CV_PDF_DEADLINE_MS);
    if (pages > CV_PDF_MAX_PAGES) return { ok: false, error: "too_many_pages" };
    if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) return { ok: false, error: "no_text" };
    const anonymised = anonymiseCv(text);
    return { ok: true, text: anonymised.text.slice(0, CV_TEXT_MAX_CHARS), removed: anonymised.removed };
  } catch {
    return { ok: false, error: "unreadable" };
  }
}
