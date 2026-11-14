"use client";

import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import type { UiLang } from "@/contracts";
import { PageShell, type NavItem } from "@/components/we/PageShell";
import { UI_LANGS, UI_LANG_NAMES, uiLangCookieString } from "@/lib/i18n";
import { useUiLang } from "@/lib/i18n/client";

export type ShellAudience = "talent" | "organiser" | "company" | "public";

export type AppShellLabels = {
  logoLabel: string;
  wordmark: string;
  navLabel: string;
  languageLabel: string;
  menuLabel: string;
  prototypePill?: string;
};

export type AppShellProps = {
  audience: ShellAudience;
  nav: NavItem[];
  labels: AppShellLabels;
  /** Interview progress, "For companies". */
  headerSlot?: ReactNode;
  /** The Stop button on the interview. */
  actions?: ReactNode;
  children: ReactNode;
};

/** The nav item whose address is the longest start of the current path. */
export function currentNavKey(pathname: string, nav: readonly NavItem[]): string | undefined {
  let best: NavItem | undefined;
  for (const item of nav) {
    const at = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (at && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key;
}

/**
 * Language links in the kit's style. They are plain links to `/lang/<code>`, which sets the
 * cookie and comes back, so they work without JavaScript; with it the page switches in place.
 * Never `next/link` here: prefetching one of these addresses would change the language.
 */
function ShellLanguages({ label, short, hideOnPhone }: { label: string; short: boolean; hideOnPhone: boolean }) {
  const current = useUiLang();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const choose = (event: MouseEvent<HTMLAnchorElement>, lang: UiLang) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (lang === current) return;
    document.cookie = uiLangCookieString(lang);
    router.refresh();
  };
  return (
    <nav className={hideOnPhone ? "we-langs we-langs-nophone" : "we-langs"} aria-label={label} data-testid="language-switcher">
      {UI_LANGS.map((lang) => (
        <a
          key={lang}
          href={`/lang/${lang}?back=${encodeURIComponent(pathname)}`}
          lang={lang}
          hrefLang={lang}
          rel="nofollow"
          aria-current={lang === current ? "true" : undefined}
          aria-label={short ? UI_LANG_NAMES[lang] : undefined}
          title={short ? UI_LANG_NAMES[lang] : undefined}
          data-testid={`lang-${lang}`}
          onClick={(event) => choose(event, lang)}
        >
          {short ? lang.toUpperCase() : UI_LANG_NAMES[lang]}
        </a>
      ))}
    </nav>
  );
}

/**
 * The kit's page frame with this site's navigation and language switcher. Pages do not use it
 * directly: route-group layouts render `SiteShell`, which fills in the labels on the server.
 */
export function AppShell(p: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const short = p.audience === "organiser" || p.audience === "company";
  return (
    <PageShell
      audience={p.audience}
      current={currentNavKey(pathname, p.nav)}
      logoLabel={p.labels.logoLabel}
      wordmark={p.labels.wordmark}
      navLabel={p.labels.navLabel}
      nav={p.nav}
      languageLabel={p.labels.languageLabel}
      languages={[]}
      languageSwitcher={<ShellLanguages label={p.labels.languageLabel} short={short} hideOnPhone={Boolean(p.actions)} />}
      menuLabel={p.labels.menuLabel}
      headerSlot={p.headerSlot}
      prototypePill={p.labels.prototypePill}
      actions={p.actions}
    >
      {p.children}
    </PageShell>
  );
}
