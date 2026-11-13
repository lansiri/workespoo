/**
 * Public API of the matching feature (stream S3a). Signatures are fixed by
 * docs/FEATURE-API.md; the owning stream replaces these stub bodies.
 */
import type { Db } from "@/db/client";
import type { Job, JobMatch } from "@/contracts";

function notImplemented(name: string): never {
  throw new Error(`@/features/matching: ${name} is not implemented yet`);
}

export async function feedForTalent(
  _db: Db,
  _talentId: string,
): Promise<Array<{ match: JobMatch; job: Job }>> {
  return notImplemented("feedForTalent");
}

export async function computeFeed(_db: Db, _talentId: string): Promise<{ matches: number }> {
  return notImplemented("computeFeed");
}

export async function computeEligibility(
  _db: Db,
  _scope: { needCardId: string } | { talentId: string },
): Promise<{ rows: number }> {
  return notImplemented("computeEligibility");
}
