import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { FeatureNotReadyError } from "./errors";
import { loadPersonas } from "./persona";
import { runSimulatedInterview } from "./run";

describe("against the stubs that exist today", () => {
  it("fails with one clear message naming the missing feature, not a stack trace", async () => {
    const error = await runSimulatedInterview({} as Db, loadPersonas()[0]).catch((e) => e);
    expect(error).toBeInstanceOf(FeatureNotReadyError);
    expect(error.message).toMatch(/interview\.startInterview is not implemented yet/);
    expect(error.message).toMatch(/--fake/);
  });
});
