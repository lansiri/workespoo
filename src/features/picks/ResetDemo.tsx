"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import { consoleMessages } from "./console-messages";

type Outcome = { kind: "done"; people: number; companies: number } | { kind: "none" } | { kind: "failed" };

/** Two steps: the button asks, the confirm button does it. Shows what happened in plain words. */
export function ResetDemo() {
  const m = useMessages(consoleMessages);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function reset() {
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/organiser/reset-demo", { method: "POST" });
      if (!res.ok) {
        setOutcome({ kind: "failed" });
        return;
      }
      const body = (await res.json()) as { restored: boolean; people: number; companies: number };
      setOutcome(body.restored ? { kind: "done", people: body.people, companies: body.companies } : { kind: "none" });
    } catch {
      setOutcome({ kind: "failed" });
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      {asking ? (
        <>
          <p>{m.resetDemoWarning}</p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void reset()} disabled={busy} data-testid="reset-demo-confirm">
              {busy ? m.resetDemoWorking : m.resetDemoConfirm}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAsking(false)} disabled={busy}>
              {m.resetDemoCancel}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button type="button" variant="outline" onClick={() => setAsking(true)} data-testid="reset-demo">
            {m.resetDemo}
          </Button>
        </div>
      )}
      {outcome ? (
        <p role="status" data-testid="reset-demo-result">
          {outcome.kind === "done"
            ? fmt(m.resetDemoDone, { people: outcome.people, companies: outcome.companies })
            : outcome.kind === "none"
              ? m.resetDemoNoSnapshot
              : m.resetDemoFailed}
        </p>
      ) : null}
    </section>
  );
}
