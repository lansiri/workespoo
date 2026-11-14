import { siteMessages } from "@/components/site/messages";
import { Button } from "@/components/we/Button";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import "@/components/coming-soon/front-page.css";

/** The page nobody should see: plain words, a way back. The frame comes from the surrounding route group layout. */
export default async function NotFound() {
  const m = pick(siteMessages, await getUiLang());
  return (
      <section className="sp-lost" data-testid="not-found">
        <h1 className="sp-lostTitle">{m.notFoundTitle}</h1>
        <p>{m.notFoundBody}</p>
        <div className="sp-end">
          <Button variant="primary" size="lg" href="/" data-testid="not-found-home">
            {m.notFoundHome}
          </Button>
          <Button variant="ghost" size="lg" href="/how-it-works">
            {m.notFoundHow}
          </Button>
        </div>
      </section>
  );
}
