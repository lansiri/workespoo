import { z } from "zod";

/** Strip code fences and prose around the outermost JSON value, then parse. Throws on failure. */
export function parseLenientJson(text: string): unknown {
  let s = text.trim();
  const start = s.search(/[{[]/);
  if (start < 0) throw new Error("no JSON object found in the output");
  const closer = s[start] === "{" ? "}" : "]";
  const end = s.lastIndexOf(closer);
  if (end <= start) throw new Error("JSON object is not closed");
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch (first) {
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      throw first;
    }
  }
}

export function summariseZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("; ");
}

export function retryMessage(summary: string): string {
  return `Your output was not valid. Error: ${summary.slice(0, 300)}. Return only the JSON object in the exact format.`;
}
