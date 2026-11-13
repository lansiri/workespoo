import { describe, expect, it } from "vitest";
import { rowsOf } from "./sql";

describe("rowsOf", () => {
  it("accepts a postgres.js array and a PGlite { rows } result", () => {
    expect(rowsOf<{ a: number }>([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(rowsOf<{ a: number }>({ rows: [{ a: 2 }], fields: [] })).toEqual([{ a: 2 }]);
    expect(rowsOf(undefined)).toEqual([]);
    expect(rowsOf({})).toEqual([]);
  });
});
