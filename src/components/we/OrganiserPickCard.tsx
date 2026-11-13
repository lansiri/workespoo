import type { ReactNode } from "react";
import { cx } from "./cx";
import { PersonHandle, SyntheticTag } from "./PersonHandle";

export type OrganiserPickCardProps = {
  pickId: string;
  handle: string;
  handleAria: string;
  /** The company-view summary, 14 px. */
  summary: string;
  /** "Why today: Not suggested to anyone for 3 days" */
  whyToday: string;
  /** "This person asked to meet you", for talent-initiated requests. */
  origin?: string;
  /** "Synthetic person" */
  syntheticLabel?: string;
  status: "undecided" | "approved" | "removed";
  selected?: boolean;
  /** "This pick was drafted against an older card. Approve is off until it is redrafted." */
  outOfDate?: string;
  /** ReasonList with variant organiser. */
  reasons: ReactNode;
  notMentioned?: ReactNode;
  /** DecisionControls. */
  controls: ReactNode;
  className?: string;
};

/**
 * One suggested person for one need in the review queue, decided on its own. Three columns: handle and summary,
 * reasons, decision. Approved rows fold to one line when not selected; removed rows fold but keep the reason visible.
 */
export function OrganiserPickCard(p: OrganiserPickCardProps) {
  return (
    <article
      className={cx("we-pick", p.selected && "we-sel", p.status !== "undecided" && "we-done", p.className)}
      data-testid="review-pick"
      data-pick-id={p.pickId}
      data-status={p.status}
      aria-current={p.selected ? "true" : undefined}
    >
      <div className="we-hd">
        <PersonHandle handle={p.handle} size="sm" ariaLabel={p.handleAria} />
        <p>{p.summary}</p>
        <span className="we-why-today">{p.whyToday}</span>
        {p.syntheticLabel ? <SyntheticTag>{p.syntheticLabel}</SyntheticTag> : null}
        {p.origin ? <p className="we-origin">{p.origin}</p> : null}
      </div>
      <div className="we-pick-mid">
        {p.reasons}
        {p.notMentioned}
      </div>
      <div className="we-pick-side">
        {p.controls}
        {p.outOfDate ? (
          <p className="we-out-of-date" data-testid="pick-out-of-date">
            {p.outOfDate}
          </p>
        ) : null}
      </div>
    </article>
  );
}
