"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { Sticker } from "./Sticker";
import { Button } from "./Button";
import { Slot } from "./Slot";
import { Field, Input } from "./FormFields";

export type IntroStatus = "pending" | "accepted" | "declined" | "expired" | "waiting";

export type IntroRequestProps = {
  introId: string;
  status: IntroStatus;
  /** "Demo company 11 would like to meet you about Warehouse and scanner support." */
  heading: string;
  /** Bold lead, "Your name stays hidden unless you accept." */
  lead: string;
  /** Need summary under the lead. */
  summary?: string;
  /** ReasonLines (variant intro) in a ReasonList. */
  reasons?: ReactNode;
  /** Accepted: the meeting. */
  slot?: { time: string; place: string };
  /** Accepted: the company's own sentence, "{company} now sees your name and your own words on your card." */
  acceptedNote?: string;
  /** Open the form straight away (gallery, tests). */
  initialForm?: boolean;
  onAccept?: (v: { displayName: string; contact: string }) => void;
  onDecline?: () => void;
  agendaHref?: string;
  text: {
    sticker: string;
    whyTitle: string;
    /** Pending: "Waiting for your answer. Please answer by 4 Dec." (formatted) */
    waiting: string;
    accept: string;
    decline: string;
    nameLabel: string;
    nameHelp: string;
    contactLabel: string;
    contactHelp: string;
    share: string;
    cancel: string;
    /** "You both said yes." */
    accepted: string;
    openAgenda: string;
    declined: string;
    expired: string;
    waitingOrganiser: string;
  };
  className?: string;
};

/** A company's request to meet. Accept and Decline are two equal ghost buttons: nothing nudges. */
export function IntroRequest(p: IntroRequestProps) {
  const [form, setForm] = useState(Boolean(p.initialForm));
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const t = p.text;
  return (
    <section className={cx("we-intro", p.className)} data-testid="intro-request" data-intro-id={p.introId} aria-label={p.heading}>
      <Sticker>{t.sticker}</Sticker>
      <h2>{p.heading}</h2>
      <p className="we-lead">
        <b>{p.lead}</b>
        {p.summary ? ` ${p.summary}` : ""}
      </p>
      {p.status === "pending" && p.reasons ? (
        <div className="we-intro-why">
          <span className="we-label">{t.whyTitle}</span>
          {p.reasons}
        </div>
      ) : null}
      {p.status === "pending" ? (
        <>
          <p className="we-status-line we-wait" data-testid="intro-status" data-status="pending">
            <Icon name="clock" />
            <span>{t.waiting}</span>
          </p>
          {form ? (
            <form
              className="we-intro-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && contact.trim()) p.onAccept?.({ displayName: name.trim(), contact: contact.trim() });
              }}
            >
              <Field label={t.nameLabel} hint={t.nameHelp} required>
                {(f) => <Input id={f.id} aria-describedby={f.describedBy} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-testid="intro-name" />}
              </Field>
              <Field label={t.contactLabel} hint={t.contactHelp} required>
                {(f) => <Input id={f.id} aria-describedby={f.describedBy} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" data-testid="intro-contact" />}
              </Field>
              <div className="we-row">
                <Button type="submit" variant="primary" disabled={!name.trim() || !contact.trim()} data-testid="intro-confirm">
                  {t.share}
                </Button>
                <Button variant="ghost" onClick={() => setForm(false)}>
                  {t.cancel}
                </Button>
              </div>
            </form>
          ) : (
            <div className="we-intro-actions">
              <Button variant="ghost" size="lg" icon="check" onClick={() => setForm(true)} data-testid="intro-accept">
                {t.accept}
              </Button>
              <Button variant="ghost" size="lg" icon="x" onClick={p.onDecline} data-testid="intro-decline">
                {t.decline}
              </Button>
            </div>
          )}
        </>
      ) : null}
      {p.status === "accepted" ? (
        <div data-testid="intro-status" data-status="accepted">
          <p className="we-status-line we-ok">
            <Icon name="check" />
            <span>{t.accepted}</span>
          </p>
          {p.slot ? <Slot time={p.slot.time} place={p.slot.place} /> : null}
          {p.acceptedNote ? <p className="we-lead we-after">{p.acceptedNote}</p> : null}
          {p.agendaHref ? (
            <div className="we-intro-actions">
              <Button variant="ghost" href={p.agendaHref}>
                {t.openAgenda}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {p.status === "declined" ? (
        <p className="we-status-line" data-testid="intro-status" data-status="declined">
          <Icon name="minus" />
          <span>{t.declined}</span>
        </p>
      ) : null}
      {p.status === "expired" ? (
        <p className="we-status-line" data-testid="intro-status" data-status="expired">
          <Icon name="clock" />
          <span>{t.expired}</span>
        </p>
      ) : null}
      {p.status === "waiting" ? (
        <p className="we-status-line we-wait" data-testid="intro-status" data-status="waiting">
          <Icon name="clock" />
          <span>{t.waitingOrganiser}</span>
        </p>
      ) : null}
    </section>
  );
}
