import type { UiLang } from "@/contracts";
import { Button, EmptyState, Icon, MaskedDemoBanner } from "@/components/we";
import { fmt, pick as pickText } from "@/lib/i18n";
import { longDay } from "./company-format";
import { CompanyPickView } from "./CompanyPickView";
import type { CompanyPageData, CompanyPick } from "./company-view";
import { companyMessages } from "./messages";

type Messages = (typeof companyMessages)["en"];

/** A line with the handle marked, so it never breaks across two lines. */
function withHandle(template: string, handle: string, vars: Record<string, string>) {
  return template.split("{handle}").flatMap((part, i, all) => {
    const text = fmt(part, vars);
    return i < all.length - 1 ? [{ text, handle: false }, { text: handle, handle: true }] : [{ text, handle: false }];
  });
}

/** Requests in flight or agreed, one line each. Handles only: a name appears on the card after both agreed. */
function MeetingsBox({ picks, m, lang }: { picks: CompanyPick[]; m: Messages; lang: UiLang }) {
  const lines = picks.flatMap((p) => {
    if (p.intro?.status === "awaiting_talent") {
      return [{ id: p.id, parts: withHandle(m.meetingWaiting, p.card.handle, { date: longDay(p.intro.expiresAt, lang) }) }];
    }
    if (p.intro?.status === "accepted") return [{ id: p.id, parts: withHandle(m.meetingAgreed, p.card.handle, {}) }];
    return [];
  });
  return (
    <section className="we-box" aria-labelledby="meetings-title" data-testid="meetings-box">
      <h3 id="meetings-title">{m.meetingsTitle}</h3>
      {lines.length === 0 ? (
        <p>{m.meetingsEmpty}</p>
      ) : (
        <ul className="we-meet-list">
          {lines.map((l) => (
            <li key={l.id}>{l.parts.map((x, i) => (x.handle ? <span key={i} style={{ whiteSpace: "nowrap" }}>{x.text}</span> : x.text))}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The company's page, drawn from a payload built field by field in `company-view.ts`. */
export function CompanyDigestView(props: { data: CompanyPageData; token: string; lang: UiLang }) {
  const { data, token, lang } = props;
  const m = pickText(companyMessages, lang);
  const groups = data.digest?.groups ?? [];
  const allPicks = groups.flatMap((g) => g.picks);
  const lead =
    allPicks.length === 0
      ? null
      : fmt(allPicks.length === 1 ? m.leadOne : m.leadMany, {
          n: allPicks.length,
          need: groups.length === 1 ? groups[0].title : m.leadAllNeeds,
        });

  return (
    <div className="we-page we-company-page">
      <MaskedDemoBanner lead={fmt(m.bannerTitle, { company: data.company.displayName })} text={m.bannerBody} prototypeLine={m.bannerPrototype} />

      <header className="we-page-head">
        <h1>{data.digest ? fmt(m.picksTitle, { date: longDay(data.digest.date, lang) }) : m.picksTitleNone}</h1>
        {data.digest && lead ? (
          <p>
            <b>
              {lead} {m.noOrder}.
            </b>{" "}
            {m.howItWorks}
          </p>
        ) : null}
      </header>

      <div className="we-two-col">
        <section aria-label={m.picksTitleNone}>
          {data.digest ? (
            groups.map((g) => (
              <div key={g.needCardId} className="we-pick-group">
                {groups.length > 1 ? <h2>{g.title}</h2> : null}
                {g.nobodyRelates ? <EmptyState message={fmt(m.nobodyRelates, { need: g.title })} ghostShape="rows" /> : null}
                {!g.nobodyRelates && g.picks.length === 0 ? <EmptyState message={fmt(m.noApproved, { need: g.title })} ghostShape="rows" /> : null}
                {g.picks.length > 0 ? (
                  <ul className="we-pick-list">
                    {g.picks.map((p) => (
                      <CompanyPickView key={p.id} pick={p} token={token} needTitle={g.title} lang={lang} />
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState message={m.notPublished} ghostShape="tiles" testId="not-published" />
          )}
        </section>

        <aside className="we-rail">
          {data.needs.map((n) => (
            <section key={n.id} className="we-need-box" aria-labelledby={`need-${n.id}`}>
              <span className="we-label">{m.yourNeeds}</span>
              <h3 id={`need-${n.id}`} style={{ marginTop: 6 }}>
                {n.title}
              </h3>
              <p className="we-summary">{n.summary}</p>
              <p className="we-src" style={{ marginTop: 6 }}>
                {m.needDraftedNote}
              </p>
              <p style={{ marginTop: 10 }}>
                <span className={n.status === "confirmed" ? "we-status-chip we-ok" : "we-status-chip"}>
                  {n.status === "confirmed" ? <Icon name="check" /> : null}
                  {n.status === "confirmed" ? m.needStatusConfirmed : m.needStatusDraft}
                </span>
              </p>
              <p className="we-rail-fine">{m.mustHaves}</p>
              <Button variant="ghost" block href={`/c/${token}/need/${n.id}`} data-testid="need-link">
                {m.needOpen}
              </Button>
            </section>
          ))}
          <MeetingsBox picks={allPicks} m={m} lang={lang} />
        </aside>
      </div>
    </div>
  );
}

/** A link that does not open: a neutral page that says nothing about why. */
export function ExpiredLink({ lang }: { lang: UiLang }) {
  const m = pickText(companyMessages, lang);
  return (
    <div className="we-page we-company-page" data-testid="link-expired">
      <MaskedDemoBanner lead={m.expiredBannerLead} text={m.expiredBannerBody} prototypeLine={m.bannerPrototype} />
      <header className="we-page-head">
        <h1>{m.expiredTitle}</h1>
        <p>{m.expiredBody}</p>
      </header>
    </div>
  );
}
