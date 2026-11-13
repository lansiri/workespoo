import { z } from "zod";
import { LookingFor, SignalId, type SignalCard } from "@/contracts";
import type { Db } from "@/db/client";
import { audit } from "@/lib/audit";
import { escoTopMatch } from "@/lib/esco";
import { HttpError } from "@/lib/http";
import { findProtectedCard, stripQualityWords } from "@/lib/lexicon";
import { codeHeadline, codeSummary, personDescribes } from "./checks";
import { loadCard, saveCard } from "./store";

/** The edits a person can make while reviewing (PATCH /api/card). */
export const CardEdit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("remove"), signalId: SignalId }),
  z.object({ op: z.literal("restore"), signalId: SignalId }),
  z.object({ op: z.literal("phrase"), signalId: SignalId, phrase: z.string().trim().min(2).max(60) }),
  z.object({ op: z.literal("lookingFor"), lookingFor: LookingFor }),
]);
export type CardEdit = z.infer<typeof CardEdit>;

/**
 * The draft to edit. When only an approved card exists, the first edit copies it into a draft
 * at the next version; the approved version stays in use until the draft is approved.
 */
async function draftForEdit(db: Db, talentId: string): Promise<SignalCard> {
  const draft = await loadCard(db, talentId, "draft");
  if (draft) return draft;
  const approved = await loadCard(db, talentId, "approved");
  if (!approved) throw new HttpError(404, "no_card", "There is no card to edit yet");
  return {
    ...approved,
    version: approved.version + 1,
    status: "draft",
    approvedAt: null,
    signals: approved.signals.map((s) => ({ ...s, status: "proposed" as const })),
  };
}

/**
 * After a signal is removed, restored or reworded, text written earlier by a model may still
 * mention it. The summary is rebuilt by code, and so is the headline when it names the phrase.
 */
function refreshAggregates(card: SignalCard, touched: string[]): SignalCard {
  const active = card.signals.filter((s) => s.status !== "removed").map((s) => s.phrase);
  const headline = card.headline.toLowerCase();
  const namesTouched = touched.some((p) => p.length > 0 && headline.includes(p.toLowerCase()));
  return {
    ...card,
    headline: namesTouched ? codeHeadline(active) : card.headline,
    companyView: { ...card.companyView, summary: codeSummary(active) },
  };
}

const cleanList = (items: readonly string[], max: number) =>
  [...new Set(items.map((i) => i.trim()).filter((i) => i.length > 0))].slice(0, max);

/**
 * Applies one review edit to the draft and audits it (ids and counts only). Returns whether
 * the person's new wording trips the card lexicon: they are warned, not blocked.
 */
export async function editCard(db: Db, talentId: string, edit: CardEdit): Promise<{ sensitive: boolean }> {
  let card = await draftForEdit(db, talentId);
  const actor = `talent:${talentId}` as const;
  let sensitive = false;

  if (edit.op === "lookingFor") {
    const lf = edit.lookingFor;
    card = {
      ...card,
      lookingFor: {
        roles: cleanList(lf.roles, 3),
        workMode: lf.workMode,
        startFrom: lf.startFrom,
        workLanguages: cleanList(lf.workLanguages, 5),
      },
    };
    await saveCard(db, talentId, card);
    await audit(db, {
      actor,
      action: "card.looking_for_edited",
      subjectType: "signal_card",
      subjectId: talentId,
      detail: { version: card.version, roles: card.lookingFor.roles.length, languages: card.lookingFor.workLanguages.length },
    });
    return { sensitive };
  }

  const target = card.signals.find((s) => s.id === edit.signalId);
  if (!target) throw new HttpError(404, "no_signal", "That note is not on your card");

  if (edit.op === "remove" || edit.op === "restore") {
    const removing = edit.op === "remove";
    card = {
      ...card,
      signals: card.signals.map((s) => (s.id === target.id ? { ...s, status: removing ? "removed" : "proposed" } : s)),
    };
    card = refreshAggregates(card, [target.phrase]);
    await saveCard(db, talentId, card);
    await audit(db, {
      actor,
      action: removing ? "card.signal_removed" : "card.signal_edited",
      subjectType: "signal_card",
      subjectId: talentId,
      detail: removing ? { signalId: target.id, version: card.version } : { signalId: target.id, version: card.version, restored: true },
    });
    return { sensitive };
  }

  // edit.op === "phrase"
  const own = edit.phrase;
  sensitive = findProtectedCard(own).length > 0;
  const phrase = stripQualityWords(own).slice(0, 60).trim();
  if (phrase.length < 2) throw new HttpError(400, "invalid_phrase", "Write a few words about what you can do");
  let esco = null;
  try {
    esco = await escoTopMatch(db, phrase);
  } catch {
    esco = null;
  }
  const item = { signalId: target.id, text: personDescribes(phrase), stale: false };
  card = {
    ...card,
    signals: card.signals.map((s) => (s.id === target.id ? { ...s, phrase, phraseOwn: own.slice(0, 80), esco } : s)),
    companyView: {
      ...card.companyView,
      items: [...card.companyView.items.filter((i) => i.signalId !== target.id), item],
    },
  };
  card = refreshAggregates(card, [target.phrase]);
  await saveCard(db, talentId, card);
  await audit(db, {
    actor,
    action: "card.signal_edited",
    subjectType: "signal_card",
    subjectId: talentId,
    detail: { signalId: target.id, version: card.version, sensitive },
  });
  return { sensitive };
}
