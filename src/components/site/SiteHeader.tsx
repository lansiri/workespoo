import Link from "next/link";
import { LanguageSwitcher } from "@/lib/i18n/client";
import { pick } from "@/lib/i18n";
import type { UiLang } from "@/contracts";
import { siteMessages } from "./messages";

/** LOGO SLOT: the lead swaps this for the real logo component. Keep the test id. */
function SiteLogo() {
  return (
    <Link href="/" data-testid="site-logo" style={{ fontWeight: 700, marginInlineEnd: "1rem" }}>
      WorkEspoo
    </Link>
  );
}

export function SiteHeader({ lang }: { lang: UiLang }) {
  const m = pick(siteMessages, lang);
  const links = [
    { href: "/interview", label: m.navInterview, id: "nav-interview" },
    { href: "/card", label: m.navCard, id: "nav-card" },
    { href: "/matches", label: m.navMatches, id: "nav-matches" },
    { href: "/organiser", label: m.navOrganisers, id: "nav-organiser" },
    { href: "/how-it-works", label: m.navHow, id: "nav-how" },
  ];
  return (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.75rem 1.5rem",
        padding: "0.75rem 1.5rem",
        borderBottom: "1px solid #8884",
      }}
    >
      <SiteLogo />
      <nav aria-label={m.navLabel}>
        <ul style={{ display: "flex", flexWrap: "wrap", gap: "1rem", listStyle: "none", margin: 0, padding: 0 }}>
          {links.map((l) => (
            <li key={l.id}>
              <Link href={l.href} data-testid={l.id}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div style={{ marginInlineStart: "auto" }}>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
