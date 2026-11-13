import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError, errorResponse, parseBody, route } from "./http";

const req = (body: string) => new Request("http://x/api", { method: "POST", body });
const Schema = z.object({ name: z.string().min(1) });

describe("parseBody", () => {
  it("returns validated data", async () => {
    expect(await parseBody(req('{"name":"a"}'), Schema)).toEqual({ name: "a" });
  });
  it("throws invalid_body on bad JSON and on schema failure", async () => {
    for (const body of ["{nope", '{"name":""}', "null"]) {
      await expect(parseBody(req(body), Schema)).rejects.toMatchObject({ status: 400, code: "invalid_body" });
    }
  });
});

describe("errorResponse", () => {
  it("maps HttpError", async () => {
    const res = errorResponse(new HttpError(403, "forbidden", "nope"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden", message: "nope" } });
  });
  it("defaults the message to the code", async () => {
    expect((await errorResponse(new HttpError(404, "not_found")).json()).error.message).toBe("not_found");
  });
  it("maps ZodError to 400", async () => {
    const err = Schema.safeParse({}).error!;
    const res = errorResponse(err);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_body");
  });
  it("maps unknown errors to 500 without leaking details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("secret db password"));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).error.code).toBe("internal");
    spy.mockRestore();
  });
});

describe("route", () => {
  it("passes through and catches", async () => {
    const ok = route(async () => Response.json({ ok: true }));
    expect((await ok(req(""), {})).status).toBe(200);
    const bad = route(async (r) => {
      await parseBody(r, Schema);
      return Response.json({});
    });
    expect((await bad(req("x"), {})).status).toBe(400);
    const boom = route(async () => {
      throw new HttpError(401, "unauthenticated");
    });
    expect((await boom(req(""), {})).status).toBe(401);
  });
});
