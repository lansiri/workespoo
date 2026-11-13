import Link from "next/link";
import { getDb } from "@/db/client";
import { PasscodeForm } from "@/features/picks/PasscodeForm";
import { buildExposure } from "@/features/picks/console";
import { consoleMessages } from "@/features/picks/console-messages";
import { organiserMessages } from "@/features/picks/messages";
import { fmt, pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ExposurePage() {
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
  const view = await buildExposure(getDb());
  const bandTitle = { never: m.bandNever, few: m.bandFew, several: m.bandSeveral, many: m.bandMany } as const;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <p>
        <Link href="/organiser">{o.overviewTitle}</Link>
      </p>
      <h1 className="text-2xl font-semibold">{m.exposureTitle}</h1>
      <p>{m.exposureIntro}</p>
      {view.poolSize === 0 ? <p>{m.exposureNoPool}</p> : <p>{m.exposureSorted}</p>}
      {view.bands.map((b) => (
        <section key={b.band} data-testid="exposure-band" data-band={b.band} className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {bandTitle[b.band]} <span className="text-sm font-normal">({fmt(m.exposureBandPeople, { count: b.handles.length })})</span>
          </h2>
          {b.handles.length === 0 ? (
            <p className="text-sm">{m.exposureEmptyBand}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {b.handles.map((h) => (
                <li key={h} data-testid="exposure-handle" className="rounded border px-2 py-0.5 text-sm">
                  {h}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
