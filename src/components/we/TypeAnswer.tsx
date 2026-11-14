"use client";

import type { FormEvent } from "react";
import { cx } from "./cx";
import { Button } from "./Button";

export type TypeAnswerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** True while the answer is being sent. */
  sending?: boolean;
  /** Text of the inline error when sending failed. */
  error?: string;
  retryLabel?: string;
  onRetry?: () => void;
  /** Visible placeholder and the screen-reader label, for example "Write your answer". */
  placeholder: string;
  sendLabel: string;
  sendingLabel: string;
  /**
   * While the person holds the talk button, the field shows the words being recognised instead of the
   * draft: read-only, with this placeholder until the first words arrive. Releasing the button sends them.
   */
  listening?: boolean;
  listeningPlaceholder?: string;
  id?: string;
  className?: string;
};

/** Always-available text alternative: pill input with Send inside. Enter sends. */
export function TypeAnswer({
  value,
  onChange,
  onSend,
  sending,
  error,
  retryLabel,
  onRetry,
  placeholder,
  sendLabel,
  sendingLabel,
  listening,
  listeningPlaceholder,
  id = "we-type-answer",
  className,
}: TypeAnswerProps) {
  function submit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() && !sending && !listening) onSend();
  }
  return (
    <div className={cx("we-type-answer", className)}>
      <form className={cx("we-type-box", listening && "we-listening")} onSubmit={submit}>
        <label className="we-sr-only" htmlFor={id}>
          {placeholder}
        </label>
        <input
          id={id}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={listening}
          placeholder={listening && listeningPlaceholder ? listeningPlaceholder : placeholder}
          aria-busy={sending || undefined}
          data-testid="answer-input"
        />
        <Button type="submit" variant="primary" disabled={!value.trim() || sending || listening} data-testid="send-answer">
          {sending ? sendingLabel : sendLabel}
        </Button>
      </form>
      {error ? (
        <p className="we-inline-error" role="alert" data-testid="send-failed">
          <span>{error}</span>
          {onRetry && retryLabel ? (
            <button type="button" className="we-linkbtn" onClick={onRetry}>
              {retryLabel}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
