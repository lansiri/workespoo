import Link from "next/link";
import { getDb } from "@/db/client";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { DevDraftButton } from "@/features/needs/DevDraftButton";
import { devCompanies, devPostings } from "@/features/needs/dev";
import { needMessages } from "@/features/needs/messages";

export const dynamic = "force-dynamic";

function statusLabel(m: { statusDraft: string; statusConfirmed: string; statusStale: string }, status: string): string {
  if (status === "confirmed") return m.statusConfirmed.replace("{date}", "").trim();
  return status === "stale" ? m.statusStale : m.statusDraft;
}

export default async function DevS2Page() {
  const m = pick(needMessages, await getUiLang());
  const { organiser } = await getSession();
  if (!organiser) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">{m.devTitle}</h1>
        <p data-testid="dev-signin">{m.devSignIn}</p>
        <p>
          <Link href="/organiser">/organiser</Link>
        </p>
      </main>
    );
  }
  const db = getDb();
  const [postings, companies] = await Promise.all([devPostings(db), devCompanies(db)]);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">{m.devTitle}</h1>
      <h2 className="mb-2 text-lg font-medium">{m.devPostings}</h2>
      {postings.length === 0 ? (
        <p>{m.devNoPostings}</p>
      ) : (
        <ul className="space-y-4">
          {postings.map((p) => (
            <li key={p.jobId} data-testid="dev-posting" data-job-id={p.jobId}>
              <p>
                <strong>{p.title}</strong> · {p.employerName}
                {p.municipality ? ` · ${p.municipality}` : ""}
              </p>
              <p>
                {p.card ? (
                  <>
                    {m.devStatus}: {statusLabel(m, p.card.status)} · {m.devVersion}: {p.card.version} ·{" "}
                    <Link data-testid="dev-card-link" href={`/api/needs/${p.card.id}`}>
                      {m.devOpenCard}
                    </Link>
                    {p.card.companyToken ? (
                      <>
                        {" · "}
                        <Link data-testid="dev-company-link" href={`/c/${p.card.companyToken}/need/${p.card.id}`}>
                          {m.devOpenCompanyPage}
                        </Link>
                      </>
                    ) : null}
                  </>
                ) : (
                  m.devNoCard
                )}
              </p>
              <DevDraftButton jobId={p.jobId} companies={companies} hasCard={p.card !== null} m={m} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
