import type { ReactNode } from "react";
import type { UiLang } from "@/contracts";
import type { NavItem } from "@/components/we/PageShell";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { AppShell, type AppShellLabels, type ShellAudience } from "./AppShell";
import { siteMessages } from "./messages";

/** The navigation each audience gets. Companies come through a private link and get none. */
export function shellNav(audience: ShellAudience, lang: UiLang): NavItem[] {
  const m = pick(siteMessages, lang);
  if (audience === "company") return [];
  if (audience === "organiser") {
    return [
      { key: "overview", label: m.navOverview, href: "/organiser" },
      { key: "review", label: m.navReview, href: "/organiser/review" },
      { key: "applicants", label: m.navApplicants, href: "/organiser/applicants" },
      { key: "exposure", label: m.navExposure, href: "/organiser/exposure" },
      { key: "audit", label: m.navAudit, href: "/organiser/audit" },
    ];
  }
  return [
    { key: "interview", label: m.navInterview, href: "/interview" },
    { key: "card", label: m.navCard, href: "/card" },
    { key: "matches", label: m.navMatches, href: "/matches" },
    { key: "apply", label: m.navApply, href: "/apply" },
    { key: "how", label: m.navHow, href: "/how-it-works" },
  ];
}

export function shellLabels(audience: ShellAudience, lang: UiLang): AppShellLabels {
  const m = pick(siteMessages, lang);
  return {
    logoLabel: m.logoLabel,
    wordmark: "WorkEspoo",
    navLabel: m.navLabel,
    languageLabel: m.language,
    menuLabel: m.menu,
    prototypePill: audience === "organiser" ? m.prototypePill : undefined,
  };
}

/**
 * The frame around a page: top bar with the logo, the audience's navigation and the language
 * links. Route-group layouts render it; a page that needs its own top bar content (the
 * interview's progress and Stop button) sits outside those groups and renders it itself.
 */
export async function SiteShell(props: {
  audience: ShellAudience;
  headerSlot?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const lang = await getUiLang();
  const m = pick(siteMessages, lang);
  const headerSlot = props.headerSlot ?? (props.audience === "company" ? <span className="we-for-tag">{m.forCompanies}</span> : undefined);
  return (
    <AppShell
      audience={props.audience}
      nav={shellNav(props.audience, lang)}
      labels={shellLabels(props.audience, lang)}
      headerSlot={headerSlot}
      actions={props.actions}
    >
      {props.children}
    </AppShell>
  );
}
