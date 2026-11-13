"use client";

import Link from "next/link";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";

export type HoldToTalkState = "ready" | "listening" | "disabled" | "done";

export type HoldToTalkProps = {
  state: HoldToTalkState;
  /** Mic level 0 to 1 for the five bars while listening. */
  level?: number;
  /** Label for the current state: "Hold to talk", "Release to send", "Check my notes". */
  label: string;
  onStart?: () => void;
  onRelease?: () => void;
  /** Where "Check my notes" goes. Required when state is "done". */
  doneHref?: string;
  /** id of the hint element ("In a noisy place, hold the button only while you speak."). */
  describedBy?: string;
  className?: string;
};

const BAR_SHAPE = [0.6, 0.9, 1, 0.8, 0.55];

/**
 * Main voice control: hold to record, release to send. A real button with pointer capture; Space or Enter
 * down starts, key up sends. It never starts recording on its own. When done it becomes the "Check my notes" link.
 */
export function HoldToTalk({ state, level = 0.3, label, onStart, onRelease, doneHref, describedBy, className }: HoldToTalkProps) {
  if (state === "done") {
    return (
      <Link href={doneHref ?? "#"} className={cx("we-talk", className)} data-testid="go-to-card">
        <Icon name="check" />
        <span>{label}</span>
      </Link>
    );
  }
  const held = state === "listening";
  function down(e: PointerEvent<HTMLButtonElement>) {
    if (state !== "ready") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onStart?.();
  }
  function up() {
    if (held) onRelease?.();
  }
  function keyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      if (state === "ready") onStart?.();
    }
  }
  function keyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if ((e.key === " " || e.key === "Enter") && held) {
      e.preventDefault();
      onRelease?.();
    }
  }
  return (
    <button
      type="button"
      className={cx("we-talk", held && "we-held", className)}
      disabled={state === "disabled"}
      aria-pressed={held}
      aria-describedby={describedBy}
      data-state={state}
      data-testid="talk-button"
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon name="mic" />
      <span>{label}</span>
      {held ? (
        <span className="we-lvl" aria-hidden="true">
          {BAR_SHAPE.map((k, i) => (
            <i key={i} style={{ "--h": (Math.max(0, Math.min(1, level)) * k).toFixed(2) } as CSSProperties} />
          ))}
        </span>
      ) : null}
    </button>
  );
}

/** 64 x 64 keyboard button beside the talk button on phones. `label` is its accessible name. */
export function TypeInsteadButton({ label, onClick, pressed }: { label: string; onClick?: () => void; pressed?: boolean }) {
  return (
    <button type="button" className="we-type-btn" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} data-testid="type-instead">
      <Icon name="keyboard" />
    </button>
  );
}
