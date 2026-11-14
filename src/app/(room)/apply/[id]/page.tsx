import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { SiteShell } from "@/components/site/SiteShell";
import { getApplyJob, loadOwnApplication } from "@/features/application";
import { ApplicationGone } from "@/features/application/ui/ApplyJobsView";
import { ApplyStart } from "@/features/application/ui/ApplyStart";
import { ApplicationResult } from "@/features/application/ui/ApplicationResult";
import { ApplicationReview, ApplicationSent } from "@/features/application/ui/ApplicationReview";
import { JobInterviewRoom, JobRoomChromeProvider, JobRoomProgress, JobRoomStopButton } from "@/features/application/ui/JobInterviewRoom";
import { activeConsentTextVersion, VOICE_OWN_SERVER_TEXT_VERSION } from "@/lib/consent";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * One page for the whole life of an application, chosen by its status: the start screen for a
 * job (`/apply/new?job=<jobId>`), the room while interviewing, the review, the "sent" page while
 * the rating is made, and the result. Not theirs, or gone: one plain page that says nothing about which.
 */
export default async function ApplicationPage(props: PageProps<"/apply/[id]">) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const { talentId } = await getSession();
  if (!talentId) redirect("/interview");
  const db = getDb();

  const gone = (
    <SiteShell audience="talent">
      <ApplicationGone />
    </SiteShell>
  );

  if (id === "new") {
    const jobId = typeof search.job === "string" ? search.job : null;
    const job = jobId ? await getApplyJob(db, talentId, jobId) : null;
    if (!job) return gone;
    if (job.application) redirect(`/apply/${job.application.id}`);
    return (
      <SiteShell audience="talent">
        <ApplyStart job={{ jobId: job.jobId, title: job.title, companyName: job.companyName, masked: job.masked, requirements: job.requirements }} />
      </SiteShell>
    );
  }

  const application = await loadOwnApplication(db, talentId, id);
  if (!application) return gone;

  if (application.status === "interviewing") {
    // Only the recorded consent counts for voice, never the URL. The grant also says which wording
    // the person agreed to: under the own-server wording their speech goes to our server or nowhere.
    const voiceWording = await activeConsentTextVersion(db, { subjectType: "talent", subjectId: talentId, kind: "voice_vendor" });
    const total = application.plan.requirements.length;
    // This page sits outside the talent layout so that it can fill the top bar itself
    // (question progress, Stop) through SiteShell's headerSlot and actions.
    return (
      <JobRoomChromeProvider total={total} initialCurrent={Math.max(1, Math.min(application.state.cursor + 1, total))} initialFinished={false}>
        <SiteShell audience="talent" headerSlot={<JobRoomProgress />} actions={<JobRoomStopButton />}>
          <JobInterviewRoom
            initial={{ id: application.id, plan: application.plan, state: application.state, turns: application.turns, status: application.status }}
            voiceConsented={voiceWording !== null}
            voiceOwnServer={voiceWording === VOICE_OWN_SERVER_TEXT_VERSION}
          />
        </SiteShell>
      </JobRoomChromeProvider>
    );
  }

  return (
    <SiteShell audience="talent">
      {application.status === "review" ? (
        <ApplicationReview application={application} />
      ) : application.status === "submitted" ? (
        <ApplicationSent application={application} />
      ) : (
        <ApplicationResult application={application} />
      )}
    </SiteShell>
  );
}
