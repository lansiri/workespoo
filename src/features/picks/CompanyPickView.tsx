import type { UiLang } from "@/contracts";
import { NotMentionedList, ReasonLine, ReasonList, type CompanyPickIntro } from "@/components/we";
import { introMessages } from "@/features/intros/messages";
import { fmt, pick as pickText } from "@/lib/i18n";
import { CompanyPickClient } from "./CompanyPickClient";
import { longDay } from "./company-format";
import type { CompanyPick } from "./company-view";
import { companyMessages } from "./messages";

/** One approved person on the company's page: the kit's pick card filled from the payload, plus the ask-to-meet call. */
export function CompanyPickView({ pick, token, needTitle, lang }: { pick: CompanyPick; token: string; needTitle: string; lang: UiLang }) {
  const m = pickText(companyMessages, lang);
  const t = pickText(introMessages, lang);
  const quotesBySignal = new Map((pick.revealed?.signals ?? []).map((s) => [s.id, s.quotes]));
  // Each stored sentence is shown once per card: a later reason that rests on the same sentence does not repeat it.
  const seenQuotes = new Set<string>();
  const quotesFor = (signalId: string) =>
    (quotesBySignal.get(signalId) ?? []).filter((q) => {
      if (seenQuotes.has(q)) return false;
      seenQuotes.add(q);
      return true;
    });
  const date = longDay(pick.intro?.expiresAt, lang);

  const lines: Record<string, string> = {
    awaiting_talent: fmt(t.awaitingTalent, { date }),
    awaiting_company: fmt(t.awaitingCompany, { date }),
    pending_review: t.pendingReview,
    accepted: t.accepted,
    declined: t.declined,
    withdrawn: t.withdrawn,
    expired: fmt(t.expired, { date }),
    not_approved: t.notApproved,
    cancelled: t.cancelled,
  };
  let intro: CompanyPickIntro = { status: "none" };
  if (pick.intro) {
    const i = pick.intro;
    const line = lines[i.status] ?? "";
    if (pick.canAsk && (i.status === "withdrawn" || i.status === "expired")) intro = { status: "none" };
    else if (i.status === "awaiting_talent") intro = { status: "requested", waiting: line };
    else if (i.status === "accepted" && pick.revealed) {
      intro = { status: "revealed", name: pick.revealed.name, contact: pick.revealed.contact ?? "" };
    } else if (i.status === "declined") intro = { status: "declined" };
    else if (i.status === "expired") intro = { status: "expired", text: line };
    else intro = { status: "note", text: line };
  }
  // A request that closed (withdrawn, expired) may be asked again: the button comes back, and the status line takes the note's place.
  const closedLine = pick.intro && intro.status === "none" ? (lines[pick.intro.status] ?? "") : "";

  return (
    <li>
      <CompanyPickClient
        token={token}
        pickId={pick.id}
        handle={pick.card.handle}
        handleAria={fmt(m.handleAria, { handle: pick.card.handle })}
        syntheticLabel={m.synthetic}
        summary={pick.card.headline}
        askedToMeet={pick.askedByPerson ? m.originTalent : undefined}
        aiLabel={m.aiLabel}
        aiTag={m.aiTag}
        reasons={
          pick.reasons.length > 0 ? (
            <ReasonList variant="company">
              {pick.reasons.map((r) => (
                <ReasonLine
                  key={`${r.requirementText}-${r.signalId}`}
                  variant="company"
                  cardText={r.rendering ?? r.text}
                  cardKind="rendering"
                  postingSentence={r.postingSentence}
                  escoLabel={r.requirementText}
                  revealedQuote={intro.status === "revealed" ? quotesFor(r.signalId) : undefined}
                  text={{
                    cardLabel: m.cardLabel,
                    postingLabel: m.postingLabel,
                    mentions: m.mentions,
                    revealedLabel: m.inTheirWords,
                    revealedNote: m.revealedLabel,
                  }}
                />
              ))}
            </ReasonList>
          ) : null
        }
        notMentioned={
          <NotMentionedList
            audience="company"
            items={pick.notMentioned}
            text={{ label: m.notMentioned, statutory: m.statutory, fine: m.notMentionedFine, suffix: m.notMentionedAsk, notRead: m.notRead }}
          />
        }
        intro={intro}
        statusKey={pick.intro?.status}
        canWithdraw={false}
        text={{
          ask: m.askToMeet,
          askNote: closedLine || m.askNote,
          confirmTitle: m.askConfirmTitle,
          confirmBody: fmt(m.askConfirm, { need: needTitle }),
          send: m.askSend,
          cancel: m.askCancel,
          withdraw: "",
          accept: "",
          decline: "",
          declined: t.declined,
          both: m.revealedTitle,
        }}
      />
    </li>
  );
}
