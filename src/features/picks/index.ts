/**
 * Public API of the picks feature (stream S3b). Signatures are fixed by
 * docs/FEATURE-API.md; the owning stream replaces these stub bodies.
 */
import type { Db } from "@/db/client";

export async function draftDailyDigests(
  _db: Db,
  _date: string,
): Promise<{ digests: number; picks: number }> {
  throw new Error("@/features/picks: draftDailyDigests is not implemented yet");
}
