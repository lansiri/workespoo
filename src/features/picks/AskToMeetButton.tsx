"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMessages } from "@/lib/i18n/client";
import { companyErrorLine, companyMessages } from "./messages";

/**
 * Asks to meet one person from one approved pick: one request per call. The page shows the
 * confirmation dialog first (the kit's pick card); this holds the call and its error line.
 */
export function useAskToMeet(token: string, pickId: string) {
  const m = useMessages(companyMessages);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pickId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        setError(companyErrorLine(m, body?.error?.code ?? null));
      }
    } catch {
      setError(m.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, send };
}
