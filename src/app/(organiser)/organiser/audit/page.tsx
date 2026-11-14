import { getDb } from "@/db/client";
import { AUDIT_ACTIONS } from "@/contracts";
import { Button, EmptyState, Field, SeededDemoBanner, Select } from "@/components/we";
import { SignInCard } from "@/features/picks/SignInCard";
import { auditActionLabel, consoleMessages } from "@/features/picks/console-messages";
import { listAudit } from "@/features/picks/console";
import { organiserMessages } from "@/features/picks/messages";
import { hasSeededHistory } from "@/features/picks/seeded";
import { pick, UI_LANG_LOCALES } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Search = { action?: string | string[]; before?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type C = ReturnType<typeof pick<typeof consoleMessages.en>>;

/** The actor kind in the page's language, then the stored id: "Person · tal_abc", "Organiser", "AI agent · analyst". */
function actorText(c: C, actor: string): string {
  const [kind, ...rest] = actor.split(":");
  const id = rest.join(":");
  const label =
    kind === "organiser"
      ? c.actorOrganiser
      : kind === "system"
        ? c.actorSystem
        : kind === "agent"
          ? c.actorAgent
          : kind === "talent"
            ? c.actorTalent
            : kind === "company"
              ? c.actorCompany
              : kind;
  return id ? `${label} · ${id}` : label;
}

function detailText(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

function subjectText(c: C, type: string, id: string): string {
  const labels: Record<string, string> = {
    talent: c.subjectTalent,
    interview: c.subjectInterview,
    signal_card: c.subjectSignalCard,
    job: c.subjectJob,
    company: c.subjectCompany,
    need_card: c.subjectNeedCard,
    digest: c.subjectDigest,
    pick: c.subjectPick,
    intro: c.subjectIntro,
    agenda_item: c.subjectAgendaItem,
    consent: c.subjectConsent,
    pool: c.subjectPool,
    system: c.subjectSystem,
  };
  return `${labels[type] ?? type} · ${id}`;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const lang = await getUiLang();
  const o = pick(organiserMessages, lang);
  const m = pick(consoleMessages, lang);
  const session = await getSession();
  if (!session.organiser) return <SignInCard title={o.signInTitle} badge={o.signInBadge} />;

  const params = await searchParams;
  const rawAction = first(params.action);
  const action = (AUDIT_ACTIONS as readonly string[]).includes(rawAction ?? "")
    ? (rawAction as (typeof AUDIT_ACTIONS)[number])
    : null;
  const rawBefore = first(params.before);
  const before = rawBefore && /^\d{1,15}$/.test(rawBefore) ? Number(rawBefore) : null;
  const db = getDb();
  const page = await listAudit(db, { action, before });
  const seeded = page.rows.some((r) => r.seeded) || (await hasSeededHistory(db));
  const when = new Intl.DateTimeFormat(UI_LANG_LOCALES[lang], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Helsinki",
  });

  return (
    <div className="we-con">
      <div className="we-con-head">
        <div>
          <h1>{m.auditTitle}</h1>
          <p>{m.auditIntro}</p>
        </div>
      </div>
      {seeded ? <SeededDemoBanner>{m.seededHistory}</SeededDemoBanner> : null}

      <form method="get" className="we-filter">
        <Field label={m.auditFilterLabel}>
          {({ id }) => (
            <Select id={id} name="action" defaultValue={action ?? ""} data-testid="audit-filter">
              <option value="">{m.auditFilterAll}</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {auditActionLabel(lang, a)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" variant="ghost">
          {m.auditApply}
        </Button>
      </form>

      {page.rows.length === 0 ? (
        <EmptyState ghostShape="rows" message={m.auditEmpty} />
      ) : (
        <section className="we-panel" aria-label={m.auditTitle}>
          <div className="we-table-wrap">
            <table className="we-table we-stack">
              <thead>
                <tr>
                  <th scope="col">{m.auditTime}</th>
                  <th scope="col">{m.auditActor}</th>
                  <th scope="col">{m.auditAction}</th>
                  <th scope="col">{m.auditSubject}</th>
                  <th scope="col">{m.auditDetail}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.id} data-testid="audit-row" data-action={r.action}>
                    <td>
                      <time dateTime={r.at}>{when.format(new Date(r.at))}</time>
                    </td>
                    <td data-label={m.auditActor}>{actorText(m, r.actor)}</td>
                    <td data-label={m.auditAction}>
                      <span>{auditActionLabel(lang, r.action)}</span>{" "}
                      <code className="we-code">{r.action}</code>
                      {r.seeded ? (
                        <>
                          {" "}
                          <span className="we-syn">{m.auditSeeded}</span>
                        </>
                      ) : null}
                    </td>
                    <td data-label={m.auditSubject}>
                      {subjectText(m, r.subjectType, r.subjectId)}
                    </td>
                    <td data-label={m.auditDetail}>
                      <code className="we-detail" title={detailText(r.detail)}>
                        {Object.keys(r.detail).length ? detailText(r.detail) : "–"}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {page.nextBefore != null ? (
        <div className="we-older">
          <Button
            variant="ghost"
            href={`/organiser/audit?${new URLSearchParams({ ...(action ? { action } : {}), before: String(page.nextBefore) })}`}
          >
            {m.auditOlder}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
