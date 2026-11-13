import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";

export type JobPostingCardProps = {
  jobId: string;
  title: string;
  employer: string;
  place: string;
  /** "Closes 12 Dec", already formatted. */
  closes?: string;
  url: string;
  /** "Source: Työmarkkinatori" */
  source: string;
  /** "Open the posting" (the arrow is added) */
  openLabel: string;
  /** ReasonLines (variant feed), 1 to 3, in a ReasonList. Shown first, as code renders them. */
  reasons?: ReactNode;
  /** NotMentionedList, or "Requirements not read yet." */
  notMentioned?: ReactNode;
  className?: string;
};

/** One real open job in the person's feed. No percentages, no "top match", no ordering label. */
export function JobPostingCard(p: JobPostingCardProps) {
  return (
    <article className={cx("we-posting", p.className)} data-testid="job-match" data-job-id={p.jobId}>
      <div className="we-posting-top">
        <span className="we-ic" aria-hidden="true">
          <Icon name="briefcase" />
        </span>
        <div>
          <h3>{p.title}</h3>
          <p className="we-emp">
            <b>{p.employer}</b>
          </p>
          <p className="we-meta">
            <span>
              <Icon name="pin" />
              {p.place}
            </span>
            {p.closes ? (
              <span>
                <Icon name="calendar" />
                {p.closes}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      {p.reasons}
      {p.notMentioned}
      <div className="we-posting-foot">
        <span className="we-src" data-testid="source-attribution">
          {p.source}
        </span>
        <a className="we-btn we-btn-ghost" href={p.url} target="_blank" rel="noopener noreferrer" data-testid="job-link">
          <span>{p.openLabel}</span>
          <Icon name="external" />
        </a>
      </div>
    </article>
  );
}

