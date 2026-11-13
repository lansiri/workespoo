import { z } from "zod";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

/** Parse and validate a JSON request body. Throws HttpError(400, "invalid_body"). */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "invalid_body", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    throw new HttpError(400, "invalid_body", summary.slice(0, 300));
  }
  return result.data;
}

/** Turn any thrown value into a JSON error response `{ error: { code, message } }`. Never leaks stack traces. */
export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: { code: "invalid_body", message: "Invalid request" } }, { status: 400 });
  }
  console.error("[http] unhandled error", error instanceof Error ? error.message : String(error));
  return Response.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

/** Wrap a route handler: `export const POST = route(async (request, ctx) => ...)`. Catches and maps errors. */
export function route<C>(
  handler: (request: Request, ctx: C) => Promise<Response>,
): (request: Request, ctx: C) => Promise<Response> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
