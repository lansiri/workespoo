import Link from "next/link";
import type { CSSProperties } from "react";
import { pick } from "@/lib/i18n";
import type { UiLang } from "@/contracts";
import { comingSoonMessages } from "./messages";
import { LiveCounter } from "./LiveCounter";
import { CheerMascot, CrumpledCv, CvRobot, FilingCabinet, GlowMascot, LoweredMascot, VoidHole } from "./Scene";
import "./coming-soon.css";

const COUNTER_START = 1451191;

export function ComingSoon({ lang }: { lang: UiLang }) {
  const m = pick(comingSoonMessages, lang);
  const tryChars = (m.tryPre + m.tryBrand + m.tryPost).length;
  const ads = [
    { tag: m.a1Tag, role: m.a1Role, body: m.a1Body, stamp: m.a1Stamp },
    { tag: m.a2Tag, role: m.a2Role, body: m.a2Body, stamp: m.a2Stamp },
    { tag: m.a3Tag, role: m.a3Role, body: m.a3Body, stamp: m.a3Stamp },
  ];
  const tickerItems = [m.ticker1, m.ticker2];

  return (
    <div className="cs-page">
      <section className="cs-hero">
        <div className="cs-heroGrid" style={{ "--n": tryChars } as CSSProperties}>
          <span className="cs-badge">
            <i aria-hidden="true" />
            {m.badge}
          </span>
          <p className="cs-lul">{m.lul}</p>
          <h1 className="cs-h1" data-testid="coming-soon-headline">
            <span className="cs-lead">{m.headlineLead}</span>
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
            <p className="cs-kicker">{m.kicker}</p>
            <p className="cs-quote">{m.quote}</p>
          </div>
          <p className="cs-cta">
            <Link href="/interview" data-testid="start-link" className="cs-button">
              {m.peek}
              <span aria-hidden="true"> →</span>
            </Link>
          </p>
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

      <section className="cs-ads" aria-labelledby="cs-ads-title">
        <h2 id="cs-ads-title" className="cs-h2">
          {m.adsTitle}
        </h2>
        <p className="cs-adsNote">{m.adsNote}</p>
        <ul className="cs-adGrid">
          {ads.map((a, i) => (
            <li key={i} className="cs-ad">
              <span className="cs-adTag">{a.tag}</span>
              <h3 className="cs-adRole">{a.role}</h3>
              <p className="cs-adBody">{a.body}</p>
              <span className="cs-adStamp">{a.stamp}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cs-counterSection" aria-label={m.counterLabel}>
        <div className="cs-counterCard">
          <VoidHole label={m.voidAlt} />
          <div className="cs-counterText">
            <p className="cs-counterNumber">
              <LiveCounter start={COUNTER_START} />
            </p>
            <p className="cs-counterLabel">{m.counterLabel}</p>
            <p className="cs-counterNote">{m.counterNote}</p>
          </div>
        </div>
      </section>

      <section className="cs-serious">
        <div className="cs-seriousGrid">
          <figure className="cs-mFigure">
            <LoweredMascot label={m.mAlt} />
            <figcaption>{m.mNote}</figcaption>
          </figure>
          <div className="cs-seriousText">
            <h2 className="cs-seriousTitle">{m.realTitle}</h2>
            <p className="cs-seriousBody">{m.realBody}</p>
            <p className="cs-seriousBody">{m.realListen}</p>
            <div className="cs-chat">
              <GlowMascot label={m.glowAlt} />
              <p className="cs-chatBubble">{m.glowHello}</p>
            </div>
          </div>
        </div>
        <p className="cs-kind">{m.realKind}</p>
        <p className="cs-smallprint">{m.smallprint}</p>
      </section>
    </div>
  );
}
