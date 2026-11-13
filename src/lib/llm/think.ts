const OPEN = "<think>";
const CLOSE = "</think>";

/** Length of the longest suffix of `s` that is a proper prefix of `tag`. */
function partialSuffix(s: string, tag: string): number {
  const max = Math.min(s.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (tag.startsWith(s.slice(s.length - n))) return n;
  }
  return 0;
}

/**
 * Removes `<think>...</think>` blocks from streamed text, including tags split across chunks.
 * An unterminated block is dropped at `flush()`. Whitespace directly after a closing tag is
 * trimmed when it would otherwise start the output.
 */
export class ThinkStripper {
  private buf = "";
  private inThink = false;
  private emitted = false;
  private trimLead = false;

  push(chunk: string): string {
    this.buf += chunk;
    let out = "";
    for (;;) {
      if (this.inThink) {
        const i = this.buf.indexOf(CLOSE);
        if (i >= 0) {
          this.buf = this.buf.slice(i + CLOSE.length);
          this.inThink = false;
          if (!this.emitted && out === "") this.trimLead = true;
          continue;
        }
        // keep only a possible partial closing tag
        this.buf = this.buf.slice(this.buf.length - partialSuffix(this.buf, CLOSE));
        break;
      }
      const i = this.buf.indexOf(OPEN);
      if (i >= 0) {
        out += this.buf.slice(0, i);
        this.buf = this.buf.slice(i + OPEN.length);
        this.inThink = true;
        continue;
      }
      const keep = partialSuffix(this.buf, OPEN);
      out += this.buf.slice(0, this.buf.length - keep);
      this.buf = this.buf.slice(this.buf.length - keep);
      break;
    }
    return this.finish(out);
  }

  /** Call once at the end of the stream. Held-back partial tags are text; open think blocks are dropped. */
  flush(): string {
    const rest = this.inThink ? "" : this.buf;
    this.buf = "";
    this.inThink = false;
    return this.finish(rest);
  }

  private finish(out: string): string {
    if (this.trimLead && out !== "") {
      out = out.replace(/^\s+/, "");
      if (out !== "") this.trimLead = false;
    }
    if (out !== "") this.emitted = true;
    return out;
  }
}

export function stripThink(text: string): string {
  const s = new ThinkStripper();
  return s.push(text) + s.flush();
}
