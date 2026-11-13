import Link from "next/link";
import { getDb } from "@/db/client";
import { listRecentInterviews } from "@/features/interview/views";
import { interviewMessages } from "@/features/interview/messages";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Organiser-only list of recent interviews: no names, no languages, no input modes. */
export default async function DevS1Page() {
  const m = pick(interviewMessages, await getUiLang());
  const { organiser } = await getSession();
  if (!organiser) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-6">
        <h1 className="text-xl font-semibold">{m.devHeading}</h1>
        <p data-testid="dev-needs-organiser">{m.devNeedsOrganiser}</p>
        <Link href="/organiser">{m.devOrganiserLink}</Link>
      </main>
    );
  }
  const items = await listRecentInterviews(getDb());
  const status = { active: m.statusActive, completed: m.statusCompleted, abandoned: m.statusAbandoned };
  const mode = { express: m.modeExpressShort, full: m.modeFullShort };
  return (
    <main className="mx-auto max-w-4xl space-y-3 p-6">
      <h1 className="text-xl font-semibold">{m.devHeading}</h1>
      {items.length === 0 ? (
        <p>{m.devEmpty}</p>
      ) : (
        <table data-testid="interview-list" className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>{m.devId}</th>
              <th>{m.devMode}</th>
              <th>{m.devStatus}</th>
              <th>{m.devQuestions}</th>
              <th>{m.devCoverage}</th>
              <th>{m.devSignals}</th>
              <th>{m.devStarted}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} data-testid="interview-row">
                <td>{i.id}</td>
                <td>{mode[i.mode]}</td>
                <td>{status[i.status]}</td>
                <td>{i.questionsAsked}</td>
                <td>
                  {i.topicsTouched} / {i.topicsTotal}
                </td>
                <td>{i.signalCount}</td>
                <td>{i.startedAt.replace("T", " ").slice(0, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
