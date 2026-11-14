"use client";

import { Button } from "@/components/we";
import type { NeedMessagesText } from "./messages";
import { useNeedActions } from "./useNeedActions";

/** The one main action of the page: confirm the need. */
export function ConfirmControl(props: { needCardId: string; token: string; m: NeedMessagesText; readOnly: boolean }) {
  const actions = useNeedActions(props.needCardId, props.token, props.m);
  return (
    <div className="we-confirm-row">
      <Button
        variant="primary"
        size="lg"
        disabled={actions.busy || props.readOnly}
        onClick={() => void actions.confirm()}
        data-testid="confirm-need"
      >
        {actions.busy ? props.m.confirming : props.m.confirmNeed}
      </Button>
      {actions.error ? (
        <p className="we-inline-error" role="alert" data-testid="confirm-error">
          {actions.error}
        </p>
      ) : null}
    </div>
  );
}
