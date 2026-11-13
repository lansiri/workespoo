import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

/**
 * The three-column interview room: transcript | stage | notes and jobs. Each column scrolls on its own and the
 * controls never leave the screen. 761 to 1099 px and presenter mode hide the transcript column. Phone: one column
 * in the order stage, notes, transcript.
 */
export function InterviewLayout({ convo, stage, notes, presenter, stageLabel, height, className }: { convo?: ReactNode; stage: ReactNode; notes: ReactNode; presenter?: boolean; stageLabel: string; height?: string; className?: string }) {
  return (
    <div className={cx("we-iv", presenter && "we-presenter", className)}>
      <div className="we-iv-main" style={height ? ({ "--iv-h": height } as CSSProperties) : undefined}>
        {convo ? <div className="we-iv-convo">{convo}</div> : null}
        <section className="we-iv-stage-col" aria-label={stageLabel}>
          {stage}
        </section>
        <aside className="we-iv-notes">{notes}</aside>
      </div>
    </div>
  );
}
