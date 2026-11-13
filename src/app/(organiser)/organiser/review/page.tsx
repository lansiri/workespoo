import { PasscodeForm } from "@/features/picks/PasscodeForm";
import { ReviewQueue } from "@/features/picks/ReviewQueue";
import { organiserMessages } from "@/features/picks/messages";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const m = pick(organiserMessages, await getUiLang());
  const session = await getSession();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      {session.organiser ? (
        <ReviewQueue />
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{m.signInTitle}</h1>
          <PasscodeForm />
        </>
      )}
    </main>
  );
}
