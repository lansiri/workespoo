// Child process for reading one CV PDF (see cv-pdf.ts). Plain .mjs on purpose: the web
// process starts it with `node`, it is never bundled. It reads the PDF bytes from stdin and
// writes one JSON line {pages, text} to stdout. It writes nothing else anywhere: no file, no
// log. Any failure is a silent non-zero exit and the parent says "unreadable".
//
// argv: maxPages maxChars
const maxPages = Number(process.argv[2]);
const maxChars = Number(process.argv[3]);
// Stop extracting once there is clearly more text than the parent keeps.
const enough = maxChars * 2;

function fail(code) {
  process.exit(code);
}

// pdf.js needs the global Iterator (Node 22 and later).
if (typeof globalThis.Iterator === "undefined") fail(2);

const testMode = process.env.NODE_ENV === "test" ? process.env.CV_PDF_TEST_MODE : undefined;

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return new Uint8Array(Buffer.concat(chunks));
}

function answer(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n", () => process.exit(0));
}

function normalise(text) {
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function main() {
  const bytes = await readStdin();
  if (testMode === "hang") {
    setInterval(() => {}, 1000);
    return;
  }
  if (testMode === "env") {
    answer({ pages: 1, text: Object.keys(process.env).join(",") });
    return;
  }
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes, { disableFontFace: true, enableXfa: false, stopAtErrors: false });
  // The page count is checked before any page's text is read.
  if (pdf.numPages > maxPages) {
    answer({ pages: pdf.numPages, text: "" });
    return;
  }
  const parts = [];
  let length = 0;
  for (let i = 1; i <= pdf.numPages && length <= enough; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let pageText = "";
    for (const item of content.items) {
      if (item.str == null) continue;
      pageText += item.str + (item.hasEOL ? "\n" : "");
      if (length + pageText.length > enough) break;
    }
    parts.push(pageText);
    length += pageText.length + 1;
  }
  answer({ pages: pdf.numPages, text: normalise(parts.join("\n")).slice(0, maxChars) });
}

main().catch(() => fail(1));
