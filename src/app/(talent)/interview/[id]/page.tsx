import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { InterviewRoom } from "@/features/interview/InterviewRoom";
import { loadInterviewView } from "@/features/interview/views";
import { hasConsent } from "@/lib/consent";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InterviewPage(props: PageProps<"/interview/[id]">) {
  const { id } = await props.params;
  const { talentId } = await getSession();
  if (!talentId) redirect("/interview");
  const view = await loadInterviewView(getDb(), id);
  if (!view || view.talentId !== talentId) notFound();
  // Voice goes to a third-party vendor, so only the recorded consent counts, never the URL.
  const voiceConsented = await hasConsent(getDb(), { subjectType: "talent", subjectId: talentId, kind: "voice_vendor" });
  const { interviewId, ended, transcript, signals, coverage } = view;
  return (
    <InterviewRoom
      initial={{ interviewId, ended, transcript, signals, coverage }}
      mode={view.mode}
      voiceConsented={voiceConsented}
    />
  );
}
