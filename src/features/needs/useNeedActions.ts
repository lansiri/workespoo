"use client";

import { useCallback, useState } from "react";
import type { NeedMessagesText } from "./messages";

export type AnswerChoice = "keep" | "make_nice" | "reworded" | "remove";

/** Posts the company's actions to the Need Card API and reloads the page when one succeeds. */
export function useNeedActions(needCardId: string, token: string, m: NeedMessagesText) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = useCallback(
    async (path: "answer" | "confirm", body: unknown) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/needs/${encodeURIComponent(needCardId)}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-company-token": token },
          body: JSON.stringify(body ?? {}),
        });
        if (res.ok) {
          window.location.reload();
          return;
        }
        const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
        setError(
          code === "protected_text_native"
            ? `${m.errorProtectedText} ${m.errorProtectedHint}`
            : code === "protected_text"
              ? m.errorProtectedText
              : m.errorGeneric,
        );
      } catch {
        setError(m.errorGeneric);
      } finally {
        setBusy(false);
      }
    },
    [needCardId, token, m],
  );

  return {
    busy,
    error,
    answer: (requirementId: string, choice: AnswerChoice, text?: string) =>
      post("answer", { requirementId, choice, ...(text !== undefined ? { text } : {}) }),
    confirm: () => post("confirm", {}),
  };
}
