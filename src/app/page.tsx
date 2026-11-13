import Link from "next/link";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { siteMessages } from "@/components/site/messages";

export default async function Home() {
  const m = pick(siteMessages, await getUiLang());
  return (
    <main className="mx-auto flex max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="text-4xl font-semibold tracking-tight">WorkEspoo</h1>
      <p className="text-lg text-muted-foreground">{m.tagline}</p>
      <p>
        <Link href="/interview" data-testid="start-link" className="underline">
          {m.startInterview}
        </Link>
      </p>
    </main>
  );
}
