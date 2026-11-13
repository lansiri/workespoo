"use client";

import { useState } from "react";
import type { NeedMessagesText } from "./messages";

export function DevDraftButton(props: {
  jobId: string;
  companies: Array<{ id: string; displayName: string }>;
  hasCard: boolean;
  m: NeedMessagesText;
}) {
  const { m } = props;
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/needs/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: props.jobId, companyId: companyId || null }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      setError(m.errorGeneric);
    } catch {
      setError(m.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <label>
        {m.devCompany}{" "}
        <select
          data-testid="dev-company"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">{m.devNoCompany}</option>
          {props.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </label>{" "}
      <button type="button" data-testid="draft-need-card" disabled={busy} onClick={() => void draft()}>
        {busy ? m.devDrafting : props.hasCard ? m.devRedraft : m.devDraft}
      </button>
      {error ? <span role="alert"> {error}</span> : null}
    </span>
  );
}
