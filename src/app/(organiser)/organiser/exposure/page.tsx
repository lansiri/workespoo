import { getDb } from "@/db/client";
import { EmptyState, PersonHandle, SeededDemoBanner } from "@/components/we";
import { SignInCard } from "@/features/picks/SignInCard";
import { buildExposure } from "@/features/picks/console";
import { consoleMessages } from "@/features/picks/console-messages";
import { organiserMessages } from "@/features/picks/messages";
import { hasSeededHistory } from "@/features/picks/seeded";
import { fmt, pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ExposurePage() {
  const lang = await getUiLang();
  const o = pick(organiserMessages, lang);
  const m = pick(consoleMessages, lang);
  const session = await getSession();
  if (!session.organiser) return <SignInCard title={o.signInTitle} badge={o.signInBadge} />;

  const db = getDb();
  const view = await buildExposure(db);
  const seeded = await hasSeededHistory(db);
  const bandTitle = {
    never: m.bandNever,
    few: m.bandFew,
    several: m.bandSeveral,
    many: m.bandMany,
  } as const;

  return (
    <div className="we-con">
      <div className="we-con-head">
        <div>
          <h1>{m.exposureTitle}</h1>
          <p>{m.exposureIntro}</p>
        </div>
        <span className="we-tag">{fmt(m.exposureWindow, { days: view.windowDays })}</span>
      </div>
      {seeded ? <SeededDemoBanner>{m.seededHistory}</SeededDemoBanner> : null}
      {view.poolSize === 0 ? (
        <EmptyState ghostShape="rows" message={m.exposureNoPool} />
      ) : (
        <p className="we-panel-note">{m.exposureSorted}</p>
      )}
      <div className="we-bands">
        {view.bands.map((b) => (
          <section key={b.band} className="we-band" data-testid="exposure-band" data-band={b.band}>
            <h2>{bandTitle[b.band]}</h2>
            <p className="we-band-n">{fmt(m.exposureBandPeople, { count: b.handles.length })}</p>
            {b.handles.length === 0 ? (
              <p className="we-band-empty">{m.exposureEmptyBand}</p>
            ) : (
              <ul>
                {b.handles.map((h) => (
                  <li key={h} data-testid="exposure-handle">
                    <PersonHandle
                      handle={h}
                      size="sm"
                      ariaLabel={fmt(o.handleAria, { handle: h })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
