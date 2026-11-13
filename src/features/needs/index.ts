/**
 * Public API of the needs feature (stream S2). Signatures are fixed by
 * docs/FEATURE-API.md; the owning stream replaces these stub bodies.
 */
import type { Db } from "@/db/client";
import type { NeedCard, NeedCardStatus } from "@/contracts";

function notImplemented(name: string): never {
  throw new Error(`@/features/needs: ${name} is not implemented yet`);
}

export async function draftNeedCard(
  _db: Db,
  _jobId: string,
  _companyId: string | null,
): Promise<NeedCard> {
  return notImplemented("draftNeedCard");
}

export async function getNeedCard(_db: Db, _needCardId: string): Promise<NeedCard | null> {
  return notImplemented("getNeedCard");
}

export async function getNeedCardForJob(_db: Db, _jobId: string): Promise<NeedCard | null> {
  return notImplemented("getNeedCardForJob");
}

export async function listNeedCards(
  _db: Db,
  _filter?: { companyId?: string; status?: NeedCardStatus },
): Promise<NeedCard[]> {
  return notImplemented("listNeedCards");
}

export async function recomputePoolEvidence(_db: Db, _needCardId: string): Promise<void> {
  return notImplemented("recomputePoolEvidence");
}
