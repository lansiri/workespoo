import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { company } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

export type Session = { talentId?: string; organiser?: boolean };

export const SESSION_COOKIE = "we_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DEV_SECRET = "workespoo-dev-session-secret-not-for-production";

function secret(): string {
  const env = getEnv();
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.NODE_ENV === "production") throw new Error("Missing required environment variable SESSION_SECRET");
  return DEV_SECRET;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Cookie value: `<base64url json>.<base64url hmac>`. Exported for tests. */
export function encodeSession(session: Session, now = Date.now()): string {
  const payload: { t?: string; o?: 1; exp: number } = { exp: Math.floor(now / 1000) + MAX_AGE_SECONDS };
  if (session.talentId) payload.t = session.talentId;
  if (session.organiser) payload.o = 1;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns the session for a cookie value, or an empty session when missing, tampered or expired. */
export function decodeSession(value: string | undefined, now = Date.now()): Session {
  if (!value) return {};
  const dot = value.indexOf(".");
  if (dot < 1) return {};
  const body = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return {};
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { t?: unknown; o?: unknown; exp?: unknown };
    if (typeof p.exp !== "number" || p.exp * 1000 < now) return {};
    const session: Session = {};
    if (typeof p.t === "string" && p.t) session.talentId = p.t;
    if (p.o === 1) session.organiser = true;
    return session;
  } catch {
    return {};
  }
}

export async function getSession(): Promise<Session> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

async function write(session: Session): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function setTalentSession(talentId: string): Promise<void> {
  const current = await getSession();
  await write({ ...current, talentId });
}

export async function setOrganiserSession(): Promise<void> {
  const current = await getSession();
  await write({ ...current, organiser: true });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Returns the session's talent id. If `expected` is given, it must match. Throws HttpError 401 or 403. */
export async function requireTalent(expected?: string): Promise<string> {
  const { talentId } = await getSession();
  if (!talentId) throw new HttpError(401, "unauthenticated", "Sign in to continue");
  if (expected !== undefined && talentId !== expected) throw new HttpError(403, "forbidden", "This is not your data");
  return talentId;
}

/** Throws HttpError 401 unless the organiser passcode was entered in this session. */
export async function requireOrganiser(): Promise<void> {
  const { organiser } = await getSession();
  if (!organiser) throw new HttpError(401, "unauthenticated", "Organiser sign-in required");
}

/** Timing-safe comparison with ORGANISER_PASSCODE. False when no passcode is configured. */
export function verifyOrganiserPasscode(input: string): boolean {
  const passcode = getEnv().ORGANISER_PASSCODE;
  if (!passcode) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(passcode).digest();
  return timingSafeEqual(a, b);
}

/** Resolve a company from the secret in its digest link. Null when unknown. */
export async function companyFromToken(db: Db, token: string): Promise<{ id: string; displayName: string } | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: company.id, displayName: company.displayName })
    .from(company)
    .where(eq(company.digestToken, token))
    .limit(1);
  return row ?? null;
}
