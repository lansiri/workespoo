import { getDb } from "@/db/client";
import { CardEdit, cardPageView, editCard } from "@/features/card";
import { HttpError, parseBody, route } from "@/lib/http";
import { requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The session talent's newest card. 404 `card_pending` while synthesis has not finished. */
export const GET = route(async () => {
  const talentId = await requireTalent();
  const card = await cardPageView(getDb(), talentId);
  if (!card) throw new HttpError(404, "card_pending", "Your card is not ready yet");
  return Response.json(card);
});

/** One review edit: remove or restore a signal, edit a phrase, edit "looking for". */
export const PATCH = route(async (request) => {
  const talentId = await requireTalent();
  const edit = await parseBody(request, CardEdit);
  const db = getDb();
  const { sensitive } = await editCard(db, talentId, edit);
  const card = await cardPageView(db, talentId);
  return Response.json({ card, sensitive });
});
