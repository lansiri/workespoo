import Link from "next/link";
import { getDb } from "@/db/client";
import { PasscodeForm } from "@/features/picks/PasscodeForm";
import { AUDIT_ACTIONS } from "@/contracts";
import { auditActionLabel, consoleMessages } from "@/features/picks/console-messages";
import { listAudit } from "@/features/picks/console";
import { organiserMessages } from "@/features/picks/messages";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Search = { action?: string | string[]; before?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const lang = await getUiLang();
  const o = pick(organiserMessages, lang);
  const m = pick(consoleMessages, lang);
  const session = await getSession();
  if (!session.organiser) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">{o.signInTitle}</h1>
        <PasscodeForm />
      </main>
    );
  }
  const params = await searchParams;
  const rawAction = first(params.action);
  const action = (AUDIT_ACTIONS as readonly string[]).includes(rawAction ?? "") ? (rawAction as (typeof AUDIT_ACTIONS)[number]) : null;
  const rawBefore = first(params.before);
  const before = rawBefore && /^\d{1,15}$/.test(rawBefore) ? Number(rawBefore) : null;
  const page = await listAudit(getDb(), { action, before });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <p>
        <Link href="/organiser">{o.overviewTitle}</Link>
      </p>
      <h1 className="text-2xl font-semibold">{m.auditTitle}</h1>
      <p>{m.auditIntro}</p>
      <form method="get" className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.auditFilterLabel}
          <select name="action" defaultValue={action ?? ""} className="rounded border px-2 py-1" data-testid="audit-filter">
            <option value="">{m.auditFilterAll}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {auditActionLabel(lang, a)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border px-3 py-1">
          {m.auditApply}
        </button>
      </form>
      {page.rows.length === 0 ? (
        <p>{m.auditEmpty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>{m.auditTime}</th>
              <th>{m.auditActor}</th>
              <th>{m.auditAction}</th>
              <th>{m.auditSubject}</th>
              <th>{m.auditDetail}</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((r) => (
              <tr key={r.id} data-testid="audit-row" data-action={r.action} className="align-top">
                <td>
                  <time dateTime={r.at}>{r.at.replace("T", " ").slice(0, 19)}</time>
                </td>
                <td>{r.actor}</td>
                <td>
                  {auditActionLabel(lang, r.action)}
                  {r.seeded ? <span className="ml-2 rounded border px-1 text-xs">{m.auditSeeded}</span> : null}
                </td>
                <td>
                  {r.subjectType} {r.subjectId}
                </td>
                <td>
                  <code className="break-all text-xs">{JSON.stringify(r.detail)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {page.nextBefore != null ? (
        <p>
          <Link href={`/organiser/audit?${new URLSearchParams({ ...(action ? { action } : {}), before: String(page.nextBefore) })}`}>
            {m.auditOlder}
          </Link>
        </p>
      ) : null}
    </main>
  );
}
