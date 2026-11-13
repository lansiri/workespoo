import { eq } from "drizzle-orm";
import {
  CardForCompany,
  CardForCompanyRevealed,
  CardForOrganiser,
  CardForPerson,
  toSignalPublic,
  type CardSignalView,
  type InputMode,
  type SignalCard,
} from "@/contracts";
import type { Db } from "@/db/client";
import { talent, talentIdentity } from "@/db/schema";
import { latestInterview, loadCard, loadTranscript, orderSignals, quotesFor } from "./store";

/** The approved card, or null. Matching and companies only ever see this one. */
export async function getApprovedCard(db: Db, talentId: string): Promise<SignalCard | null> {
  return loadCard(db, talentId, "approved");
}

async function person(db: Db, talentId: string) {
  const [row] = await db.select().from(talent).where(eq(talent.id, talentId));
  return row ?? null;
}

/** The labelled English rendering for a signal, or null when none exists. */
function renderingOf(card: SignalCard, signalId: string): string | null {
  return card.companyView.items.find((i) => i.signalId === signalId)?.text ?? null;
}

function activeSignals(card: SignalCard) {
  return orderSignals(card.signals.filter((s) => s.status !== "removed"));
}

/** Built field by field: nothing is copied wholesale from the stored card. */
function companySignals(card: SignalCard): CardSignalView[] {
  // A signal with no company-view text yet (waiting for its first rewrite) stays out of the view.
  const shown = new Set(card.companyView.items.map((i) => i.signalId));
  return activeSignals(card).filter((s) => shown.has(s.id)).map((s) => ({
    id: s.id,
    phrase: s.phrase,
    kind: s.kind,
    esco: s.esco ? { uri: s.esco.uri, labelEn: s.esco.labelEn, labelFi: s.esco.labelFi } : null,
    rendering: renderingOf(card, s.id),
  }));
}

function companyBase(card: SignalCard, synthetic: boolean) {
  return {
    handle: card.handle,
    synthetic,
    headline: card.headline,
    summary: card.companyView.summary,
    renderingLabel: card.companyView.label,
    signals: companySignals(card),
    lookingFor: {
      roles: [...card.lookingFor.roles],
      workMode: card.lookingFor.workMode,
      startFrom: card.lookingFor.startFrom,
      workLanguages: [...card.lookingFor.workLanguages],
    },
  };
}

/** The person's own view of their newest card (draft if one exists, else approved). */
export async function cardForPerson(db: Db, talentId: string): Promise<CardForPerson | null> {
  const [draft, approved, who] = await Promise.all([
    loadCard(db, talentId, "draft"),
    loadCard(db, talentId, "approved"),
    person(db, talentId),
  ]);
  const card = draft ?? approved;
  if (!card || !who) return null;
  const iv = await latestInterview(db, talentId);
  const transcript = iv ? await loadTranscript(db, iv.id) : new Map();
  const items = new Map(card.companyView.items.map((i) => [i.signalId, i]));
  // Removed signals stay in the list (status "removed") so the person can undo until approval.
  const ordered = orderSignals(card.signals);
  return CardForPerson.parse({
    talentId,
    handle: card.handle,
    synthetic: who.synthetic,
    inPool: who.inPool,
    status: card.status,
    version: card.version,
    hasApprovedVersion: card.status === "draft" && approved !== null,
    headline: card.headline,
    summary: card.companyView.summary,
    renderingLabel: card.companyView.label,
    signals: ordered.map((s) => ({
      ...toSignalPublic(s),
      quotes: quotesFor(s.evidence, transcript),
      rendering: items.get(s.id)?.text ?? null,
      stale: items.get(s.id)?.stale ?? true,
    })),
    lookingFor: card.lookingFor,
    approvedAt: card.approvedAt,
  });
}

/** What a company sees before a mutual opt-in. Null when the person has no approved card. */
export async function cardForCompany(db: Db, talentId: string): Promise<CardForCompany | null> {
  const [card, who] = await Promise.all([loadCard(db, talentId, "approved"), person(db, talentId)]);
  if (!card || !who) return null;
  return CardForCompany.parse(companyBase(card, who.synthetic));
}

/** The company-level view plus pool bookkeeping. No quotes, language or input mode. */
export async function cardForOrganiser(db: Db, talentId: string): Promise<CardForOrganiser | null> {
  const [card, who] = await Promise.all([loadCard(db, talentId, "approved"), person(db, talentId)]);
  if (!card || !who) return null;
  return CardForOrganiser.parse({
    ...companyBase(card, who.synthetic),
    talentId,
    inPool: who.inPool,
    version: card.version,
    approvedAt: card.approvedAt,
  });
}

/**
 * Only call after checking that an introduction between the two is `accepted`. Adds the
 * person's quotes and own wording, identity, interview language and input modes.
 */
export async function cardForCompanyRevealed(
  db: Db,
  talentId: string,
): Promise<CardForCompanyRevealed | null> {
  const [card, who] = await Promise.all([loadCard(db, talentId, "approved"), person(db, talentId)]);
  if (!card || !who) return null;
  const iv = await latestInterview(db, talentId);
  const transcript = iv ? await loadTranscript(db, iv.id) : new Map();
  const [identity] = await db.select().from(talentIdentity).where(eq(talentIdentity.talentId, talentId));
  const byId = new Map(card.signals.map((s) => [s.id, s]));
  const modes = new Set<InputMode>();
  for (const t of transcript.values()) if (!t.redacted && t.inputMode) modes.add(t.inputMode);
  const base = companyBase(card, who.synthetic);
  return CardForCompanyRevealed.parse({
    ...base,
    signals: base.signals.map((v) => {
      const s = byId.get(v.id);
      return { ...v, phraseOwn: s?.phraseOwn ?? null, quotes: s ? quotesFor(s.evidence, transcript) : [] };
    }),
    // Without an identity row the handle stands in: it reveals nothing the company lacks.
    identity: { displayName: identity?.displayName ?? card.handle, contact: identity?.contact ?? null },
    interviewLang: iv && iv.lang !== "unknown" ? iv.lang : null,
    inputModes: [...modes].sort(),
  });
}

/** What the card page gets: the person's card plus the notes whose company text changed since approval. */
export type CardPageView = CardForPerson & { reworded: string[] };

/**
 * Ids of notes in the draft whose phrase or company text differs from the approved card (or that
 * the approved card does not show), and whose rewrite has finished. The page tells the person
 * that these were reworded for companies and need a look before approving.
 */
export async function cardPageView(db: Db, talentId: string): Promise<CardPageView | null> {
  const base = await cardForPerson(db, talentId);
  if (!base) return null;
  let reworded: string[] = [];
  if (base.status === "draft" && base.hasApprovedVersion) {
    const [draft, approved] = await Promise.all([loadCard(db, talentId, "draft"), loadCard(db, talentId, "approved")]);
    if (draft && approved) {
      const before = new Map(approved.signals.map((s) => [s.id, s]));
      reworded = draft.signals
        .filter((s) => {
          const item = draft.companyView.items.find((i) => i.signalId === s.id);
          if (s.status === "removed" || !item || item.stale) return false;
          const was = before.get(s.id);
          return !was || was.phrase !== s.phrase || renderingOf(approved, s.id) !== item.text;
        })
        .map((s) => s.id);
    }
  }
  return { ...base, reworded };
}
