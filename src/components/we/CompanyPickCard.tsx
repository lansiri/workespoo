"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { AiTag } from "./Tag";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { PersonHandle, SyntheticTag } from "./PersonHandle";
import { Slot } from "./Slot";

export type CompanyPickIntro =
  | { status: "none" }
  | { status: "requested"; /** "Request sent. Waiting for the person to answer (until 4 Dec)." */ waiting: string }
  | { status: "talent" }
  | { status: "declined" }
  | { status: "expired"; text: string }
  | { status: "revealed"; name: string; contact: string; slot?: { time: string; place: string } };

export type CompanyPickCardProps = {
  pickId: string;
  handle: string;
  handleAria: string;
  syntheticLabel: string;
  /** The company-view summary, in Fredoka 22. */
  summary: string;
  /** Talent-initiated: "This person asked to meet you". */
  askedToMeet?: string;
  /** "Written by AI from this person's own words and approved by them. Not a quote, not a verified fact." */
  aiLabel: string;
  aiTag: string;
  /** ReasonList with variant company. */
  reasons: ReactNode;
  notMentioned?: ReactNode;
  intro: CompanyPickIntro;
  onAsk?: () => void;
  onWithdraw?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  text: {
    ask: string;
    /** "Their name stays hidden unless they accept." */
    askNote: string;
    confirmTitle: string;
    confirmBody: string;
    send: string;
    cancel: string;
    withdraw: string;
    accept: string;
    decline: string;
    /** "This person chose not to meet this time." */
    declined: string;
    /** "You both agreed to meet." */
    both: string;
  };
  className?: string;
};

/** The reveal band, shown only after both sides agreed: name, contact, handle and the meeting. */
export function RevealBlock({ name, contact, both, handle, handleAria, syntheticLabel, slot }: { name: string; contact: string; both: string; handle: string; handleAria: string; syntheticLabel: string; slot?: { time: string; place: string } }) {
  return (
    <div className="we-reveal" data-testid="revealed-block">
      <p className="we-both">
        <Icon name="check" />
        <span>{both}</span>
      </p>
      <p className="we-name" data-testid="revealed-name">
        {name}
      </p>
      <p className="we-contact" data-testid="revealed-contact">
        {contact}
      </p>
      <div className="we-row">
        <PersonHandle handle={handle} size="sm" ariaLabel={handleAria} />
        <SyntheticTag>{syntheticLabel}</SyntheticTag>
        {slot ? <Slot time={slot.time} place={slot.place} /> : null}
      </div>
    </div>
  );
}

/**
 * One approved person on the company's digest. Before consent: handle, AI-labelled summary, reasons, what was not
 * mentioned, and one primary action. After both sides agreed: the reveal band, and each reason adds the person's own words.
 * No digits except the handle, dates and times; the page shuffles the order per digest.
 */
export function CompanyPickCard(p: CompanyPickCardProps) {
  const [confirming, setConfirming] = useState(false);
  const revealed = p.intro.status === "revealed" ? p.intro : null;
  const t = p.text;
  return (
    <article className={cx("we-pick-c", revealed && "we-revealed", p.className)} data-testid="pick-card" data-pick-id={p.pickId}>
      {revealed ? (
        <RevealBlock name={revealed.name} contact={revealed.contact} both={t.both} handle={p.handle} handleAria={p.handleAria} syntheticLabel={p.syntheticLabel} slot={revealed.slot} />
      ) : (
        <div className="we-hd">
          <PersonHandle handle={p.handle} ariaLabel={p.handleAria} />
          <SyntheticTag>{p.syntheticLabel}</SyntheticTag>
          {p.askedToMeet ? <span className="we-asked">{p.askedToMeet}</span> : null}
        </div>
      )}
      <p className="we-headline">{p.summary}</p>
      <p className="we-ai-small">
        <AiTag>{p.aiTag}</AiTag>
        <span>{p.aiLabel}</span>
      </p>
      {p.reasons}
      {p.notMentioned}
      <div className="we-act" data-testid="intro-status" data-status={p.intro.status}>
        {p.intro.status === "none" ? (
          <>
            <Button variant="primary" onClick={() => setConfirming(true)} data-testid="ask-to-meet">
              {t.ask}
            </Button>
            <span className="we-src">{t.askNote}</span>
          </>
        ) : null}
        {p.intro.status === "requested" ? (
          <>
            <span className="we-status-line we-wait">
              <Icon name="clock" />
              <span>{p.intro.waiting}</span>
            </span>
            <Button variant="quiet" onClick={p.onWithdraw}>
              {t.withdraw}
            </Button>
          </>
        ) : null}
        {p.intro.status === "talent" ? (
          <>
            <Button variant="ghost" size="lg" icon="check" onClick={p.onAccept}>
              {t.accept}
            </Button>
            <Button variant="ghost" size="lg" icon="x" onClick={p.onDecline}>
              {t.decline}
            </Button>
          </>
        ) : null}
        {p.intro.status === "declined" ? <span className="we-src">{t.declined}</span> : null}
        {p.intro.status === "expired" ? <span className="we-src">{p.intro.text}</span> : null}
      </div>
      {confirming ? (
        <Dialog
          title={t.confirmTitle}
          onClose={() => setConfirming(false)}
          testId="ask-to-meet-confirm"
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {t.cancel}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirming(false);
                  p.onAsk?.();
                }}
                data-testid="ask-to-meet-send"
              >
                {t.send}
              </Button>
            </>
          }
        >
          <p>{t.confirmBody}</p>
        </Dialog>
      ) : null}
    </article>
  );
}
