/**
 * Lab only, Node 22: `npx tsx scripts/lab/cv-attack.ts`. Sends hostile and ordinary PDFs through
 * `readCvPdf` exactly as the upload route does and prints how long each took, how far the event
 * loop stalled meanwhile and how much this process's memory grew. Nothing here calls a network.
 */
import { deflateSync } from "node:zlib";
import { readCvPdf } from "../../src/features/interview/cv-pdf";

function pdf(content: Buffer, opts: { flate?: boolean } = {}): Uint8Array {
  const stream = opts.flate ? deflateSync(content) : content;
  const objects: Buffer[] = [];
  const push = (s: string | Buffer) => objects.push(Buffer.isBuffer(s) ? s : Buffer.from(s, "latin1"));
  const parts: Array<string | Buffer> = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    Buffer.concat([Buffer.from(`<< /Length ${stream.length}${opts.flate ? " /Filter /FlateDecode" : ""} >>\nstream\n`, "latin1"), stream, Buffer.from("\nendstream", "latin1")]),
  ];
  let out = Buffer.from("%PDF-1.4\n", "latin1");
  const offsets: number[] = [];
  parts.forEach((p, i) => {
    offsets.push(out.length);
    out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n`, "latin1"), Buffer.isBuffer(p) ? p : Buffer.from(p, "latin1"), Buffer.from("\nendobj\n", "latin1")]);
  });
  void push;
  const xref = out.length;
  let tail = `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) tail += `${String(o).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${parts.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([out, Buffer.from(tail, "latin1")]));
}

const text = (lines: string[], font = "11") => Buffer.from(["BT", `/F1 ${font} Tf`, "14 TL", "72 760 Td", ...lines.map((l) => `(${l.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj T*`), "ET"].join("\n"), "latin1");

async function run(name: string, bytes: Uint8Array): Promise<void> {
  let worst = 0;
  let last = performance.now();
  const tick = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 20);
    last = now;
  }, 20);
  const before = process.memoryUsage().rss;
  const started = performance.now();
  const result = await readCvPdf(bytes);
  const took = performance.now() - started;
  // One more turn of the loop, so a stall at the very end is counted.
  await new Promise((r) => setTimeout(r, 30));
  clearInterval(tick);
  const grew = (process.memoryUsage().rss - before) / 1024 / 1024;
  const shown = result.ok ? `ok, ${result.text.length} characters, removed ${JSON.stringify(result.removed)}` : `error ${result.error}`;
  console.log(`${name.padEnd(46)} ${(bytes.length / 1024).toFixed(0).padStart(5)} KB  ${took.toFixed(0).padStart(6)} ms  loop stalled ${worst.toFixed(0).padStart(5)} ms  memory +${grew.toFixed(0)} MB  ${shown}`);
  if (result.ok && process.env.SHOW === name) console.log(result.text);
}

async function main() {
  console.log(`node ${process.version}`);
  await run("warm-up (ordinary CV)", pdf(text(["Curriculum Vitae", "Alex Demo", "alex.demo@example.test +358 40 000 0000", "Born 12.3.1988, married, two children", "Nationality: Finnish. Mother tongue: Finnish", "Work experience", "2021-2025 ERP specialist, machine shop, Espoo", "Set up items and work orders. Wrote Python scripts that move production data into the ERP every night.", "2017-2021 Production planner, furniture factory", "Skills: Python, SQL, ERP report builder, Excel", "Languages: English (fluent), Finnish (native), Swedish (basic)", "References: Matti Meikalainen, CEO, +358 50 111 2222"])));
  await run("ordinary CV", pdf(text(["Curriculum Vitae", "Alex Demo", "alex.demo@example.test +358 40 000 0000", "Born 12.3.1988, married, two children", "Nationality: Finnish. Mother tongue: Finnish", "Work experience", "2021-2025 ERP specialist, machine shop, Espoo", "Set up items and work orders. Wrote Python scripts that move production data into the ERP every night.", "2017-2021 Production planner, furniture factory", "Skills: Python, SQL, ERP report builder, Excel", "Languages: English (fluent), Finnish (native), Swedish (basic)", "References: Matti Meikalainen, CEO, +358 50 111 2222"])));
  await run("one word of 400,000 letters, tiny font", pdf(text(["a".repeat(400_000)], "0.01"), { flate: true }));
  await run("400 words of 80 letters, tiny font", pdf(text(Array.from({ length: 400 }, () => "a".repeat(80)), "0.01"), { flate: true }));
  await run("20,000 x 'a.' (dots and letters)", pdf(text(["a.".repeat(20_000)], "0.01"), { flate: true }));
  await run("letters then @ at the very end", pdf(text([`${"a".repeat(19_990)}@b.fi`], "0.01"), { flate: true }));
  await run("many @ without a domain", pdf(text(["a@".repeat(10_000)], "0.01"), { flate: true }));
  await run("digits and plus signs (phone-like)", pdf(text(["+358 40 ".repeat(2500)], "0.01"), { flate: true }));
  await run("capitalised words (name-like), 3,000", pdf(text([Array.from({ length: 3000 }, (_, i) => `Aa${"b".repeat(i % 7)}`).join(" ")], "0.01"), { flate: true }));
  await run("stream expanding to 900 MB", pdf(Buffer.alloc(900 * 1024 * 1024, 0x20), { flate: true }));
  await run("not a PDF", new TextEncoder().encode("hello, this is not a pdf at all"));
  await run("ordinary CV again (slot free?)", pdf(text(["Work experience", "2021-2025 ERP specialist, machine shop", "Wrote Python scripts that move production data into the ERP every night."])));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
