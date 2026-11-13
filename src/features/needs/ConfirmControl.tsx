"use client";

import type { NeedMessagesText } from "./messages";
import { useNeedActions } from "./useNeedActions";

export function ConfirmControl(props: { needCardId: string; token: string; m: NeedMessagesText; readOnly: boolean }) {
  const actions = useNeedActions(props.needCardId, props.token, props.m);
  return (
    <div>
      <button
        type="button"
        data-testid="confirm-need"
        disabled={actions.busy || props.readOnly}
        onClick={() => void actions.confirm()}
      >
        {actions.busy ? props.m.confirming : props.m.confirmNeed}
      </button>
      {actions.error ? <p role="alert">{actions.error}</p> : null}
    </div>
  );
}
