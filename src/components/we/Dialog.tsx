"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal with a night scrim. Focus moves in on open, is trapped, Esc calls onClose, and focus returns to
 * whatever opened it. Primary action goes last in `actions`. `inline` draws it in the page flow (gallery, tests).
 */
export function Dialog({
  title,
  children,
  actions,
  onClose,
  inline,
  className,
  testId,
  initialFocus,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  inline?: boolean;
  className?: string;
  testId?: string;
  /** CSS selector inside the dialog that should take focus first. */
  initialFocus?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (inline) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (root) {
      const first = (initialFocus ? root.querySelector<HTMLElement>(initialFocus) : null) ?? root.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? root).focus();
    }
    return () => opener?.focus?.();
  }, [inline, initialFocus]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const panel = (
    <div
      ref={ref}
      role="dialog"
      aria-modal={inline ? undefined : true}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-testid={testId}
      className={cx("we-modal", inline && "we-modal-inline", className)}
    >
      <h3 id={titleId}>{title}</h3>
      {children}
      {actions ? <div className="we-row">{actions}</div> : null}
    </div>
  );
  if (inline) return panel;
  return (
    <>
      <div className="we-scrim" aria-hidden="true" onClick={onClose} />
      {panel}
    </>
  );
}
