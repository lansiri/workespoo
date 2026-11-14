"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState, MaskedDemoBanner, Tag } from "@/components/we";
import { useMessages } from "@/lib/i18n/client";
import type { ApplicationStatus } from "@/contracts";
import type { ApplyJob } from "../requirements";
import { applyMessages } from "../messages-talent";
import "./apply.css";

type M = (typeof applyMessages)["en"];

/** The one action of a job, by the state of the person's own application to it. */
export function jobAction(job: Pick<ApplyJob, "jobId" | "application">): { kind: "start" | "continue" | "open"; href: string; label: keyof M; testId: string } {
  const app = job.application;
  if (!app) return { kind: "start", href: `/apply/new?job=${encodeURIComponent(job.jobId)}`, label: "actionStart", testId: "apply-start" };
  const status: ApplicationStatus = app.status;
  if (status === "interviewing") return { kind: "continue", href: `/apply/${app.id}`, label: "actionContinue", testId: "apply-continue" };
  if (status === "review") return { kind: "continue", href: `/apply/${app.id}`, label: "actionReview", testId: "apply-continue" };
  return { kind: "open", href: `/apply/${app.id}`, label: "actionOpen", testId: "apply-open" };
}

/** The jobs, one box each. Presentational: the data comes in as props. */
export function ApplyJobsList({ jobs }: { jobs: ApplyJob[] }) {
  const m = useMessages(applyMessages);
  return (
    <ul className="we-ap-jobs">
      {jobs.map((job) => {
        const action = jobAction(job);
        return (
          <li key={job.jobId} className="we-ap-job" data-testid="apply-job" data-job-id={job.jobId}>
            {job.masked ? <MaskedDemoBanner lead={m.maskedLead} text={m.maskedText} /> : null}
            <span className="we-ap-job-company">{job.companyName}</span>
            <h2>{job.title}</h2>
            {job.summary ? <p className="we-ap-job-summary">{job.summary}</p> : null}
            <h3>{m.adAsks}</h3>
            <ul className="we-ap-job-reqs">
              {job.requirements.map((r) => (
                <li key={r.requirementId} data-kind={r.kind}>
                  <span>{r.text}</span>
                  <Tag>{r.kind === "must" ? m.tagMust : m.tagNice}</Tag>
                </li>
              ))}
            </ul>
            <div className="we-ap-job-action">
              <Button variant={action.kind === "open" ? "ghost" : "primary"} href={action.href} data-testid={action.testId}>
                {m[action.label]}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "signed_out" }
  | { status: "no_card" }
  | { status: "ready"; jobs: ApplyJob[] };

async function loadJobs(signal: AbortSignal): Promise<State> {
  try {
    const res = await fetch("/api/application/jobs", { cache: "no-store", signal });
    if (res.status === 401 || res.status === 403) return { status: "signed_out" };
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      return body?.error?.code === "no_approved_card" ? { status: "no_card" } : { status: "error" };
    }
    const body = (await res.json()) as ApplyJob[] | { jobs: ApplyJob[] };
    return { status: "ready", jobs: Array.isArray(body) ? body : body.jobs };
  } catch {
    return { status: "error" };
  }
}

/** `/apply`: the event's jobs with the person's own state for each. */
export function ApplyJobsView() {
  const m = useMessages(applyMessages);
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => {
    setState({ status: "loading" });
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    void loadJobs(abort.signal).then((next) => {
      if (!abort.signal.aborted) setState(next);
    });
    return () => abort.abort();
  }, [tick]);

  const head = (
    <div className="we-page-head">
      <h1>{m.jobsTitle}</h1>
      <p>{m.jobsIntro}</p>
    </div>
  );

  let body;
  if (state.status === "loading") body = <LoadingState message={m.jobsLoading} />;
  else if (state.status === "error") body = <ErrorState message={m.jobsLoadFailed} action={{ label: m.tryAgain, onClick: reload }} />;
  else if (state.status === "signed_out" || state.status === "no_card") {
    const signedOut = state.status === "signed_out";
    body = (
      <div className="we-ap-need" data-testid={signedOut ? "apply-need-interview" : "apply-need-card"}>
        <p>{signedOut ? m.needInterview : m.needCard}</p>
        <Button variant="primary" href={signedOut ? "/interview" : "/card"}>
          {signedOut ? m.needInterviewLink : m.needCardLink}
        </Button>
      </div>
    );
  } else if (state.jobs.length === 0) body = <EmptyState message={m.jobsEmpty} ghostShape="rows" testId="apply-empty" />;
  else body = <ApplyJobsList jobs={state.jobs} />;

  return (
    <div className="we-page">
      {head}
      {body}
    </div>
  );
}

/** An application that is gone, or not the person's: one plain message, saying nothing about which. */
export function ApplicationGone() {
  const m = useMessages(applyMessages);
  return (
    <div className="we-message-page" data-testid="apply-gone">
      <p>{m.goneText}</p>
      <Button variant="primary" size="lg" href="/apply">
        {m.goneLink}
      </Button>
    </div>
  );
}
