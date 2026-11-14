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
  it("uses only the adapter a person's consent names, whatever the server would choose now", () => {
    // Agreed to "audio stays on WorkEspoo's own server": the recogniser being down must not hand them to the browser's.
    expect(selectAdapterId(cfg("browser"), "auto", "server")).toBe("server");
    expect(selectAdapterId(cfg("elevenlabs"), "auto", "server")).toBe("server");
    expect(selectAdapterId(cfg("server"), "browser", "server")).toBe("server");
    // Voice switched off for the deployment still means no voice.
    expect(selectAdapterId(cfg("none"), "auto", "server")).toBeNull();
    expect(selectAdapterId(null, "auto", "server")).toBeNull();
  });
  it("runs the server adapter when the config says server, and for a manual override", () => {
    expect(selectAdapterId(cfg("server"))).toBe("server");
    expect(selectAdapterId(cfg("browser"), "server")).toBe("server");
    expect(selectAdapterId(cfg("none"), "server")).toBeNull();
  });
});
