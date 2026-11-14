"use client";

import { useState } from "react";
import { cx } from "./cx";

export type NotMentionedItem = { text: string; statutory?: boolean };

/**
 * Requirements the conversation did not cover, without implying anything is missing: dashed box, dashed pills,
 * never red, never a count, no MUST label beside a person.
 */
export function NotMentionedList({
  items,
  audience,
  text,
  className,
  limit,
}: {
  items: NotMentionedItem[] | null;
  audience: "person" | "organiser" | "company";
  text: {
    /** "Not mentioned in the conversation" (person: "In your conversation") */
    label: string;
    /** "(checked by the employer at hiring)" */
    statutory: string;
    /** "Not mentioned does not mean missing." */
    fine: string;
    /** "You can still apply." / "Ask about it when you meet." (omit for organiser) */
    suffix?: string;
    /** "Requirements not read yet." when items is null. */
    notRead: string;
    /** "+{n} more" */
    more?: string;
    /** "Show fewer" */
    less?: string;
  };
  className?: string;
  /** Show only this many pills, with a toggle for the rest. Needs text.more and text.less. */
  limit?: number;
}) {
  const [open, setOpen] = useState(false);
  const testId = audience === "person" ? "not-mentioned" : "pick-not-mentioned";
  if (items === null) {
    return (
      <div className={cx("we-nm", className)} data-testid={testId}>
        <p className="we-fine">{text.notRead}</p>
      </div>
    );
  }
  if (items.length === 0) return null;
  return (
    <div className={cx("we-nm", className)} data-testid={testId}>
      <span className="we-label">{text.label}</span>
      <ul>
        {(limit && !open ? items.slice(0, limit) : items).map((it, i) => (
          <li key={i}>
            {it.text}
            {it.statutory ? <small> {text.statutory}</small> : null}
          </li>
        ))}
        {limit && items.length > limit && text.more && text.less ? (
          <li style={{ border: 0, background: "none", padding: 0 }}>
            <button type="button" className="we-more" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? text.less : text.more.replace("{n}", String(items.length - limit))}
            </button>
          </li>
        ) : null}
      </ul>
      <p className="we-fine">
        {text.fine}
        {text.suffix ? ` ${text.suffix}` : ""}
      </p>
    </div>
  );
}
