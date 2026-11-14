import type { CvUploadError, CvUploadResponse } from "@/contracts";
import { CV_PDF_MAX_BYTES, looksLikePdf, readCvPdf } from "@/features/interview/cv-pdf";
import { clientKey, createRateLimiter } from "@/features/interview/cv-rate-limit";

export const dynamic = "force-dynamic";

/**
 * Twenty readable-looking uploads a minute per client address; the endpoint needs no session.
 * Many people can share one venue address, and the concurrency cap already protects the process.
 */
const allow = createRateLimiter({ limit: 20, windowMs: 60_000, maxKeys: 5_000 });

const STATUS: Record<CvUploadError, number> = {
  too_large: 413,
  not_pdf: 415,
  too_many_pages: 422,
  no_text: 422,
  unreadable: 422,
  busy: 429,
};

function reply(body: unknown, status: number): Response {
  // The answer holds CV text: no cache anywhere may keep it.
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function fail(error: CvUploadError, retryAfter = 2): Response {
  const res = reply({ error: { code: error } }, STATUS[error]);
  if (error === "busy") res.headers.set("retry-after", String(retryAfter));
  return res;
}

/**
 * A CV PDF in (raw body, `application/pdf`), its anonymised text out. The file and its text live
 * in this request only: they are not written to disk, stored, logged or audited.
 */
export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > CV_PDF_MAX_BYTES) return fail("too_large");

  let bytes: Uint8Array | "too_large";
  try {
    bytes = await readCapped(req, CV_PDF_MAX_BYTES);
  } catch {
    return reply({ error: { code: "invalid_request" } }, 400);
  }
  if (bytes === "too_large") return fail("too_large");

  // Charged only now: requests that are not a PDF or are too large cost the parser nothing.
  if (bytes.length === 0 || !looksLikePdf(bytes)) return fail("not_pdf");
  const wait = allow(clientKey(req.headers));
  if (wait > 0) return fail("busy", wait);

  const result = await readCvPdf(bytes);
  if (!result.ok) return fail(result.error);
  const body: CvUploadResponse = { text: result.text, removed: result.removed };
  return reply(body, 200);
}

/** Reads the body up to the cap, whatever Content-Length said. */
async function readCapped(req: Request, max: number): Promise<Uint8Array | "too_large"> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
