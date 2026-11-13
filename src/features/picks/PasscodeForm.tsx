"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
      <label htmlFor="passcode" className="text-sm font-medium">
        {m.passcode}
      </label>
      <Input
        id="passcode"
        type="password"
        autoComplete="current-password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        data-testid="passcode-input"
      />
      {failed ? (
        <p role="alert" data-testid="passcode-error">
          {m.signInFailed}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || passcode.length === 0} data-testid="passcode-submit">
        {m.signIn}
      </Button>
    </form>
  );
}
