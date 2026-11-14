"use client";

import { CompanyPickCard, type CompanyPickCardProps } from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import { useAskToMeet } from "./AskToMeetButton";
import { companyMessages } from "./messages";

/**
 * The only client part of a pick: the card's confirmation dialog and the ask-to-meet call. The server
 * component around it passes only what the card draws; nothing else about the pick reaches the browser.
 */
export function CompanyPickClient({ token, ...card }: Omit<CompanyPickCardProps, "onAsk" | "askError" | "busy"> & { token: string }) {
  const m = useMessages(companyMessages);
  const ask = useAskToMeet(token, card.pickId);
  // An error belongs to a request that did not go through: once the card shows a request, it is gone.
  const error = ask.error && card.intro.status === "none" ? fmt(m.askFailed, { message: ask.error }) : undefined;
  return <CompanyPickCard {...card} busy={ask.busy} askError={error} onAsk={() => ask.send()} />;
}
