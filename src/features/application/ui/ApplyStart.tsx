"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StartApplicationResponse, type StartApplicationRequest, type UiLang } from "@/contracts";
import { Button, ChoiceCard, ErrorState, Field, InterviewerMascot, MaskedDemoBanner, Select } from "@/components/we";
import { fmt, UI_LANGS, UI_LANG_NAMES } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import type { ApplyJob } from "../requirements";
import { applyMessages } from "../messages-talent";
import "./apply.css";

/** Nothing starts without the tick. */
export function canStartApplication(s: { ticked: boolean; busy: boolean }): boolean {
  return s.ticked && !s.busy;
}

/** The body `POST /api/application` takes. The consent is only ever `true`: the request cannot be built without the tick. */
export function startRequest(jobId: string, uiLang: UiLang): StartApplicationRequest {
  return { jobId, uiLang, consent: { assessment: true } };
}

type Problem = "failed" | "no_card" | "already" | "unknown_job";

export type ApplyStartJob = Pick<ApplyJob, "jobId" | "title" | "companyName" | "masked" | "requirements">;

/**
 * `/apply/new?job=...`: what happens with the answers, in five points, and the one tick that
 * starts the job interview. The tick starts unchecked.
 */
export function ApplyStart({ job }: { job: ApplyStartJob }) {
  const m = useMessages(applyMessages);
  const uiLang = useUiLang();
  const router = useRouter();
  const [ticked, setTicked] = useState(false);
  const [lang, setLang] = useState<UiLang>(uiLang);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const canStart = canStartApplication({ ticked, busy });

  async function start() {
    if (!ticked) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(startRequest(job.jobId, lang)),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        const code = body?.error?.code;
        setProblem(code === "no_approved_card" ? "no_card" : code === "already_applied" ? "already" : code === "unknown_job" ? "unknown_job" : "failed");
        setBusy(false);
        return;
      }
      const started = StartApplicationResponse.safeParse(await res.json());
      if (!started.success) throw new Error("unexpected start response");
      router.push(`/apply/${started.data.applicationId}`);
    } catch {
      setProblem("failed");
      setBusy(false);
    }
  }

  const problemText = problem === "no_card" ? m.startNoCard : problem === "already" ? m.startAlready : problem === "unknown_job" ? m.startUnknownJob : m.startFailed;

  return (
    <div className="we-consent-wrap">
      <form
        className="we-consent-card"
        data-testid="apply-start-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (canStart) void start();
        }}
      >
        <span className="we-tape" aria-hidden="true" />
        {job.masked ? <MaskedDemoBanner lead={m.maskedLead} text={m.maskedText} /> : null}
        <header className="we-consent-head">
          <InterviewerMascot state="idle" badgeLabel="" hideBadge />
          <div>
            <p className="we-ap-start-company">{fmt(m.startAt, { company: job.companyName })}</p>
            <h1>{fmt(m.startTitle, { title: job.title })}</h1>
          </div>
        </header>

        <ul className="we-points" data-testid="apply-points-list">
          <li className="we-lead">{m.startPoint1}</li>
          <li>{m.startPoint2}</li>
          <li>{m.startPoint3}</li>
          <li>{m.startPoint4}</li>
          <li>{m.startPoint5}</li>
        </ul>

        {job.requirements.length > 0 ? (
          <section className="we-ap-will-ask">
            <h2>{m.startWillAsk}</h2>
            <ul>
              {job.requirements.map((r) => (
                <li key={r.requirementId}>{r.text}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <fieldset className="we-consent-section">
          <legend className="we-sr-only">{m.startConsentLegend}</legend>
          <ChoiceCard
            type="checkbox"
            title={m.startTick}
            data-testid="apply-consent"
            checked={ticked}
            onChange={(ev) => setTicked(ev.target.checked)}
          />
        </fieldset>

        <Field className="we-consent-field" label={m.startLanguage} hint={m.startLanguageHelp}>
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} data-testid="apply-language" value={lang} onChange={(ev) => setLang(ev.target.value as UiLang)}>
              {UI_LANGS.map((code) => (
                <option key={code} value={code}>
                  {UI_LANG_NAMES[code]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {problem ? (
          <ErrorState
            testId="apply-start-error"
            message={problemText}
            action={problem === "failed" ? { label: m.tryAgain, onClick: () => void start() } : undefined}
          />
        ) : null}
        {problem === "already" || problem === "unknown_job" ? (
          <p className="we-ap-start-links">
            <Button href="/apply">{m.startAlreadyLink}</Button>
          </p>
        ) : null}

        <div className="we-consent-start">
          {!canStart && !busy ? <p className="we-start-reason">{m.startReason}</p> : null}
          <Button type="submit" variant="primary" size="lg" data-testid="apply-begin" disabled={!canStart}>
            {busy ? m.starting : m.startButton}
          </Button>
        </div>
      </form>
    </div>
  );
}
