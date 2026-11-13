import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InterviewerMascot, type MascotState } from "./InterviewerMascot";

const STATES: MascotState[] = ["idle", "listening", "thinking", "speaking"];

describe("InterviewerMascot", () => {
  it.each(STATES)("exposes state %s through a data attribute and a worded status badge", (state) => {
    const html = renderToStaticMarkup(<InterviewerMascot state={state} badgeLabel={`label-${state}`} />);
    expect(html).toContain(`data-state="${state}"`);
    expect(html).toMatch(/role="status"[^>]*data-state="[a-z]+"/);
    expect(html).toContain(`label-${state}`);
  });

  it("hides the drawing from assistive technology", () => {
    const html = renderToStaticMarkup(<InterviewerMascot state="idle" badgeLabel="Your turn" />);
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs.length).toBeGreaterThan(0);
    for (const s of svgs) expect(s).toContain('aria-hidden="true"');
  });

  it("has no face: only the brand W, the sun head, rings, dots and a pencil", () => {
    const html = renderToStaticMarkup(<InterviewerMascot state="speaking" badgeLabel="Speaking" />);
    expect(html).toContain('d="M34 86L75 195L120 124L165 195L206 86"');
    expect(html).toContain('cx="120" cy="56" r="28"');
    expect(html).not.toMatch(/eye|mouth|smile|brow/i);
  });

  it("scales the listening ring by the microphone level and clamps it", () => {
    expect(renderToStaticMarkup(<InterviewerMascot state="listening" level={0.5} badgeLabel="x" />)).toContain("--lvl:0.500");
    expect(renderToStaticMarkup(<InterviewerMascot state="listening" level={4} badgeLabel="x" />)).toContain("--lvl:1.000");
    expect(renderToStaticMarkup(<InterviewerMascot state="listening" level={-2} badgeLabel="x" />)).toContain("--lvl:0.000");
  });

  it("shows the finished badge with the idle shape", () => {
    const html = renderToStaticMarkup(<InterviewerMascot state="speaking" finished badgeLabel="Interview finished" />);
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('data-finished="true"');
  });

  it("takes an explicit size in pixels", () => {
    expect(renderToStaticMarkup(<InterviewerMascot state="idle" size={96} badgeLabel="x" />)).toContain("--size:96px");
  });
});
