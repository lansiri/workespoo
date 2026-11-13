"use client";

import { useEffect, useRef } from "react";
import type { VoiceStatus } from "./controller";

export interface PushToTalkButtonProps {
  status: VoiceStatus;
  /** Called on press (pointer down, touch start or Space down). */
  onPress: () => void;
  /** Called once when the press ends, wherever the finger or pointer is. */
  onRelease: () => void;
  disabled?: boolean;
}

const LABELS: Record<VoiceStatus, string> = {
  unavailable: "Voice is not available",
  idle: "Hold to talk",
  listening: "Listening…",
  transcribing: "Sending…",
  speaking: "Hold to talk",
  error: "Hold to talk",
};

/**
 * Unstyled hold-to-talk button. Pointer, touch and the Space key all work, and the press
 * ends wherever the pointer is released: listeners go on `window` while it is held.
 */
export function PushToTalkButton({ status, onPress, onRelease, disabled }: PushToTalkButtonProps) {
  const held = useRef(false);
  const handlers = useRef({ onPress, onRelease });
  useEffect(() => {
    handlers.current = { onPress, onRelease };
  });
  const blocked = disabled || status === "unavailable" || status === "transcribing";

  const begin = () => {
    if (held.current || blocked) return;
    held.current = true;
    handlers.current.onPress();
  };
  const end = () => {
    if (!held.current) return;
    held.current = false;
    handlers.current.onRelease();
  };

  // While held, listen on window so releasing outside the button (or the tab losing focus) still ends it.
  useEffect(() => {
    const up = () => end();
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") end();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", up);
    };
  }, []);

  return (
    <button
      type="button"
      data-testid="talk-button"
      aria-pressed={status === "listening"}
      disabled={blocked}
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        begin();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.code === "Space") {
          e.preventDefault();
          end();
        }
      }}
    >
      {LABELS[status]}
    </button>
  );
}
