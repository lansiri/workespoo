"use client";

import { cx } from "./cx";
import { Icon } from "./icons";
import { Button } from "./Button";

export type DecisionControlsProps = {
  status: "undecided" | "approved" | "removed";
  /** Removed: the reason text, shown under the label. */
  reason?: string;
  /** Out of date picks cannot be approved until redrafted. */
  approveDisabled?: boolean;
  onApprove?: () => void;
  onRemove?: () => void;
  onUndo?: () => void;
  text: {
    approve: string;
    remove: string;
    undo: string;
    /** "Decide this person on their own." */
    hint: string;
    /** "Approved" */
    approved: string;
    /** "Will be in today's list for this company." */
    approvedNote: string;
    /** "Removed" */
    removed: string;
  };
  keys?: { approve: string; remove: string; undo: string };
  className?: string;
};

/** Approve or remove one person. Two identical ghost buttons side by side, so nothing nudges. No approve-all. */
export function DecisionControls({ status, reason, approveDisabled, onApprove, onRemove, onUndo, text, keys = { approve: "A", remove: "R", undo: "U" }, className }: DecisionControlsProps) {
  if (status === "undecided") {
    return (
      <div className={cx("we-acts", className)}>
        <Button variant="ghost" icon="check" kbd={keys.approve} disabled={approveDisabled} onClick={onApprove} data-testid="pick-approve">
          {text.approve}
        </Button>
        <Button variant="ghost" icon="minus" kbd={keys.remove} onClick={onRemove} data-testid="pick-remove">
          {text.remove}
        </Button>
        <p className="we-hint">{text.hint}</p>
      </div>
    );
  }
  return (
    <div className={cx("we-decided", status === "approved" && "we-ok", className)}>
      <span className="we-lab" data-testid="pick-status" data-status={status}>
        <Icon name={status === "approved" ? "check" : "minus"} />
        {status === "approved" ? text.approved : text.removed}
      </span>
      {status === "approved" ? <span className="we-why">{text.approvedNote}</span> : reason ? <span className="we-why">{reason}</span> : null}
      <Button variant="quiet" kbd={keys.undo} onClick={onUndo} data-testid="pick-undo">
        {text.undo}
      </Button>
    </div>
  );
}
