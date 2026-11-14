"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueueDigest, QueuePick, ReviewQueue } from "./queue-view";
import type { RemoveReasonCode } from "./constants";
import { keyAction } from "./keys";
import { organiserErrorLine, type organiserMessages } from "./messages";

/** `warned`: the server said the note touches personal characteristics; the next Confirm is the second confirmation. */
type Removing = { pickId: string; code: RemoveReasonCode | null; note: string; warned?: boolean };

class ApiError extends Error {
  constructor(readonly code: string | null) {
    super(code ?? "error");
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  if (!res.ok) throw new ApiError(body?.error?.code ?? null);
  return body as T;
}

export type FlatPick = { pick: QueuePick; digest: QueueDigest };

/** The handle a pick is listed under. */
export function pickHandle(p: QueuePick): string {
  return p.card?.handle ?? p.id;
}

/**
 * People are listed A to Z by nickname, and by nothing else: the server's seeded shuffle is replaced here
 * so the order on screen is the order the page says it is. Keyboard movement follows the same order.
 */
export function alphabetical(queue: ReviewQueue): ReviewQueue {
  const byHandle = (a: QueuePick, b: QueuePick) => {
    const x = pickHandle(a);
    const y = pickHandle(b);
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  return {
    ...queue,
    digests: queue.digests.map((d) => ({ ...d, needs: d.needs.map((n) => ({ ...n, picks: [...n.picks].sort(byHandle) })) })),
  };
}

/**
 * State and actions of the review queue, kept out of the markup. One decision per call:
 * there is no function here that acts on more than one pick.
 */
export function useReviewQueue(messages: (typeof organiserMessages)["en"]) {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pickedId, setSelectedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The company the page is showing. Keys act only on picks and digests of this company.
  const [shownDigestId, setShownDigestId] = useState<string | null>(null);
  // Set by moves the person made, so the page scrolls only for those.
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const stateRef = useRef<{
    queue: ReviewQueue | null;
    selectedId: string | null;
    removing: Removing | null;
    busy: boolean;
    helpOpen: boolean;
    shownDigestId: string | null;
  }>({
    queue: null,
    selectedId: null,
    removing: null,
    busy: false,
    helpOpen: false,
    shownDigestId: null,
  });

  const load = useCallback(async () => {
    try {
      const q = alphabetical(await call<ReviewQueue>("/api/picks/queue"));
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
        if (!cancelled) setQueue(alphabetical(q));
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
    stateRef.current = { queue, selectedId, removing, busy, helpOpen, shownDigestId };
  });

  const fail = useCallback(
    (error: unknown) => {
      const code = error instanceof ApiError ? error.code : null;
      if (code === "protected_note") {
        setRemoving((r) => (r ? { ...r, warned: true } : r));
        setNotice(organiserErrorLine(messages, code));
        return;
      }
      setNotice(messages.actionFailed.replace("{message}", organiserErrorLine(messages, code)));
    },
    [messages],
  );

  const move = useCallback(
    (delta: number): boolean => {
      const { selectedId: current, shownDigestId: shown } = stateRef.current;
      const here = shown ? flat.filter((f) => f.digest.id === shown) : flat;
      if (here.length === 0) return false;
      const i = Math.max(0, here.findIndex((f) => f.pick.id === current));
      const next = here[Math.min(here.length - 1, Math.max(0, i + delta))].pick.id;
      if (next === current) return false;
      setSelectedId(next);
      setScrollToId(next);
      setRemoving(null);
      return true;
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
      if (next) {
        setSelectedId(next.id);
        setScrollToId(next.id);
      }
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
  const startRemove = useCallback((pickId: string) => {
    setNotice(null);
    setRemoving({ pickId, code: null, note: "" });
  }, []);
  const cancelRemove = useCallback(() => setRemoving(null), []);
  /**
   * The reason dialog owns its fields and hands them over here. When the server warned about the note and the
   * same note is confirmed again, that is the second confirmation; an edited note starts over.
   */
  const confirmRemove = useCallback(
    (v: { reasonCode: RemoveReasonCode; note: string }) => {
      const r = stateRef.current.removing;
      if (!r) return;
      const note = v.note.trim();
      const second = Boolean(r.warned) && r.note === note;
      setRemoving({ ...r, code: v.reasonCode, note, warned: second });
      void decide(
        { pickId: r.pickId, decision: "remove", reasonCode: v.reasonCode, ...(note ? { note } : {}), ...(second ? { confirmProtected: true } : {}) },
        r.pickId,
        true,
      );
    },
    [decide],
  );

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
      const { selectedId: id, removing: rm, queue: q, helpOpen: help, shownDigestId: shown } = stateRef.current;
      // The reason dialog and the key list are modal: they take the keys while open.
      if (rm !== null) return;
      if (help && event.key !== "?") return;
      // A pick that is not on screen is never the target of a key.
      const found = flat.find((f) => f.pick.id === id);
      const selected = found && (!shown || found.digest.id === shown) ? found : undefined;
      const inReview = selected?.digest.status === "draft";
      const action = keyAction({
        key: event.key,
        typing,
        removing: rm !== null,
        canDecide: Boolean(selected && inReview && selected.pick.status === "suggested"),
        canUndo: Boolean(selected && inReview && selected.pick.status !== "suggested"),
      });
      if (!action) return;
      if (action.type !== "approve" && action.type !== "undo" && action.type !== "publish" && action.type !== "move")
        event.preventDefault();
      switch (action.type) {
        case "move":
          // Arrow keys keep scrolling the page unless they moved the selection.
          if (move(action.delta)) event.preventDefault();
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
          const digestId = shown ?? selected?.digest.id ?? q?.digests[0]?.id;
          if (digestId) void publish(digestId);
          break;
        }
        case "help":
          setHelpOpen((open) => !open);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, move, approve, undo, publish, startRemove]);

  return {
    queue,
    loadError,
    selectedId,
    setSelectedId,
    setShownDigestId,
    scrollToId,
    removing,
    notice,
    busy,
    helpOpen,
    setHelpOpen,
    approve,
    undo,
    startRemove,
    cancelRemove,
    confirmRemove,
    publish,
    runDaily,
    reload: load,
  };
}
