"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/components/we";
import { useMessages } from "@/lib/i18n/client";
import { organiserMessages } from "./messages";

export function PasscodeForm() {
  const m = useMessages(organiserMessages);
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/organiser/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) router.refresh();
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label={m.passcode}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            value={passcode}
            invalid={failed}
            aria-describedby={failed ? "passcode-error" : describedBy}
            onChange={(e) => setPasscode(e.target.value)}
            data-testid="passcode-input"
          />
        )}
      </Field>
      {failed ? (
        <p id="passcode-error" className="we-err" role="alert" data-testid="passcode-error">
          {m.signInFailed}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        block
        disabled={busy || passcode.length === 0}
        data-testid="passcode-submit"
      >
        {m.signIn}
      </Button>
    </form>
  );
}
