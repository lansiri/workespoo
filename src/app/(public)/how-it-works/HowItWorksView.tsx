import type { UiLang } from "@/contracts";
import { UI_LANG_LOCALES } from "@/lib/i18n";
import { howTexts, pageContent, type VoiceProcessor } from "./messages";
import type { HowStats } from "./stats";

/** Plain structure for the restyle: one h1, one h2 per section, a dl for the numbers. */
export function HowItWorksView({
  lang,
  voice,
  stats,
}: {
  lang: UiLang;
  voice: VoiceProcessor;
  stats: HowStats | null;
}) {
  const c = pageContent(lang, voice);
  const t = howTexts[lang];
  const locale = UI_LANG_LOCALES[lang];
  const int = (n: number) => new Intl.NumberFormat(locale).format(n);

  const rows: { key: string; label: string; value: string }[] = stats
    ? [
        { key: "open-postings", label: t.openPostings, value: int(stats.openPostings) },
        { key: "model-calls", label: t.modelCalls, value: int(stats.modelCalls) },
        {
          key: "first-word-median",
          label: t.firstWord,
          value:
            stats.firstWordMedianMs === null
              ? t.firstWordNone
              : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(stats.firstWordMedianMs / 1000)} ${t.unitSeconds}`,
        },
        { key: "picks-approved", label: t.picksApproved, value: int(stats.picksApproved) },
        { key: "picks-removed", label: t.picksRemoved, value: int(stats.picksRemoved) },
        { key: "intros-agreed", label: t.introsAgreed, value: int(stats.introsAgreed) },
        { key: "decisions-without-human", label: t.noHuman, value: int(0) },
      ]
    : [];

  return (
    <main lang={lang} style={{ maxWidth: "46rem", margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h1 data-testid="how-title">{c.title}</h1>
      <p>{c.intro}</p>
      {c.sections.map((s) => (
        <section key={s.heading} data-testid="how-section" style={{ marginTop: "1.5rem" }}>
          <h2>{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
      {stats ? (
        <section data-testid="how-section" style={{ marginTop: "1.5rem" }}>
          <h2>{t.numbersHeading}</h2>
          <p>{t.numbersIntro}</p>
          <dl data-testid="how-numbers">
            {rows.map((r) => (
              <div key={r.key} style={{ marginTop: "0.5rem" }}>
                <dt>{r.label}</dt>
                <dd data-testid="how-number" data-key={r.key}>
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
          <p>{t.noHumanNote}</p>
        </section>
      ) : null}
      <p style={{ marginTop: "1.5rem" }}>{c.credit}</p>
    </main>
  );
}
