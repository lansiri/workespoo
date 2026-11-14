import { ApplyJobsView } from "@/features/application/ui/ApplyJobsView";

export const dynamic = "force-dynamic";

/** The event's jobs the person can apply for. The view loads them itself. */
export default function ApplyPage() {
  return <ApplyJobsView />;
}
