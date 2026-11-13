"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueueDigest, QueuePick, ReviewQueue } from "./queue-view";
import type { RemoveReasonCode } from "./constants";
import { keyAction } from "./keys";

type Removing = { pickId: string; code: RemoveReasonCode | null; note: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

export type FlatPick = { pick: QueuePick; digest: QueueDigest };

/**
 * State and actions of the review queue, kept out of the markup. One decision per call:
 * there is no function here that acts on more than one pick.
 */
export function useReviewQueue(messages: { undecidedBlocked: string; actionFailed: string; runDone: string }) {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pickedId, setSelectedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const stateRef = useRef<{ queue: ReviewQueue | null; selectedId: string | null; removing: Removing | null; busy: boolean }>({
    queue: null,
    selectedId: null,
    removing: null,
    busy: false,
  });

  const load = useCallback(async () => {
    try {
      const q = await call<ReviewQueue>("/api/picks/queue");
      setQueue(q);
      setLoadError(false);
      return q;
    } catch {
      setLoadError(true);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    call<ReviewQueue>("/api/picks/queue").then(
      (q) => {
        if (!cancelled) setQueue(q);
      },
      () => {
        if (!cancelled) setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const flat: FlatPick[] = useMemo(
    () => (queue?.digests ?? []).flatMap((digest) => digest.needs.flatMap((need) => need.picks.map((pick) => ({ pick, digest })))),
    [queue],
  );

  // The selected pick: the one the person chose if it is still listed, else the first waiting one.
  const selectedId =
    flat.length === 0
      ? null
      : flat.some((f) => f.pick.id === pickedId)
        ? pickedId
        : (flat.find((f) => f.pick.status === "suggested")?.pick.id ?? flat[0].pick.id);

  useEffect(() => {
    stateRef.current = { queue, selectedId, removing, busy };
  });

  const fail = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(messages.actionFailed.replace("{message}", message));
    },
    [messages.actionFailed],
  );

  const move = useCallback(
    (delta: number) => {
      const { selectedId: current } = stateRef.current;
      if (flat.length === 0) return;
      const i = Math.max(0, flat.findIndex((f) => f.pick.id === current));
      setSelectedId(flat[Math.min(flat.length - 1, Math.max(0, i + delta))].pick.id);
      setRemoving(null);
    },
    [flat],
  );

  const afterDecision = useCallback(
    async (decidedId: string) => {
      const fresh = await load();
      if (!fresh) return;
      const list = fresh.digests.flatMap((d) => d.needs.flatMap((n) => n.picks));
      const at = list.findIndex((p) => p.id === decidedId);
      const after = [...list.slice(at + 1), ...list.slice(0, Math.max(at, 0))];
      const next = after.find((p) => p.status === "suggested");
      if (next) setSelectedId(next.id);
    },
    [load],
  );

  const decide = useCallback(
    async (body: Record<string, unknown>, pickId: string, moveOn: boolean) => {
      if (stateRef.current.busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await call("/api/picks/decision", { method: "POST", body: JSON.stringify(body) });
        setRemoving(null);
        if (moveOn) await afterDecision(pickId);
        else await load();
      } catch (error) {
        fail(error);
      } finally {
        setBusy(false);
      }
    },
    [afterDecision, fail, load],
  );

  const approve = useCallback(
    (pickId: string) => decide({ pickId, decision: "approve" }, pickId, true),
    [decide],
  );
  const undo = useCallback((pickId: string) => decide({ pickId, decision: "undo" }, pickId, false), [decide]);
  const startRemove = useCallback((pickId: string) => setRemoving({ pickId, code: null, note: "" }), []);
  const cancelRemove = useCallback(() => setRemoving(null), []);
  const chooseCode = useCallback((code: RemoveReasonCode) => setRemoving((r) => (r ? { ...r, code } : r)), []);
  const setNote = useCallback((note: string) => setRemoving((r) => (r ? { ...r, note } : r)), []);
  const confirmRemove = useCallback(() => {
    const r = stateRef.current.removing;
    if (!r || !r.code) return;
    void decide(
      { pickId: r.pickId, decision: "remove", reasonCode: r.code, ...(r.note.trim() ? { note: r.note.trim() } : {}) },
      r.pickId,
      true,
    );
  }, [decide]);

  const publish = useCallback(
    async (digestId: string) => {
      const digest = stateRef.current.queue?.digests.find((d) => d.id === digestId);
      if (!digest || digest.status === "published") return;
      const firstUndecided = digest.needs.flatMap((n) => n.picks).find((p) => p.status === "suggested");
      if (firstUndecided) {
        setSelectedId(firstUndecided.id);
        setNotice(messages.undecidedBlocked.replace("{handle}", firstUndecided.card?.handle ?? firstUndecided.id));
        return;
      }
      setBusy(true);
      setNotice(null);
      try {
        await call(`/api/digests/${digestId}/publish`, { method: "POST" });
        await load();
      } catch (error) {
        fail(error);
      } finally {
        setBusy(false);
      }
    },
    [fail, load, messages.undecidedBlocked],
  );

  const runDaily = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await call<{ digests: number; picks: number }>("/api/picks/run", { method: "POST", body: "{}" });
      setNotice(messages.runDone.replace("{digests}", String(result.digests)).replace("{picks}", String(result.picks)));
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }, [fail, load, messages.runDone]);

  // Keyboard flow. There is no key that acts on more than one pick.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      const { selectedId: id, removing: rm, queue: q } = stateRef.current;
      const selected = flat.find((f) => f.pick.id === id);
      const inReview = selected?.digest.status === "draft";
      const action = keyAction({
        key: event.key,
        typing,
        removing: rm !== null,
        canDecide: Boolean(selected && inReview && selected.pick.status === "suggested"),
        canUndo: Boolean(selected && inReview && selected.pick.status !== "suggested"),
      });
      if (!action) return;
      if (action.type !== "approve" && action.type !== "undo" && action.type !== "publish") event.preventDefault();
      switch (action.type) {
        case "move":
          move(action.delta);
          break;
        case "approve":
          if (selected) void approve(selected.pick.id);
          break;
        case "startRemove":
          if (selected) startRemove(selected.pick.id);
          break;
        case "undo":
          if (selected) void undo(selected.pick.id);
          break;
        case "publish": {
          const digestId = selected?.digest.id ?? q?.digests[0]?.id;
          if (digestId) void publish(digestId);
          break;
        }
        case "help":
          setHelpOpen((open) => !open);
          break;
        case "chooseCode":
          chooseCode(action.code);
          break;
        case "confirmRemove":
          confirmRemove();
          break;
        case "cancelRemove":
          cancelRemove();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, move, approve, undo, publish, startRemove, cancelRemove, confirmRemove, chooseCode]);

  return {
    queue,
    loadError,
    selectedId,
    setSelectedId,
    removing,
    notice,
    busy,
    helpOpen,
    setHelpOpen,
    approve,
    undo,
    startRemove,
    cancelRemove,
    chooseCode,
    setNote,
    confirmRemove,
    publish,
    runDaily,
  };
}
