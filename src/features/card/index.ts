/**
 * Public API of the card feature (stream S1b). Signatures are fixed by
 * docs/FEATURE-API.md; the owning stream replaces these stub bodies.
 */
import type { Db } from "@/db/client";
import type {
  CardForCompany,
  CardForCompanyRevealed,
  CardForOrganiser,
  CardForPerson,
  SignalCard,
} from "@/contracts";

function notImplemented(name: string): never {
  throw new Error(`@/features/card: ${name} is not implemented yet`);
}

export async function synthesiseCard(
  _db: Db,
  _interviewId: string,
): Promise<{ talentId: string; version: number; fallback: boolean }> {
  return notImplemented("synthesiseCard");
}

export async function cardForPerson(_db: Db, _talentId: string): Promise<CardForPerson | null> {
  return notImplemented("cardForPerson");
}

export async function cardForCompany(_db: Db, _talentId: string): Promise<CardForCompany | null> {
  return notImplemented("cardForCompany");
}

export async function cardForOrganiser(_db: Db, _talentId: string): Promise<CardForOrganiser | null> {
  return notImplemented("cardForOrganiser");
}

export async function cardForCompanyRevealed(
  _db: Db,
  _talentId: string,
): Promise<CardForCompanyRevealed | null> {
  return notImplemented("cardForCompanyRevealed");
}

export async function getApprovedCard(_db: Db, _talentId: string): Promise<SignalCard | null> {
  return notImplemented("getApprovedCard");
}

export async function approveCard(_db: Db, _talentId: string): Promise<{ version: number }> {
  return notImplemented("approveCard");
}

export async function setPoolOptIn(_db: Db, _talentId: string, _inPool: boolean): Promise<void> {
  return notImplemented("setPoolOptIn");
}
