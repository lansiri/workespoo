"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IntroResponseRequest } from "@/contracts";
import type { MatchesPayload } from "./payload";

/** While the feed is empty (just after approval) poll this often, this many times. */
const POLL_MS = 3000;
const MAX_POLLS = 20;

export type MatchesState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "error" }
  | { status: "ready"; data: MatchesPayload };

async function fetchMatches(signal: AbortSignal): Promise<MatchesState> {
  try {
    const res = await fetch("/api/matches", { cache: "no-store", signal });
    if (res.status === 401 || res.status === 403) return { status: "signed_out" };
    if (!res.ok) return { status: "error" };
    return { status: "ready", data: (await res.json()) as MatchesPayload };
  } catch {
    return { status: "error" };
  }
}

/** Loads `/api/matches`; polls briefly while the feed is still being prepared. */
export function useMatches(): { state: MatchesState; reload: () => void } {
  const [state, setState] = useState<MatchesState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const polls = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchMatches(controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
    return () => controller.abort();
  }, [tick]);

  useEffect(() => {
    if (state.status !== "ready" || state.data.matches.length > 0 || polls.current >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      polls.current += 1;
      setTick((n) => n + 1);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { state, reload };
}

/** Which field of an accept answer fails the contract, if any. Values are trimmed first. */
export function checkAnswer(answer: IntroResponseRequest): "name" | "nameLong" | "contact" | null {
  const parsed = IntroResponseRequest.safeParse(answer);
  if (parsed.success) return null;
  const path = parsed.error.issues[0]?.path[0];
  if (path === "displayName") return answer.decision === "accept" && answer.displayName.length > 80 ? "nameLong" : "name";
  return "contact";
}

/** Calls S3b's `POST /api/intros/[id]/respond`. Returns true when the answer was saved. */
export async function respondToIntro(introId: string, answer: IntroResponseRequest): Promise<boolean> {
  try {
    const res = await fetch(`/api/intros/${encodeURIComponent(introId)}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answer),
    });
    return res.ok;
  } catch {
    return false;
  }
}
