"use client";

import Link from "next/link";
import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
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
 * One press of the talk button, kept apart from rendering. It starts only when the button is
 * ready and ends exactly once, when the finger or key lifts, whatever was drawn in between. A
 * quick tap on a slow phone is over before React has drawn "listening"; a press that waited for
 * that drawing to end would never end, and the microphone would stay open.
 */
export function createHold() {
  let active = false;
  return {
    get active() {
      return active;
    },
    start(state: HoldToTalkState, onStart?: () => void): boolean {
      if (active || state !== "ready") return false;
      active = true;
      onStart?.();
      return true;
    },
    end(onRelease?: () => void): boolean {
      if (!active) return false;
      active = false;
      onRelease?.();
      return true;
    },
  };
}

/**
 * Main voice control: hold to record, release to send. A real button with pointer capture; Space or Enter
 * down starts, key up sends. It never starts recording on its own. When done it becomes the "Check my notes" link.
 */
export function HoldToTalk({ state, level = 0.3, label, onStart, onRelease, doneHref, describedBy, className }: HoldToTalkProps) {
  const [hold] = useState(createHold);
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
    if (state !== "ready" || hold.active) return;
    try {
      // Keeps the release coming to this button when the finger slides off it.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // A pointer that cannot be captured is still a press.
    }
    hold.start(state, onStart);
  }
  function up() {
    hold.end(onRelease);
  }
  function keyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      hold.start(state, onStart);
    }
  }
  function keyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if ((e.key === " " || e.key === "Enter") && hold.active) {
      e.preventDefault();
      up();
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
      onLostPointerCapture={up}
      onBlur={up}
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
