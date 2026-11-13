"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

export type MascotState = "idle" | "listening" | "thinking" | "speaking";

const STATE_ICON: Record<MascotState, IconName> = { idle: "circle", listening: "mic", thinking: "pencil", speaking: "speaker" };

/** Worded badge that tells the state. Announced politely (role="status"). */
export function StateBadge({ state, label, className }: { state: MascotState; label: string; className?: string }) {
  return (
    <span className={cx("we-state-badge", className)} role="status" data-state={state}>
      <Icon name={STATE_ICON[state]} />
      <span>{label}</span>
    </span>
  );
}

export type InterviewerMascotProps = {
  state: MascotState;
  /** Microphone level 0 to 1 (AnalyserNode RMS). Only used while listening. Nothing is recorded or stored. */
  level?: number;
  /** Pixel size. Leave out to get the responsive default (236 desktop, 132 phone, presenter sizes). */
  size?: number;
  /** Words for the badge, for example "Your turn", "Listening…", "Writing a question…", "Speaking". */
  badgeLabel: string;
  /** When the interview is over the badge shows its own label ("Interview finished") with the idle shape. */
  finished?: boolean;
  /** Change this number each time a note lands: the head pops once (1.22, 520 ms spring). */
  catchKey?: number;
  className?: string;
};

/**
 * The AI interviewer: the brand Cheer W exactly (W stroke 40, sun head r28 at 120,56 in a 240 box).
 * It has no face in any state. State shows by shape (ring, discs, arcs, pencil) plus the worded badge.
 */
export function InterviewerMascot({ state, level = 0.35, size, badgeLabel, finished, catchKey = 0, className }: InterviewerMascotProps) {
  const lvl = Math.max(0, Math.min(1, level));
  const headRef = useRef<SVGGElement>(null);
  useEffect(() => {
    // Replay the head pop with WAAPI so the group stays mounted.
    if (catchKey <= 0) return;
    const el = headRef.current;
    if (!el?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ transform: "scale(1)" }, { transform: "scale(1.22)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 520, easing: "cubic-bezier(.34,1.4,.64,1)" });
  }, [catchKey]);
  const style = { "--lvl": lvl.toFixed(3), ...(size ? { "--size": `${size}px` } : {}) } as CSSProperties;
  const shownState: MascotState = finished ? "idle" : state;
  return (
    <div className={cx("we-stage", className)} data-state={shownState} data-finished={finished ? "true" : undefined} data-testid="interviewer-mascot" style={style}>
      <div className="we-ring we-ring-level" />
      <div className="we-ring we-ring-base" />
      <svg className="we-waves" viewBox="-43 -43 326 326" aria-hidden="true" focusable="false">
        <path className="we-w1" d="M217 64A112 112 0 0 1 217 176M23 64A112 112 0 0 0 23 176" />
        <path className="we-w2" d="M233 55A130 130 0 0 1 233 185M7 55A130 130 0 0 0 7 185" style={{ strokeWidth: 6, opacity: 0.7 }} />
        <path className="we-w3" d="M248 46A148 148 0 0 1 248 194M-8 46A148 148 0 0 0 -8 194" style={{ strokeWidth: 5, opacity: 0.45 }} />
      </svg>
      <svg className="we-mascot" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
        <ellipse cx="120" cy="218" rx="70" ry="6" fill="#1E2B29" opacity="0.1" />
        <g className="we-bob">
          <path d="M34 86L75 195L120 124L165 195L206 86" fill="none" stroke="#0E5E55" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M34 86L75 195L120 124" fill="none" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" transform="translate(-6 -5)" />
          <g ref={headRef} className="we-catch">
            <circle cx="120" cy="56" r="28" fill="#FFB627" />
          </g>
        </g>
        <g className="we-think-dots">
          <g>
            <circle cx="120" cy="10" r="6" />
            <circle cx="160" cy="79" r="6" opacity=".6" />
            <circle cx="80" cy="79" r="6" opacity=".35" />
          </g>
        </g>
        <g className="we-pencil">
          <g>
            <path d="M178 118l28-28 9 9-28 28-12 3z" fill="#FFB627" stroke="#1E2B29" strokeWidth="3.5" strokeLinejoin="round" />
            <path d="M200 96l9 9" stroke="#1E2B29" strokeWidth="3.5" />
            <path d="M160 136q8-6 14 0t14 0" fill="none" stroke="#1E2B29" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
      </svg>
      <StateBadge state={shownState} label={badgeLabel} />
    </div>
  );
}
