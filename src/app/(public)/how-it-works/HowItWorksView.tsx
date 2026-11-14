import type { UiLang } from "@/contracts";
import { UI_LANG_LOCALES } from "@/lib/i18n";
import { howTexts, pageContent, type VoiceProcessor } from "./messages";
import { Sticker } from "@/components/we/Sticker";
import type { HowStats } from "./stats";
import "./how-it-works.css";

/** One h1, one h2 per section, a dl for the numbers. Single column, 760 px. */
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
    <article lang={lang} className="hw-page" data-testid="how-it-works">
      <header className="hw-head">
        <h1 data-testid="how-title" className="hw-title">
          {c.title}
        </h1>
        <Sticker>{t.notOfficial}</Sticker>
      </header>
      <p className="hw-intro">{c.intro}</p>
      {c.sections.map((s, i) => (
        // The second shared section is "In the conversation, the AI takes notes. It does not judge.": the page's loudest line.
        <section key={s.heading} data-testid="how-section" className={i === 1 ? "hw-section hw-key" : "hw-section"}>
          <h2 className="hw-h">{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
      {stats ? (
        <section data-testid="how-section" className="hw-section">
          <h2 className="hw-h">{t.numbersHeading}</h2>
          <p>{t.numbersIntro}</p>
          <dl data-testid="how-numbers" className="hw-numbers">
            {rows.map((r) => (
              <div key={r.key} className="hw-number">
                <dt>{r.label}</dt>
                <dd data-testid="how-number" data-key={r.key}>
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="hw-note">{t.noHumanNote}</p>
        </section>
      ) : null}
      <p className="hw-credit">{c.credit}</p>
    </article>
  );
}
