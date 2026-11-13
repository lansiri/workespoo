import { cx } from "./cx";
import { Icon } from "./icons";
import { Sticker } from "./Sticker";
import { Button } from "./Button";

export type ApproveBoxProps = {
  state: "ready" | "preparing" | "empty" | "approved";
  /** "7 notes kept · 1 removed". Counts of the person's own notes, for them only. */
  tally?: string;
  text: {
    sticker: string;
    title: string;
    help: string;
    approve: string;
    preparing: string;
    /** card.approve_empty */
    empty: string;
    /** "Approved. You can change your card at any time." */
    approved: string;
    /** "See jobs that fit your card →" */
    goToMatches: string;
  };
  matchesHref?: string;
  onApprove?: () => void;
  className?: string;
};

/** Step 1: approve the card. Ink border and shadow, sticker on the top edge, one large primary button. */
export function ApproveBox({ state, tally, text, matchesHref = "/matches", onApprove, className }: ApproveBoxProps) {
  return (
    <section className={cx("we-box we-approve-box", className)} aria-labelledby="we-approve-title">
      <Sticker>{text.sticker}</Sticker>
      <h3 id="we-approve-title">
        <span className="we-step-no" aria-hidden="true">1</span>
        {text.title}
      </h3>
      {state === "approved" ? (
        <>
          <p className="we-approved-line" data-testid="card-approved">
            <Icon name="check" />
            <span>{text.approved}</span>
          </p>
          <Button variant="ghost" href={matchesHref} data-testid="go-to-matches">
            {text.goToMatches}
          </Button>
        </>
      ) : (
        <>
          <p>{state === "empty" ? text.empty : text.help}</p>
          {tally ? <p className="we-tally">{tally}</p> : null}
          <Button variant="primary" size="lg" disabled={state !== "ready"} onClick={onApprove} data-testid="approve-card">
            {state === "preparing" ? text.preparing : text.approve}
          </Button>
        </>
      )}
    </section>
  );
}

/** Phone only: the fixed bottom bar with the tally and the approve button (or the matches link once approved). */
export function ApproveBar({ state, tally, text, matchesHref = "/matches", onApprove }: Pick<ApproveBoxProps, "state" | "tally" | "text" | "matchesHref" | "onApprove">) {
  return (
    <div className="we-cd-mbar">
      {tally && state !== "approved" ? <p className="we-tally">{tally}</p> : null}
      {state === "approved" ? (
        <Button variant="ghost" block href={matchesHref}>
          {text.goToMatches}
        </Button>
      ) : (
        <Button variant="primary" block disabled={state !== "ready"} onClick={onApprove}>
          {state === "preparing" ? text.preparing : text.approve}
        </Button>
      )}
    </div>
  );
}
