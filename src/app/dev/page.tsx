import Link from "next/link";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { siteMessages } from "@/components/site/messages";

const DEV_LINKS = ["/dev/voice", "/dev/s1", "/dev/s2", "/dev/s3"];

export default async function DevIndex() {
  const m = pick(siteMessages, await getUiLang());
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">{m.devHeading}</h1>
      <ul className="list-disc pl-6">
        {DEV_LINKS.map((href) => (
          <li key={href}>
            <Link href={href}>{href}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
