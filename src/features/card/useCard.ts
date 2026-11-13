"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardForPerson } from "@/contracts";
import type { CardEdit } from "./review";

export type CardState =
  | { phase: "loading" }
  | { phase: "pending"; waitedLong: boolean }
  | { phase: "signed_out" }
  | { phase: "error" }
  | { phase: "ready"; card: CardForPerson };

export const POLL_MS = 2000;
export const POLL_LONG_AFTER = 30;

type ApiError = { code: string };

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: ApiError }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const body = (await res.json().catch(() => null)) as { error?: ApiError } | null;
    if (res.ok) return { ok: true, data: body as T };
    return { ok: false, status: res.status, error: body?.error ?? { code: "unknown" } };
  } catch {
    return { ok: false, status: 0, error: { code: "network" } };
  }
}

/** Loads the person's card, polls while synthesis is running, and wraps the review actions. */
export function useCard() {
  const [state, setState] = useState<CardState>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sensitiveSignalId, setSensitiveSignalId] = useState<string | null>(null);
  const attempts = useRef(0);

  const load = useCallback(async () => {
    const r = await call<CardForPerson>("/api/card");
    if (r.ok) {
      attempts.current = 0;
      setState({ phase: "ready", card: r.data });
    } else if (r.status === 404 && r.error.code === "card_pending") {
      attempts.current += 1;
      setState({ phase: "pending", waitedLong: attempts.current > POLL_LONG_AFTER });
    } else if (r.status === 401) {
      setState({ phase: "signed_out" });
    } else {
      setState({ phase: "error" });
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  // While synthesis is running the API answers `card_pending`; ask again shortly.
  useEffect(() => {
    if (state.phase !== "pending") return;
    const id = setTimeout(() => void load(), POLL_MS);
    return () => clearTimeout(id);
  }, [state, load]);

  // While a rewritten phrase is waiting for the model, check again shortly.
  // Backstop: stop asking after POLL_LONG_AFTER tries; the earlier text stays visible to companies.
  const rewriting = state.phase === "ready" && state.card.signals.some((x) => x.status !== "removed" && x.stale);
  const rewriteTries = useRef(0);
  useEffect(() => {
    if (!rewriting) {
      rewriteTries.current = 0;
      return;
    }
    if (rewriteTries.current >= POLL_LONG_AFTER) return;
    rewriteTries.current += 1;
    const id = setTimeout(() => void load(), POLL_MS);
    return () => clearTimeout(id);
  }, [rewriting, state, load]);

  const retry = useCallback(() => {
    attempts.current = 0;
    setState({ phase: "loading" });
    void load();
  }, [load]);

  const edit = useCallback(async (e: CardEdit) => {
    setBusy(true);
    setActionError(null);
    const r = await call<{ card: CardForPerson; sensitive: boolean }>("/api/card", { method: "PATCH", body: JSON.stringify(e) });
    setBusy(false);
    if (!r.ok) {
      setActionError(r.error.code);
      return false;
    }
    setState({ phase: "ready", card: r.data.card });
    setSensitiveSignalId(r.data.sensitive && e.op === "phrase" ? e.signalId : null);
    return true;
  }, []);

  const approve = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    const r = await call<{ version: number }>("/api/card/approve", { method: "POST", body: "{}" });
    if (!r.ok) {
      setBusy(false);
      setActionError(r.error.code);
      return false;
    }
    await load();
    setBusy(false);
    return true;
  }, [load]);

  const setPool = useCallback(
    async (inPool: boolean) => {
      setBusy(true);
      setActionError(null);
      const r = await call<{ inPool: boolean }>("/api/card/pool", { method: "POST", body: JSON.stringify({ inPool }) });
      if (!r.ok) setActionError(r.error.code);
      else await load();
      setBusy(false);
    },
    [load],
  );

  /** Deletes the person and everything stored about them; the page then shows the signed-out state. */
  const deleteMyData = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    const r = await call<{ deleted: boolean }>("/api/me", { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      setActionError("delete_failed");
      return false;
    }
    setState({ phase: "signed_out" });
    return true;
  }, []);

  return { state, busy, actionError, sensitiveSignalId, retry, edit, approve, setPool, deleteMyData };
}
