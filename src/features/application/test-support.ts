/** Builders for this feature's tests. Not imported by production code. */
import type { Db } from "@/db/client";
import { eventCompany, matchEvent } from "@/db/schema";
import { newToken } from "@/lib/ids";
import { addCompany, addJobRow, addTalent, makeCard } from "../needs/test-helpers";

export const EMPLOYER = "Academic Work Finland Oy";

type Req = Parameters<typeof makeCard>[1]["requirements"][number];

/** An event, a participating masked company and a posting with a Need Card. */
export async function seedJob(
  db: Db,
  opts: {
    requirements?: Req[];
    masked?: boolean;
    sentences?: string[];
    cardStatus?: "draft" | "confirmed" | "stale";
    displayName?: string;
    inEvent?: boolean;
    title?: string;
  } = {},
) {
  const [existingEvent] = await db.select().from(matchEvent).limit(1);
  const eventId = existingEvent?.id ?? "ev_test0000001";
  if (!existingEvent) {
    await db.insert(matchEvent).values({
      id: eventId,
      name: "Test event",
      date: "2026-11-20",
      format: "in_person",
      startsAt: new Date("2026-11-20T08:00:00Z"),
      endsAt: new Date("2026-11-20T15:00:00Z"),
    });
  }
  const co = await addCompany(db, { displayName: opts.displayName ?? "Demo company 03", masked: opts.masked ?? true });
  if (opts.inEvent !== false) {
    await db.insert(eventCompany).values({ eventId, companyId: co.id, number: 3, agendaToken: newToken() });
  }
  const sentences = opts.sentences ?? [
    "Academic Work Finland Oy is looking for a warehouse specialist.",
    "You will receive goods and book them in SAP.",
    "Forklift licence is required.",
    "Good Finnish skills are needed.",
  ];
  const jobId = await addJobRow(db, { sentences, employerName: EMPLOYER, title: opts.title ?? "Warehouse specialist" });
  const card = await makeCard(db, {
    jobId,
    companyId: co.id,
    status: opts.cardStatus ?? "confirmed",
    requirements: opts.requirements ?? [
      { text: "Booking goods in SAP", kind: "must", postingSentence: 1 },
      { text: "Forklift licence", kind: "must", category: "authorisation", postingSentence: 2 },
      { text: "Finnish at work", kind: "nice", category: "language", languageCode: "fi", postingSentence: 3 },
      { text: "Night shift work", kind: "nice", statutory: "other_law", postingSentence: null },
      { text: "Receiving deliveries", kind: "must", postingSentence: 1 },
    ],
  });
  return { jobId, companyId: co.id, card, eventId };
}

export { addTalent };
