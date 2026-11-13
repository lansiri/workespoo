import type { ReactNode } from "react";
import { cx } from "./cx";
import { Button } from "./Button";
import { InterviewerMascot } from "./InterviewerMascot";

/**
 * Empty: a dashed box or ghost placeholders shaped like what will come, plus one plain sentence.
 * Never a bare "0", never people illustrations.
 */
export function EmptyState({ message, ghostShape, className, testId }: { message: string; ghostShape?: "chips" | "tiles" | "rows"; className?: string; testId?: string }) {
  return (
    <div className={cx("we-empty-state", className)} data-testid={testId}>
      {ghostShape === "chips" ? (
        <div className="we-ghosts" aria-hidden="true">
          {[150, 110, 180, 90].map((w) => (
            <span key={w} className="we-chip we-ghost" style={{ width: w }}>
              <i className="we-gm" />
            </span>
          ))}
        </div>
      ) : null}
      {ghostShape === "tiles" ? (
        <div className="we-ghost-tiles" aria-hidden="true">
          <span className="we-tile we-ghost" />
          <span className="we-tile we-ghost" />
        </div>
      ) : null}
      {ghostShape === "rows" ? (
        <div className="we-ghost-rows" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      <p>{message}</p>
    </div>
  );
}

/** Loading: the thinking mascot with its worded badge, or one muted line. Show code-rendered fallbacks first. */
export function LoadingState({ message, badgeLabel, className }: { message: string; badgeLabel?: string; className?: string }) {
  return (
    <div className={cx("we-loading-state", className)} role="status">
      {badgeLabel ? <InterviewerMascot state="thinking" size={96} badgeLabel={badgeLabel} /> : null}
      <p>{message}</p>
    </div>
  );
}

/** Error: calm, inline, says what still works and offers one action. Ink on paper with a 2 px danger left border. */
export function ErrorState({ message, action, className, testId }: { message: ReactNode; action?: { label: string; onClick?: () => void }; className?: string; testId?: string }) {
  return (
    <div className={cx("we-error-state", className)} role="alert" data-testid={testId}>
      <p>{message}</p>
      {action ? (
        <Button variant="ghost" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
