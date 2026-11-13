import { pick } from "@/lib/i18n";
import type { UiLang } from "@/contracts";
import { siteMessages } from "./messages";

export function SiteFooter({ lang }: { lang: UiLang }) {
  const m = pick(siteMessages, lang);
  return (
    <footer data-testid="site-footer" style={{ padding: "1rem 1.5rem", borderTop: "1px solid #8884", fontSize: "0.875rem" }}>
      <p>{m.footer}</p>
    </footer>
  );
}
