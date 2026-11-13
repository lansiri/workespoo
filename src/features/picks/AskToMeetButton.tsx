"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import { companyErrorLine, companyMessages } from "./messages";

/** Asks to meet one person from one approved pick. Confirms first; one request per click. */
export function AskToMeetButton(props: { token: string; pickId: string; needTitle: string }) {
  const m = useMessages(companyMessages);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: props.token, pickId: props.pickId }),
      });
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        setError(companyErrorLine(m, body?.error?.code ?? null));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" onClick={() => setConfirming(true)} data-testid="ask-to-meet">
        {m.askToMeet}
      </Button>
    );
  }
  return (
    <div role="alertdialog" aria-label={m.askToMeet} className="flex flex-col gap-2" data-testid="ask-to-meet-confirm">
      <p>{fmt(m.askConfirm, { need: props.needTitle })}</p>
      {error ? <p role="alert">{fmt(m.askFailed, { message: error })}</p> : null}
      <div className="flex gap-2">
        <Button type="button" onClick={() => void send()} disabled={busy} data-testid="ask-to-meet-send">
          {m.askSend}
        </Button>
        <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
          {m.askCancel}
        </Button>
      </div>
    </div>
  );
}
