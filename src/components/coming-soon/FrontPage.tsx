import type { CSSProperties } from "react";
import { pick } from "@/lib/i18n";
import type { UiLang } from "@/contracts";
import { Button } from "@/components/we/Button";
import { Sticker } from "@/components/we/Sticker";
import { comingSoonMessages } from "./messages";
import { frontMessages } from "./front-messages";
import { CheerMascot, CrumpledCv, CvRobot, FilingCabinet } from "./Scene";
import "./coming-soon.css";
import "./front-page.css";

/**
 * The front door. The owner's headline, the LUL and the illustrations stay; the "coming soon"
 * lines became the fact that the product is here and one call to action. Below the fold, three
 * short sections built with the kit's tokens: how it works, what companies and organisers get,
 * and what the AI does not do. The original joke page is kept at /coming-soon.
 */
export function FrontPage({ lang }: { lang: UiLang }) {
  const m = pick(comingSoonMessages, lang);
  const f = pick(frontMessages, lang);
  const tryChars = (m.tryPre + m.tryBrand + m.tryPost).length;
  const tickerItems = [m.ticker1, f.ticker2];
  const steps = [
    { title: f.step1Title, body: f.step1Body },
    { title: f.step2Title, body: f.step2Body },
    { title: f.step3Title, body: f.step3Body },
  ];
  const nots = [
    { title: f.not1Title, body: f.not1Body },
    { title: f.not2Title, body: f.not2Body },
    { title: f.not3Title, body: f.not3Body },
  ];

  return (
    <div className="cs-page sp-page" lang={lang}>
      <section className="cs-hero">
        <div className="cs-heroGrid" style={{ "--n": tryChars } as CSSProperties}>
          <span className="cs-badge" data-testid="front-badge">
            <i aria-hidden="true" />
            {f.badge}
          </span>
          <p className="cs-lul" aria-hidden="true">
            {m.lul}
          </p>
          <h1 className="cs-h1" data-testid="coming-soon-headline">
            <span className="cs-lead">{m.headlineLead}</span>{" "}
            <span className="cs-try">
              {m.tryPre}
              <span className="cs-brand">
                {m.tryBrand}
                <svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true" focusable="false" className="cs-underline">
                  <path d="M4 13C50 4 90 17 140 9C190 2 240 15 296 6" fill="none" stroke="#FFB627" strokeWidth="8" strokeLinecap="round" />
                </svg>
              </span>
              {m.tryPost}
            </span>
          </h1>

          <div className="cs-scene" role="group" aria-label={m.sceneAlt}>
            <div className="cs-robotCell">
              <CvRobot m={m} />
            </div>
            <div className="cs-mascotCell">
              <CheerMascot m={m} />
            </div>
            <div className="cs-cabinetCell">
              <FilingCabinet m={m} />
            </div>
            <CrumpledCv m={m} />
          </div>

          <div className="cs-sub">
            <p className="cs-kicker">{f.kicker}</p>
            <p className="cs-quote">{f.quote}</p>
          </div>
          <div className="cs-cta sp-cta">
            <Button variant="primary" size="lg" href="/interview" icon="arrow" data-testid="start-link">
              {f.cta}
            </Button>
            <p className="sp-ctaNote">{f.ctaNote}</p>
          </div>
        </div>
      </section>

      <div className="cs-tickerWrap">
        <div className="cs-ticker">
          <div className="cs-tickerTrack">
            {[0, 1].map((half) => (
              <div key={half} className="cs-tickerHalf" aria-hidden={half === 1 ? true : undefined} data-dup={half === 1 ? "" : undefined}>
                {[...tickerItems, ...tickerItems].map((t, i) => (
                  <span key={i} className="cs-tickerItem">
                    {t}
                    <b aria-hidden="true"> ✦ </b>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="sp-section" aria-labelledby="sp-steps-title" data-testid="front-steps">
        <h2 id="sp-steps-title" className="sp-h2">
          {f.stepsTitle}
        </h2>
        <ol className="sp-steps">
          {steps.map((s, i) => (
            <li key={i} className="sp-step">
              <span className="sp-stepNum" aria-hidden="true">
                {i + 1}
              </span>
              <span className="we-sr-only">{`${f.stepsLabel} ${i + 1}: `}</span>
              <h3 className="sp-h3">{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="sp-section sp-sectionTint" aria-labelledby="sp-gain-title" data-testid="front-gain">
        <h2 id="sp-gain-title" className="sp-h2">
          {f.gainTitle}
        </h2>
        <div className="sp-two">
          <div className="sp-panel">
            <h3 className="sp-h3">{f.companiesTitle}</h3>
            <p>{f.companiesBody}</p>
          </div>
          <div className="sp-panel">
            <h3 className="sp-h3">{f.organisersTitle}</h3>
            <p>{f.organisersBody}</p>
          </div>
        </div>
      </section>

      <section className="sp-section" aria-labelledby="sp-not-title" data-testid="front-not">
        <div className="sp-notHead">
          <h2 id="sp-not-title" className="sp-h2">
            {f.notTitle}
          </h2>
          <Sticker flat>{f.nothingScored}</Sticker>
        </div>
        <ul className="sp-nots">
          {nots.map((n, i) => (
            <li key={i} className="sp-not">
              <h3 className="sp-h3">{n.title}</h3>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
        <div className="sp-end">
          <Button variant="primary" size="lg" href="/interview" icon="arrow">
            {f.cta}
          </Button>
          <Button variant="ghost" size="lg" href="/how-it-works">
            {f.how}
          </Button>
        </div>
        <p className="sp-proto">{f.prototype}</p>
      </section>
    </div>
  );
}
