import { describe, expect, it } from "vitest";
import { maskEmployer } from "./mask";

describe("maskEmployer", () => {
  it("replaces the full name, case-insensitively (CV2)", () => {
    expect(maskEmployer("Join ACME Robotics Oy today", "Acme Robotics Oy")).toBe("Join the company today");
  });
  it("replaces the name as postings usually write it, without the legal form", () => {
    expect(maskEmployer("Acme Robotics builds pipelines.", "Acme Robotics Oy")).toBe("the company builds pipelines.");
  });
  it("replaces the first word when it is longer than three characters, and not when it is short", () => {
    expect(maskEmployer("At Acme we write Python.", "Acme Robotics Oy")).toBe("At the company we write Python.");
    expect(maskEmployer("The IBM way", "IBM Finland Oy")).toBe("The IBM way");
  });
  it("leaves text alone without an employer name", () => {
    expect(maskEmployer("Nothing to hide", "")).toBe("Nothing to hide");
  });
  it("does not choke on regular expression characters in a name", () => {
    expect(maskEmployer("Work at A+B (Finland) now", "A+B (Finland)")).toBe("Work at the company now");
  });
});
