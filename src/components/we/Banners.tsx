import type { ReactNode } from "react";
import { cx } from "./cx";
import { AiTag } from "./Tag";
import { Icon } from "./icons";

/** Permanent AI disclosure on the interview. The text is `ai.disclosure`; the tag reads "AI". */
export function AiDisclosure({ tag, children, className }: { tag: string; children: ReactNode; className?: string }) {
  return (
    <p className={cx("we-ai-line", className)} data-testid="ai-disclosure">
      <AiTag>{tag}</AiTag>
      <span>{children}</span>
    </p>
  );
}

/** Masked company banner on company pages. Cannot be dismissed. */
export function MaskedDemoBanner({ lead, text, prototypeLine, className }: { lead: string; text: string; prototypeLine?: string; className?: string }) {
  return (
    <div className={cx("we-banner we-banner-demo", className)} data-testid="masked-banner">
      <Icon name="mask" />
      <p>
        <b>{lead}</b> {text}
        {prototypeLine ? <span className="we-banner-sub">{prototypeLine}</span> : null}
      </p>
    </div>
  );
}

/** Dashed note that organiser history was seeded for the demo. */
export function SeededDemoBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("we-banner we-banner-seed", className)}>
      <Icon name="info" />
      <p>{children}</p>
    </div>
  );
}

/** Info banner shown in the "what companies see" preview. Pass `focusRef`-less: the page moves focus to it. */
export function CompanyPreviewBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("we-banner we-banner-info", className)} data-testid="company-preview-banner" tabIndex={-1}>
      <Icon name="info" />
      <p>{children}</p>
    </div>
  );
}

/** Live-demo purge notice: amber on sun-soft with a clock. */
export function PurgeNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("we-purge", className)} data-testid="purge-notice">
      <Icon name="clock" />
      <span>{children}</span>
    </p>
  );
}

/** Dashed pill in the header of company pages opened from the organiser console. */
export function OrganiserPreview({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("we-proto-tag", className)}>{children}</span>;
}

/** 13 px muted footer line for the prototype disclaimer. */
export function PrototypeLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("we-proto-foot", className)}>{children}</p>;
}
