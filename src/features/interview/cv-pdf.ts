/**
 * Reading the text of an uploaded CV PDF (docs/specs/prompts/cv-seed.md, rule 2).
 *
 * The file is held in memory for this one call and is never written to disk, stored, logged or
 * audited. Only the text layer is read: no metadata (it often holds the author's name), no
 * images, no fonts loaded into the page, no scripts. A scanned PDF has no text layer, and we
 * say so rather than run character recognition.
 *
 * pdf.js never runs in the web process. Each file is read by a short-lived child process
 * (`cv-pdf-child.mjs`) with a minimal environment (no database or model credentials), a V8
 * heap limit, a wall-clock deadline and a resident-memory watchdog; any limit ends in SIGKILL.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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
const MAX_CONCURRENT = 2;
/**
 * Memory arithmetic: a child is killed above 256 MiB resident, so two at once stay under
 * 512 MiB; next to a web process of about 300 MB that is about 0.82 GB, inside the 1.5 GB
 * container limit. A normal CV needs well under 150 MiB.
 */
const CHILD_RSS_LIMIT_BYTES = 256 * 1024 * 1024;
/** V8 old-space limit of the child. Below the RSS limit so ordinary garbage ends in a V8 abort. */
const CHILD_HEAP_MB = 160;
const WATCHDOG_INTERVAL_MS = 50;
/** The child answers with at most CV_TEXT_MAX_CHARS characters; JSON escapes can grow that. */
const CHILD_STDOUT_MAX_BYTES = 512 * 1024;
/** How long to wait for a killed child to be reaped before the slot is freed anyway. */
const KILL_GRACE_MS = 2_000;
const CHILD_SCRIPT = path.join(process.cwd(), "src", "features", "interview", "cv-pdf-child.mjs");

export type CvPdfError = CvUploadError;

export type CvPdfResult = ({ ok: true } & AnonymisedCv) | { ok: false; error: CvPdfError };

export type ChildAnswer = { ok: true; pages: number; text: string } | { ok: false };

let running = 0;

/** A PDF starts with `%PDF-`, allowed within the first kilobyte. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

/** Resident memory of a process in bytes, or null where /proc cannot be read. */
function residentBytes(pid: number): number | null {
  try {
    const pages = Number(readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]);
    return Number.isFinite(pages) ? pages * 4096 : null;
  } catch {
    return null;
  }
}

/**
 * Run the child on the bytes. Resolves once the child has exited (or, at worst, KILL_GRACE_MS
 * after it was killed); never rejects. `testMode` is honoured only when NODE_ENV is "test".
 */
export function runPdfChild(bytes: Uint8Array, testMode?: string): Promise<ChildAnswer> {
  return new Promise((resolve) => {
    const env: Record<string, string> = {};
    if (process.env.PATH) env.PATH = process.env.PATH;
    if (process.env.NODE_ENV) env.NODE_ENV = process.env.NODE_ENV;
    if (testMode && process.env.NODE_ENV === "test") env.CV_PDF_TEST_MODE = testMode;

    let settled = false;
    let killed = false;
    let outBytes = 0;
    const chunks: Buffer[] = [];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        process.execPath,
        [`--max-old-space-size=${CHILD_HEAP_MB}`, CHILD_SCRIPT, String(CV_PDF_MAX_PAGES), String(CV_TEXT_MAX_CHARS)],
        { env: env as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "ignore"], cwd: process.cwd() },
      );
    } catch {
      resolve({ ok: false });
      return;
    }

    // Lowest priority: a PDF made to burn CPU must not starve the web process on a 2-vCPU host.
    // Raising a process's own niceness needs no capability.
    try {
      if (child.pid !== undefined) os.setPriority(child.pid, 19);
    } catch {
      // not fatal
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (answer: ChildAnswer) => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      clearInterval(watchdog);
      resolve(answer);
    };
    const kill = () => {
      if (killed) return;
      killed = true;
      child.kill("SIGKILL");
      // Normally 'close' follows at once; this is only a net for a child that cannot be reaped.
      timers.push(setTimeout(() => finish({ ok: false }), KILL_GRACE_MS));
    };

    timers.push(setTimeout(kill, CV_PDF_DEADLINE_MS));
    // V8's heap limit does not count typed-array buffers (a compressed stream that expands
    // inflates into one), so the child's resident memory is watched from here as well.
    const watchdog = setInterval(() => {
      if (child.pid === undefined) return;
      const rss = residentBytes(child.pid);
      if (rss !== null && rss > CHILD_RSS_LIMIT_BYTES) kill();
    }, WATCHDOG_INTERVAL_MS);

    child.stdout?.on("data", (c: Buffer) => {
      outBytes += c.length;
      if (outBytes > CHILD_STDOUT_MAX_BYTES) {
        kill();
        return;
      }
      chunks.push(c);
    });
    child.stdout?.on("error", () => {});
    child.stdin?.on("error", () => {});
    child.on("error", () => finish({ ok: false }));
    child.on("close", (code) => {
      if (killed || code !== 0) return finish({ ok: false });
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { pages?: unknown; text?: unknown };
        if (typeof parsed.pages === "number" && typeof parsed.text === "string") {
          return finish({ ok: true, pages: parsed.pages, text: parsed.text });
        }
      } catch {
        // fall through
      }
      finish({ ok: false });
    });
    // The child takes its own copy as it reads; the parent's bytes are not shared with it.
    child.stdin?.end(bytes);
  });
}

/** Read and anonymise a CV PDF. Never throws. Nothing of the file outlives the call. */
export async function readCvPdf(bytes: Uint8Array): Promise<CvPdfResult> {
  if (bytes.length > CV_PDF_MAX_BYTES) return { ok: false, error: "too_large" };
  if (bytes.length === 0 || !looksLikePdf(bytes)) return { ok: false, error: "not_pdf" };
  if (running >= MAX_CONCURRENT) return { ok: false, error: "busy" };

  // The slot is held until the child has exited, whatever way it ended.
  running += 1;
  let answer: ChildAnswer;
  try {
    answer = await runPdfChild(bytes);
  } finally {
    running -= 1;
  }
  if (!answer.ok) return { ok: false, error: "unreadable" };
  if (answer.pages > CV_PDF_MAX_PAGES) return { ok: false, error: "too_many_pages" };
  // Cut BEFORE anonymising: the anonymiser's cost grows with the length of its input.
  const text = answer.text.slice(0, CV_TEXT_MAX_CHARS);
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) return { ok: false, error: "no_text" };
  try {
    const anonymised = anonymiseCv(text);
    return { ok: true, text: anonymised.text.slice(0, CV_TEXT_MAX_CHARS), removed: anonymised.removed };
  } catch {
    // Never log or return the error: its message can hold words from the CV.
    return { ok: false, error: "unreadable" };
  }
}
