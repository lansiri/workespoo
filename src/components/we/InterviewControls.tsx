import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * The controls region pinned to the bottom of the interview stage: JobsMini (phone), HoldToTalk, "or",
 * TypeAnswer, TypeInsteadButton (phone), and the hints row. Pure layout. When the interview is done only the
 * "Check my notes" link remains and the region carries data-testid="interview-done".
 */
export function InterviewControls({
  done,
  typing,
  jobsMini,
  talk,
  orLabel,
  typeBox,
  typeButton,
  hints,
  className,
}: {
  done?: boolean;
  /** Phone: the type box is open above the talk button. */
  typing?: boolean;
  jobsMini?: ReactNode;
  talk: ReactNode;
  orLabel: string;
  typeBox?: ReactNode;
  typeButton?: ReactNode;
  hints?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("we-iv-controls", done && "we-done", className)} data-testid={done ? "interview-done" : "interview-controls"}>
      {done ? null : jobsMini}
      <div className={cx("we-talk-row", typing && "we-typing")}>
        {talk}
        {done ? null : (
          <>
            <span className="we-or">{orLabel}</span>
            <div className="we-type-slot">{typeBox}</div>
            {typeButton}
          </>
        )}
      </div>
      {done ? null : hints ? <div className="we-iv-hints">{hints}</div> : null}
    </div>
  );
}
