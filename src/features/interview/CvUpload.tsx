"use client";

import { useEffect, useRef, useState } from "react";
import { CvUploadError, CvUploadResponse, type CvRemovedKind } from "@/contracts";
import { Button } from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import { interviewMessages } from "./messages";

type M = (typeof interviewMessages)["en"];

/** Same limit as the server (`CV_PDF_MAX_BYTES`): a larger file is refused here, before it is sent. */
const MAX_BYTES = 2 * 1024 * 1024;

const KIND_ORDER: readonly CvRemovedKind[] = ["name", "contact", "id", "date", "personal", "section", "protected", "country"];

const KIND_LABEL: Record<CvRemovedKind, keyof M> = {
  name: "cvRemovedName",
  contact: "cvRemovedContact",
  id: "cvRemovedId",
  date: "cvRemovedDate",
  personal: "cvRemovedPersonal",
  section: "cvRemovedSection",
  protected: "cvRemovedProtected",
  country: "cvRemovedCountry",
};

const ERROR_TEXT: Record<CvUploadError, keyof M> = {
  too_large: "cvErrorTooLarge",
  not_pdf: "cvErrorNotPdf",
  no_text: "cvErrorNoText",
  too_many_pages: "cvErrorPages",
  busy: "cvErrorBusy",
  unreadable: "cvErrorFailed",
};

/** "your name, contact details and dates and years": which kinds were removed, never what. */
export function cvRemovedSummary(removed: Partial<Record<CvRemovedKind, number>>, m: M): string {
  const parts = KIND_ORDER.filter((k) => (removed[k] ?? 0) > 0).map((k) => m[KIND_LABEL[k]]);
  if (parts.length === 0) return m.cvReadNothing;
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} ${m.cvAnd} ${parts[parts.length - 1]}`;
  return fmt(m.cvReadDone, { list });
}

/**
 * What the CV box holds after a file is read. A box with text in it is never overwritten: the
 * file's text goes after it with an empty line between, as far as the box's limit allows.
 * `appended` says that the person's own text was kept; `fitted` is false when nothing could be added.
 */
export function mergeCvText(current: string, uploaded: string, limit: number): { text: string; appended: boolean; fitted: boolean } {
  if (current.trim() === "") return { text: uploaded.slice(0, limit), appended: false, fitted: true };
  const head = current.replace(/\s+$/, "");
  const room = limit - head.length - 2;
  if (room <= 0 || uploaded.trim() === "") return { text: current, appended: true, fitted: false };
  return { text: `${head}\n\n${uploaded.slice(0, room)}`, appended: true, fitted: true };
}

/** What the server's error answer means for the person. */
export function cvErrorText(body: unknown, m: M): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  const parsed = CvUploadError.safeParse(code);
  return m[parsed.success ? ERROR_TEXT[parsed.data] : "cvErrorFailed"];
}

type Status = { kind: "idle" } | { kind: "reading" } | { kind: "done"; text: string } | { kind: "error"; text: string };

/**
 * Upload a CV as PDF. The server reads its text, removes personal data by fixed rules and sends
 * the text back; it lands in the CV box (after anything already written there), where the
 * person can check and change it before starting. Only that text is ever sent on, and only when they press start.
 */
export function CvUpload({
  enabled,
  current,
  limit,
  onText,
}: {
  enabled: boolean;
  /** What is in the CV box now, so that an upload is added after it and never replaces it. */
  current: string;
  limit: number;
  onText: (text: string) => void;
}) {
  const m = useMessages(interviewMessages);
  // The box can change while a file is being read: the answer is merged with what is there when it arrives.
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function read(file: File) {
    if (file.size > MAX_BYTES) return setStatus({ kind: "error", text: m.cvErrorTooLarge });
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return setStatus({ kind: "error", text: m.cvErrorNotPdf });
    }
    setStatus({ kind: "reading" });
    try {
      const res = await fetch("/api/interview/cv", { method: "POST", headers: { "content-type": "application/pdf" }, body: file });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) return setStatus({ kind: "error", text: cvErrorText(json, m) });
      const parsed = CvUploadResponse.safeParse(json);
      if (!parsed.success) return setStatus({ kind: "error", text: m.cvErrorFailed });
      const merged = mergeCvText(currentRef.current, parsed.data.text, limit);
      if (merged.fitted) onText(merged.text);
      const note = !merged.appended ? "" : merged.fitted ? ` ${m.cvAddedAfter}` : ` ${m.cvNoRoom}`;
      setStatus({ kind: "done", text: `${cvRemovedSummary(parsed.data.removed, m)}${note}` });
    } catch {
      setStatus({ kind: "error", text: m.cvErrorFailed });
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="we-sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="cv-upload"
          disabled={!enabled || status.kind === "reading"}
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = ""; // the same file can be picked again after an edit
            if (file) void read(file);
          }}
        />
        <Button type="button" variant="ghost" data-testid="cv-upload-button" disabled={!enabled || status.kind === "reading"} onClick={() => input.current?.click()}>
          {status.kind === "reading" ? m.cvReading : m.cvUpload}
        </Button>
        {!enabled ? <span className="we-hint-line">{m.cvUploadNeedsConsent}</span> : null}
      </div>
      {status.kind === "done" ? (
        <p className="we-hint-line" role="status" data-testid="cv-upload-status">
          {status.text}
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p className="we-err" role="alert" data-testid="cv-upload-error">
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
