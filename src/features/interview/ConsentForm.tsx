"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VoiceConfig } from "@/contracts/voice";
import type { InterviewMode, UiLang } from "@/contracts";
import { Button } from "@/components/ui/button";
import { fmt, UI_LANGS, UI_LANG_NAMES } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { consentCopy } from "@/lib/i18n/content";
import { interviewMessages } from "./messages";

const CV_MAX_CHARS = 20000;

/** Both acknowledgements are required before the interview can start. */
export function canStartInterview(s: { interview: boolean; liveDemo: boolean; busy: boolean }): boolean {
  return s.interview && s.liveDemo && !s.busy;
}

/** The speech service named from the voice configuration, in the page's language. */
export function voiceServiceName(voice: VoiceConfig | null, browserName: string): string {
  if (voice === null) return "";
  return voice.adapter === "browser" ? browserName : voice.processor;
}

/** Consent, mode choice and start. No name is asked for here. */
export function ConsentForm() {
  const m = useMessages(interviewMessages);
  const c = useMessages(consentCopy);
  const uiLang = useUiLang();
  const router = useRouter();

  const [consentInterview, setConsentInterview] = useState(false);
  const [consentVoice, setConsentVoice] = useState(false);
  const [consentLiveDemo, setConsentLiveDemo] = useState(false);
  const [cvText, setCvText] = useState("");
  const [mode, setMode] = useState<InterviewMode>("express");
  const [lang, setLang] = useState<UiLang>(uiLang);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [voice, setVoice] = useState<VoiceConfig | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/voice/config", { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const parsed = VoiceConfig.safeParse(json);
        if (parsed.success) setVoice(parsed.data);
      })
      .catch(() => {});
    return () => abort.abort();
  }, []);

  const voiceAvailable = voice !== null && voice.adapter !== "none";
  // The configured service, named in the page's language (the server's processor text is English).
  const voiceService = voiceServiceName(voice, m.voiceProcessorBrowser);
  const canStart = canStartInterview({ interview: consentInterview, liveDemo: consentLiveDemo, busy });

  async function start() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          uiLang: lang,
          consent: { interview: true, voiceVendor: voiceAvailable && consentVoice, liveDemo: consentLiveDemo },
          ...(cvText.trim() !== "" ? { cvText: cvText.trim().slice(0, CV_MAX_CHARS) } : {}),
        }),
      });
      if (!res.ok) throw new Error(`start failed: ${res.status}`);
      const body = (await res.json()) as { interviewId: string };
      router.push(`/interview/${body.interviewId}${voiceAvailable && consentVoice ? "?voice=1" : ""}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{c.title}</h1>
      <p>{c.intro}</p>
      <ul className="list-disc space-y-1 pl-6">
        <li>{c.pointAi}</li>
        <li>{c.pointReview}</li>
        <li>{c.pointPrivate}</li>
        <li>{c.pointDontShare}</li>
        <li>{m.modelLine}</li>
      </ul>
      <p>
        <Link href="/how-it-works">{c.linkHow}</Link>
      </p>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canStart) void start();
        }}
      >
        <fieldset className="space-y-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              data-testid="consent-interview"
              checked={consentInterview}
              onChange={(e) => setConsentInterview(e.target.checked)}
            />
            <span>{c.checkInterview}</span>
          </label>
          {voiceAvailable ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                data-testid="consent-voice"
                checked={consentVoice}
                onChange={(e) => setConsentVoice(e.target.checked)}
              />
              <span>
                {fmt(c.checkVoice, { processor: voiceService })} <em>{c.checkVoiceHelp}</em>
              </span>
            </label>
          ) : null}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              data-testid="consent-live-demo"
              checked={consentLiveDemo}
              onChange={(e) => setConsentLiveDemo(e.target.checked)}
            />
            <span>{c.checkLiveDemo}</span>
          </label>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="cv-text" className="font-medium">
            {m.cvLabel}
          </label>
          <p className="text-sm">{m.cvHelp}</p>
          <textarea
            id="cv-text"
            data-testid="cv-text"
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            rows={5}
            maxLength={CV_MAX_CHARS}
            className="block w-full rounded-md border px-2 py-1"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="font-medium">{m.modeTitle}</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="mode"
              data-testid="mode-express"
              checked={mode === "express"}
              onChange={() => setMode("express")}
            />
            <span>
              <strong>{m.modeExpress}</strong> {m.modeExpressHelp}
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="mode"
              data-testid="mode-full"
              checked={mode === "full"}
              onChange={() => setMode("full")}
            />
            <span>
              <strong>{m.modeFull}</strong> {m.modeFullHelp}
            </span>
          </label>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="interview-lang" className="font-medium">
            {c.language}
          </label>
          <select
            id="interview-lang"
            data-testid="interview-language"
            value={lang}
            onChange={(e) => setLang(e.target.value as UiLang)}
            className="block rounded-md border px-2 py-1"
          >
            {UI_LANGS.map((code) => (
              <option key={code} value={code}>
                {UI_LANG_NAMES[code]}
              </option>
            ))}
          </select>
          <p className="text-sm">{c.languageHelp}</p>
        </div>

        {failed ? (
          <p role="alert" data-testid="start-error">
            {m.startError}
          </p>
        ) : null}
        <Button type="submit" data-testid="start-interview" disabled={!canStart}>
          {busy ? m.starting : c.start}
        </Button>
      </form>
      <p className="text-sm">{c.prototype}</p>
    </main>
  );
}
