import { InterviewerMascot } from "@/components/we";
import { PasscodeForm } from "./PasscodeForm";

/** The organiser's passcode screen: one small card in the page shell. Every console page shows it until signed in. */
export function SignInCard({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="we-signin-wrap">
      <section className="we-signin" aria-labelledby="signin-title">
        <InterviewerMascot state="idle" size={96} badgeLabel={badge} />
        <h1 id="signin-title">{title}</h1>
        <PasscodeForm />
      </section>
    </div>
  );
}
