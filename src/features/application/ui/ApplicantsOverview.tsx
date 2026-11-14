import type { UiLang } from "@/contracts";
import { Button, EmptyState } from "@/components/we";
import { fmt, pick } from "@/lib/i18n";
import { formatWhen, rankedMessages } from "../messages-organiser";
import type { listJobsWithApplicants } from "../rank";
import "./ranked.css";

type Jobs = Awaited<ReturnType<typeof listJobsWithApplicants>>;

/** The event's jobs with how many applicants each has and where the approved list stands. */
export function ApplicantsOverview({ jobs, lang }: { jobs: Jobs; lang: UiLang }) {
  const m = pick(rankedMessages, lang);
  return (
    <div className="we-rk">
      <h1>{m.overviewTitle}</h1>
      <p className="we-rk-lead">{m.overviewIntro}</p>
      {jobs.length === 0 ? (
        <EmptyState message={m.overviewEmpty} ghostShape="rows" />
      ) : (
        <ul className="we-rk-jobs">
          {jobs.map((j) => {
            const state = j.approvedAt ? (j.changedSincePublished ? m.jobChanged : fmt(m.jobApproved, { time: formatWhen(j.approvedAt, lang) })) : m.jobNotApproved;
            return (
              <li key={j.jobId} className="we-rk-job" data-testid="applicants-job" data-job-id={j.jobId}>
                <div>
                  <h3>{fmt(m.overviewJob, { company: j.companyName, title: j.title })}</h3>
                  <p>
                    {fmt(m.jobApplicants, { n: j.applicants })} · {fmt(m.jobPending, { n: j.pendingAssessment })}
                  </p>
                  <p>{state}</p>
                </div>
                <Button variant="ghost" href={`/organiser/applicants/${j.jobId}`}>
                  {m.openList}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
