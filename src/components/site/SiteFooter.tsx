import Link from "next/link";
import { pick } from "@/lib/i18n";
import type { UiLang } from "@/contracts";
import { siteMessages } from "./messages";

/** The prototype line under every page, and the one link organisers need to find their console. */
export function SiteFooter({ lang }: { lang: UiLang }) {
  const m = pick(siteMessages, lang);
  return (
    <footer data-testid="site-footer" className="we-site-footer">
      <p>{m.footer}</p>
      <p>
        <Link href="/organiser" data-testid="nav-organiser">
          {m.footerOrganisers}
        </Link>
      </p>
    </footer>
  );
}
