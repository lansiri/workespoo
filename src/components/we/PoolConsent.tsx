"use client";

import { useId, useState } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export type PoolConsentProps = {
  approved: boolean;
  /** null: not chosen yet. Never preselected. */
  inPool: boolean | null;
  onChange?: (inPool: boolean) => void;
  /** A save is in flight. */
  busy?: boolean;
  text: {
    title: string;
    body: string;
    yes: string;
    yesHelp: string;
    no: string;
    noHelp: string;
    /** "Approve your card first. Nothing is chosen for you." */
    locked: string;
    statusIn: string;
    statusOut: string;
    leave: string;
    leaveTitle: string;
    leaveBody: string;
    leaveConfirm: string;
    cancel: string;
  };
  className?: string;
};

/** Step 2: "Can Espoo suggest you to companies?" Both options start empty and stay locked until the card is approved. */
export function PoolConsent({ approved, inPool, onChange, busy, text, className }: PoolConsentProps) {
  const name = useId();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className={cx("we-box", className)} aria-labelledby={`${name}-t`}>
      <h3 id={`${name}-t`}>
        <span className="we-step-no" aria-hidden="true">2</span>
        {text.title}
      </h3>
      <p>{text.body}</p>
      <label className="we-choice">
        <input type="radio" name={name} disabled={!approved || busy} checked={inPool === true} onChange={() => onChange?.(true)} data-testid="pool-opt-in" />
        <span className="we-choice-text">
          <b>{text.yes}</b>
          <span>{text.yesHelp}</span>
        </span>
      </label>
      <label className="we-choice">
        <input type="radio" name={name} disabled={!approved || busy} checked={inPool === false} onChange={() => onChange?.(false)} data-testid="pool-opt-out" />
        <span className="we-choice-text">
          <b>{text.no}</b>
          <span>{text.noHelp}</span>
        </span>
      </label>
      {!approved ? (
        <p className="we-locked-note">
          <Icon name="lock" />
          <span>{text.locked}</span>
        </p>
      ) : null}
      {inPool !== null ? (
        <p className="we-pool-status" data-testid="pool-status">
          {inPool ? text.statusIn : text.statusOut}
        </p>
      ) : null}
      {inPool === true ? (
        <Button variant="quiet" className="we-leave" onClick={() => setConfirming(true)} disabled={busy} data-testid="pool-leave">
          {text.leave}
        </Button>
      ) : null}
      {confirming ? (
        <Dialog
          title={text.leaveTitle}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {text.cancel}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  onChange?.(false);
                }}
              >
                {text.leaveConfirm}
              </Button>
            </>
          }
        >
          <p>{text.leaveBody}</p>
        </Dialog>
      ) : null}
    </section>
  );
}
