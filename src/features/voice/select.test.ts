import { describe, expect, it } from "vitest";
import { selectAdapterId } from "./select";

const cfg = (adapter: "elevenlabs" | "browser" | "server" | "http" | "none") => ({ adapter, processor: "x" });

describe("selectAdapterId", () => {
  it("follows the server config", () => {
    expect(selectAdapterId(cfg("elevenlabs"))).toBe("elevenlabs");
    expect(selectAdapterId(cfg("browser"))).toBe("browser");
  });
  it("is off when config is missing or none", () => {
    expect(selectAdapterId(null)).toBeNull();
    expect(selectAdapterId(cfg("none"), "browser")).toBeNull();
  });
  it("lets the override win over the server", () => {
    expect(selectAdapterId(cfg("elevenlabs"), "browser")).toBe("browser");
    expect(selectAdapterId(cfg("browser"), "elevenlabs")).toBe("elevenlabs");
    expect(selectAdapterId(cfg("browser"), "auto")).toBe("browser");
  });
  it("falls back to the browser for an adapter we have not built", () => {
    expect(selectAdapterId(cfg("http"))).toBe("browser");
  });
  it("runs the server adapter when the config says server, and for a manual override", () => {
    expect(selectAdapterId(cfg("server"))).toBe("server");
    expect(selectAdapterId(cfg("browser"), "server")).toBe("server");
    expect(selectAdapterId(cfg("none"), "server")).toBeNull();
  });
});
