import { cx } from "./cx";

/** "Question 2 of 5" with five dashes (done pine, current sun, rest line). The dashes are decorative. */
export function InterviewProgress({ label, step, total = 5, finished, className }: { label: string; step: number; total?: number; finished?: boolean; className?: string }) {
  return (
    <span className={cx("we-iv-progress", className)} data-testid="interview-progress">
      <b>{label}</b>
      <span className="we-iv-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={cx(i < step || finished ? "we-done" : i === step ? "we-now" : "")} />
        ))}
      </span>
    </span>
  );
}
