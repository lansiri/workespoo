import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { KitLogo } from "./Logo";

export type NavItem = { key: string; label: string; href: string; badge?: string };
export type LanguageItem = { code: "en" | "fi" | "sv"; label: string; href: string; current: boolean };

export type PageShellProps = {
  audience: "talent" | "organiser" | "company" | "public";
  /** Key of the current nav item. */
  current?: string;
  /** Accessible name and visible wordmark of the logo. */
  logoLabel: string;
  wordmark: string;
  navLabel: string;
  nav?: NavItem[];
  languageLabel: string;
  languages: LanguageItem[];
  /** Replaces the default language links, for example with the app's own switcher. */
  languageSwitcher?: ReactNode;
  menuLabel: string;
  /** Interview progress, "For companies". */
  headerSlot?: ReactNode;
  /** Dashed pill, for example "Prototype: synthetic people, masked companies". */
  prototypePill?: string;
  /** Stop button on the interview. */
  actions?: ReactNode;
  children: ReactNode;
  /** Set false when another header on the page already carries the site-logo and language test ids. */
  testIds?: boolean;
  className?: string;
};

function NavLinks({ nav, current }: { nav: NavItem[]; current?: string }) {
  return (
    <>
      {nav.map((n) => (
        <Link key={n.key} href={n.href} aria-current={n.key === current ? "page" : undefined}>
          {n.label}
          {n.badge ? <span className="we-badge">{n.badge}</span> : null}
        </Link>
      ))}
    </>
  );
}

/**
 * Frame of every page: 64 px paper top bar, logo, nav for the audience, language switcher, optional slots.
 * On phones (760 px and below) the nav moves behind a 44 px Menu button; languages stay visible.
 * The Menu is a native <details>, so it works without script.
 */
export function PageShell(p: PageShellProps) {
  const nav = p.nav ?? [];
  /** Organiser and company bars are tight, so they show EN / FI / SV. The full name stays the accessible name. */
  const ids = p.testIds !== false;
  const short = p.audience === "organiser" || p.audience === "company";
  const langs = p.languageSwitcher ?? (
    <nav className={cx("we-langs", p.actions ? "we-langs-nophone" : null)} aria-label={p.languageLabel} data-testid={ids ? "language-switcher" : undefined}>
      {p.languages.map((l) => (
        <Link key={l.code} href={l.href} lang={l.code} hrefLang={l.code} aria-current={l.current ? "true" : undefined} aria-label={short ? l.label : undefined} title={short ? l.label : undefined} data-testid={ids ? `lang-${l.code}` : undefined}>
          {short ? l.code.toUpperCase() : l.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className={cx("we-shell we-page-body", `we-aud-${p.audience}`, p.className)}>
      <header className="we-topbar">
        <KitLogo label={p.logoLabel} wordmark={p.wordmark} testId={ids} />
        {p.headerSlot}
        {nav.length > 0 ? (
          <nav className="we-mainnav" aria-label={p.navLabel}>
            <NavLinks nav={nav} current={p.current} />
          </nav>
        ) : null}
        <span className="we-spacer" />
        {p.prototypePill ? <span className="we-proto-tag we-d-only">{p.prototypePill}</span> : null}
        {langs}
        {p.actions}
        {nav.length > 0 ? (
          <details className="we-menu">
            <summary className="we-menu-btn" aria-label={p.menuLabel} data-testid="menu-button">
              <Icon name="menu" />
            </summary>
            <nav className="we-menu-sheet" aria-label={p.navLabel}>
              <NavLinks nav={nav} current={p.current} />
            </nav>
          </details>
        ) : null}
      </header>
      <main>{p.children}</main>
    </div>
  );
}
