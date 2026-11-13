import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { company } from "@/db/schema";
import { devMessages } from "@/features/picks/devMessages";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A plain page for trying the picks flow by hand. Company links are shown only to a signed-in organiser. */
export default async function DevS3Page() {
  const m = pick(devMessages, await getUiLang());
  const { organiser } = await getSession();
  const companies = organiser
    ? await getDb()
        .select({ id: company.id, name: company.displayName, token: company.digestToken })
        .from(company)
        .where(eq(company.participating, true))
        .orderBy(company.displayName)
    : [];
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{m.title}</h1>
      <ul className="list-disc pl-6">
        <li>
          <Link href="/organiser">{m.overview}</Link>
        </li>
        <li>
          <Link href="/organiser/review">{m.review}</Link>
        </li>
      </ul>
      <h2 className="text-xl font-medium">{m.companies}</h2>
      {!organiser ? <p>{m.signedOut}</p> : null}
      {organiser && companies.length === 0 ? <p>{m.none}</p> : null}
      <ul className="list-disc pl-6">
        {companies.map((c) => (
          <li key={c.id}>
            {c.name}: <Link href={`/c/${c.token}`}>{m.open}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
