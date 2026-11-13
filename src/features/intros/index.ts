/**
 * Public API of the intros feature (stream S3b). Signatures are fixed by
 * docs/FEATURE-API.md; the owning stream replaces these stub bodies.
 */
import type { Db } from "@/db/client";
import type { Intro } from "@/contracts";

export async function introsForTalent(_db: Db, _talentId: string): Promise<Intro[]> {
  throw new Error("@/features/intros: introsForTalent is not implemented yet");
}
