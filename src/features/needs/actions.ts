import { z } from "zod";
import type { NeedCard, Requirement } from "@/contracts";
import type { Db } from "@/db/client";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/http";
import { enqueue } from "@/lib/queue";
import { companyFromToken } from "@/lib/session";
import { REQUIREMENT_TEXT_MAX } from "./constants";
import { escoFallbackForRequirement } from "./draft";
import { PROTECTED_TEXT_MESSAGE, companyTextProblem } from "./rules";
import { getNeedCard, saveNeedCard } from "./store";
import { buildCompanyView, loadCompany, visibleQuestionIds, type CompanyNeedView, type CompanyRow } from "./view";

// ---------- access ----------

export type NeedAccess = { kind: "company"; company: CompanyRow } | { kind: "organiser" };

/**
 * Who may see a Need Card: its own company (by the secret in its link) or an organiser.
 * Throws 401 with neither, and 404 when the card belongs to someone else, so a link never
 * reveals that another company's card exists.
 */
export async function resolveNeedAccess(
  db: Db,
  needCardId: string,
  who: { token: string | null; organiser: boolean },
): Promise<{ access: NeedAccess; card: NeedCard }> {
  const card = await getNeedCard(db, needCardId);
  // A company link always gets the company's view, even in a browser that is also signed in
  // as organiser: the page behind a link must never show more than the company may see.
  if (!who.token) {
    if (!who.organiser) throw new HttpError(401, "unauthenticated", "A company link or organiser sign-in is required");
    if (!card) throw new HttpError(404, "not_found", "Need Card not found");
    return { access: { kind: "organiser" }, card };
  }
  const row = await companyFromToken(db, who.token);
  if (!row) throw new HttpError(401, "unauthenticated", "A company link or organiser sign-in is required");
  if (!card || card.companyId !== row.id) throw new HttpError(404, "not_found", "Need Card not found");
  const company = await loadCompany(db, row.id);
  if (!company) throw new HttpError(404, "not_found", "Need Card not found");
  return { access: { kind: "company", company }, card };
}

/** The company-side payload of a card, for the page and for `GET /api/needs/[id]`. */
export async function companyNeedView(db: Db, needCardId: string, token: string): Promise<CompanyNeedView> {
  const { access, card } = await resolveNeedAccess(db, needCardId, { token, organiser: false });
  if (access.kind !== "company") throw new HttpError(401, "unauthenticated");
  return buildCompanyView(db, card, access.company);
}

// ---------- edits ----------

export const AnswerInput = z.object({
  requirementId: z.string().min(1),
  choice: z.enum(["keep", "make_nice", "reworded", "remove"]),
  /** The new wording, for `reworded`. */
  text: z.string().max(REQUIREMENT_TEXT_MAX * 2).optional(),
  note: z.string().max(300).optional(),
});
export type AnswerInput = z.infer<typeof AnswerInput>;

async function announce(db: Db, card: NeedCard): Promise<void> {
  await enqueue(
    db,
    "matching.need_changed",
    { needCardId: card.id, version: card.version },
    { dedupeKey: `matching.need_changed:${card.id}:${card.version}` },
  );
}

function requireEditable(card: NeedCard): void {
  if (card.status === "stale") throw new HttpError(409, "stale", "This need is out of date and read-only");
}

/**
 * Records the company's answer to one requirement's question and applies it, as a new
 * version. `make_nice` changes the kind, `remove` removes the requirement, `reworded`
 * replaces the text (ESCO is mapped again) and `keep` only records. Pool numbers stay as
 * computed until matching recomputes them for the new version.
 */
export async function answerQuestion(
  db: Db,
  needCardId: string,
  companyId: string,
  input: AnswerInput,
  now: Date = new Date(),
): Promise<NeedCard> {
  const card = await getNeedCard(db, needCardId);
  if (!card || card.companyId !== companyId) throw new HttpError(404, "not_found", "Need Card not found");
  requireEditable(card);

  const target = card.requirements.find((r) => r.id === input.requirementId);
  if (!target || !target.question) throw new HttpError(404, "no_question", "That requirement has no question");
  if (!visibleQuestionIds(card).has(target.id)) throw new HttpError(404, "no_question", "That requirement has no question");
  if (target.question.answer) throw new HttpError(409, "already_answered", "This question was already answered");

  let newText: string | null = null;
  if (input.choice === "reworded") {
    newText = (input.text ?? "").trim().replace(/\s+/g, " ");
    if (!newText) throw new HttpError(400, "text_required", "Write the new wording");
    if (newText.length > REQUIREMENT_TEXT_MAX) {
      throw new HttpError(400, "text_too_long", `Keep the wording to ${REQUIREMENT_TEXT_MAX} characters`);
    }
    const problem = companyTextProblem(newText);
    if (problem) {
      throw new HttpError(
        422,
        problem.hint ? "protected_text_native" : "protected_text",
        problem.hint ? `${PROTECTED_TEXT_MESSAGE} ${problem.hint}` : PROTECTED_TEXT_MESSAGE,
      );
    }
  }

  const answer = { choice: input.choice, ...(input.note ? { note: input.note } : {}), at: now.toISOString() };
  const requirements: Requirement[] = [];
  for (const r of card.requirements) {
    if (r.id !== target.id) {
      requirements.push(r);
      continue;
    }
    const question = { ...r.question!, answer };
    if (input.choice === "remove") continue;
    if (input.choice === "make_nice") {
      requirements.push({ ...r, kind: "nice", question });
    } else if (input.choice === "reworded") {
      const uris =
        r.category === "skill" || r.category === "experience" ? await escoFallbackForRequirement(db, newText!) : [];
      requirements.push({ ...r, text: newText!, escoSkillUris: uris, pool: null, question });
    } else {
      requirements.push({ ...r, question });
    }
  }

  const saved = await saveNeedCard(db, { ...card, version: card.version + 1, requirements }, now, card.version);
  const actor = `company:${companyId}` as const;
  await audit(db, {
    actor,
    action: "needcard.question_answered",
    subjectType: "need_card",
    subjectId: saved.id,
    detail: { requirementId: target.id, choice: input.choice, version: saved.version },
  });
  await audit(db, {
    actor,
    action: "needcard.edited",
    subjectType: "need_card",
    subjectId: saved.id,
    detail: { requirementId: target.id, change: input.choice, version: saved.version },
  });
  await announce(db, saved);
  return saved;
}

/**
 * The company confirms the need: `confirmed`, `confirmedAt`, a new version. Unanswered
 * questions do not block it. Confirming a confirmed card changes nothing.
 */
export async function confirmNeedCard(
  db: Db,
  needCardId: string,
  companyId: string,
  now: Date = new Date(),
): Promise<NeedCard> {
  const card = await getNeedCard(db, needCardId);
  if (!card || card.companyId !== companyId) throw new HttpError(404, "not_found", "Need Card not found");
  requireEditable(card);
  if (card.status === "confirmed") return card;

  const saved = await saveNeedCard(
    db,
    { ...card, status: "confirmed", confirmedAt: now.toISOString(), version: card.version + 1 },
    now,
    card.version,
  );
  await audit(db, {
    actor: `company:${companyId}`,
    action: "needcard.confirmed",
    subjectType: "need_card",
    subjectId: saved.id,
    detail: { version: saved.version, requirements: saved.requirements.length },
  });
  await announce(db, saved);
  return saved;
}

/** The secret of a company link, from `x-company-token`, `Authorization: Bearer` or `?token=`. */
export function companyTokenFrom(request: Request): string | null {
  const header = request.headers.get("x-company-token");
  if (header) return header;
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return new URL(request.url).searchParams.get("token");
}

/** Organiser payload: the whole card, plus which questions the company can see. */
export function organiserNeedView(card: NeedCard) {
  return { needCard: card, visibleQuestionIds: [...visibleQuestionIds(card)] };
}
