"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Field, Input } from "@/components/we";
import { useMessages } from "@/lib/i18n/client";
import { organiserMessages } from "./messages";

export function PasscodeForm() {
  const m = useMessages(organiserMessages);
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // On a slow connection the passcode may be typed before the page is interactive. The text
  // stays in the field, but nothing told React about it, so the button stayed off and typing
  // the same text again did not help. Take over what is already in the field.
  useEffect(() => {
    const typed = formRef.current?.querySelector<HTMLInputElement>('[data-testid="passcode-input"]')?.value ?? "";
    if (typed) setPasscode(typed);
  }, []);

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
    <form onSubmit={submit} ref={formRef}>
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
