"use client";

import { Button } from "@/components/we";
import { useMessages } from "@/lib/i18n/client";
import { errorCopy } from "@/lib/i18n/content";
import { interviewMessages } from "./messages";

/** Full-page message for a conversation that is gone, with one way forward. */
export function SessionEnded() {
  const e = useMessages(errorCopy);
  const m = useMessages(interviewMessages);
  return (
    <div className="we-message-page" data-testid="session-ended">
      <p>{e.sessionExpired}</p>
      <Button variant="primary" size="lg" href="/interview">
        {m.startNew}
      </Button>
    </div>
  );
}
