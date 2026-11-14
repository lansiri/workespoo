"use client";

/**
 * The room's top bar. The page renders the site shell itself so that it can fill the bar with the
 * question progress and the Stop button, but what those show lives in the room below it. A tiny
 * store, created per page, carries it from the room up to the bar: the room publishes, the bar
 * subscribes. Nothing here fetches or knows about the interview beyond what it is given.
 */
import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Dialog, InterviewProgress } from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import { interviewCopy } from "@/lib/i18n/content";
import type { InterviewMode } from "@/contracts";
import { interviewMessages } from "./messages";

export type RoomChromeState = {
  /** Questions the interviewer has asked so far (the opening counts). */
  asked: number;
  /** The closing line has been sent. */
  finished: boolean;
  /** Stop is offered while the conversation runs. */
  stoppable: boolean;
  /** Ends the interview early. Set by the room. */
  stop: (() => void) | null;
};

type Store = {
  get: () => RoomChromeState;
  set: (patch: Partial<RoomChromeState>) => void;
  subscribe: (listener: () => void) => () => void;
};

function createStore(initial: RoomChromeState): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch };
      if ((Object.keys(next) as (keyof RoomChromeState)[]).every((k) => next[k] === state[k])) return;
      state = next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

type Ctx = { store: Store; mode: InterviewMode };
const RoomChromeContext = createContext<Ctx | null>(null);

export function RoomChromeProvider(props: { mode: InterviewMode; initialAsked: number; initialFinished: boolean; children: ReactNode }) {
  const [store] = useState(() => createStore({ asked: props.initialAsked, finished: props.initialFinished, stoppable: !props.initialFinished, stop: null }));
  return <RoomChromeContext.Provider value={{ store, mode: props.mode }}>{props.children}</RoomChromeContext.Provider>;
}

function useCtx(): Ctx | null {
  return useContext(RoomChromeContext);
}

/** For the room: publish what the bar shows. A no-op outside a provider (the room alone, in tests). */
export function useRoomChromePublisher(): (patch: Partial<RoomChromeState>) => void {
  const store = useCtx()?.store;
  return useCallback((patch) => store?.set(patch), [store]);
}

function useChrome(ctx: Ctx | null): RoomChromeState | null {
  const store = ctx?.store;
  return useSyncExternalStore(
    (cb) => (store ? store.subscribe(cb) : () => {}),
    () => (store ? store.get() : null),
    () => (store ? store.get() : null),
  );
}

/** Dashes in the bar: three for the short interview, five for the full one (or more once it runs longer). */
export function progressDashes(mode: InterviewMode, asked: number): number {
  return mode === "express" ? 3 : Math.max(5, asked);
}

/** "Question 2 of 5" and the dashes. The label says "5–7" for the full interview, which has no fixed length. */
export function RoomProgress() {
  const ctx = useCtx();
  const chrome = useChrome(ctx);
  const m = useMessages(interviewMessages);
  const c = useMessages(interviewCopy);
  if (!ctx || !chrome) return null;
  const total = ctx.mode === "express" ? m.progressTotalExpress : m.progressTotalFull;
  const dashes = progressDashes(ctx.mode, chrome.asked);
  const step = Math.max(0, Math.min(dashes - 1, chrome.asked - 1));
  return <InterviewProgress label={chrome.finished ? m.badgeFinished : fmt(c.progress, { n: Math.max(1, Math.min(chrome.asked, 99)), total })} step={step} total={dashes} finished={chrome.finished} />;
}

/** Stop in the top bar, with the "Stop the interview?" question. Hidden once the conversation is over. */
export function RoomStopButton() {
  const ctx = useCtx();
  const chrome = useChrome(ctx);
  const m = useMessages(interviewMessages);
  const c = useMessages(interviewCopy);
  const [open, setOpen] = useState(false);
  if (!chrome || !chrome.stoppable || chrome.finished) return null;
  const close = () => setOpen(false);
  return (
    <>
      <Button icon="stop" className="we-iv-stop-link" data-testid="stop-interview" onClick={() => setOpen(true)}>
        {c.stop}
      </Button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <Dialog
              title={m.stopTitle}
              testId="stop-dialog"
              onClose={close}
              initialFocus="[data-keep]"
              actions={
                <>
                  <Button data-keep="" onClick={close}>
                    {m.stopKeep}
                  </Button>
                  <Button
                    variant="primary"
                    data-testid="stop-confirm"
                    onClick={() => {
                      close();
                      chrome.stop?.();
                    }}
                  >
                    {m.stopConfirmButton}
                  </Button>
                </>
              }
            >
              <p>{m.stopBody}</p>
            </Dialog>,
            document.body,
          )
        : null}
    </>
  );
}
