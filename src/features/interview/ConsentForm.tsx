"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VoiceConfig } from "@/contracts/voice";
import type { InterviewMode, UiLang } from "@/contracts";
import { Button, ChoiceCard, ErrorState, Field, InterviewerMascot, PrototypeLine, Select, Textarea } from "@/components/we";
import { fmt, UI_LANGS, UI_LANG_NAMES } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { consentCopy, errorCopy } from "@/lib/i18n/content";
import { requestMicPermission } from "@/features/voice/micMeter";
import { CvUpload } from "./CvUpload";
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

/** The voice consent line: the own-server text for the `server` adapter, else the `{processor}` text. */
export function voiceConsentText(
  voice: VoiceConfig | null,
  copy: { checkVoice: string; checkVoiceServer: string },
  browserName: string,
): string {
  if (voice?.adapter === "server") return copy.checkVoiceServer;
  return fmt(copy.checkVoice, { processor: voiceServiceName(voice, browserName) });
}

/**
 * What the start request says about voice: whether the person ticked the box, and whether the
 * text beside it was the own-server wording. The server stores that with the consent, and the
 * interview then never uses another speech service for this person.
 */
export function voiceConsentRequest(voice: VoiceConfig | null, ticked: boolean): { voiceVendor: boolean; voiceOwnServer?: true } {
  const available = voice !== null && voice.adapter !== "none";
  if (!available || !ticked) return { voiceVendor: false };
  return voice.adapter === "server" ? { voiceVendor: true, voiceOwnServer: true } : { voiceVendor: true };
}

/** Consent, mode choice and start. No name is asked for here. */
export function ConsentForm() {
  const m = useMessages(interviewMessages);
  const c = useMessages(consentCopy);
  const e = useMessages(errorCopy);
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
  const voiceText = voiceConsentText(voice, c, m.voiceProcessorBrowser);
  const canStart = canStartInterview({ interview: consentInterview, liveDemo: consentLiveDemo, busy });

  async function start() {
    setBusy(true);
    setFailed(false);
    // Ask for the microphone at this click, so the first hold of the talk button is not lost to
    // the browser's permission question. A refusal changes nothing here: the room offers typing.
    if (voiceAvailable && consentVoice) void requestMicPermission().catch(() => {});
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          uiLang: lang,
          consent: { interview: true, ...voiceConsentRequest(voice, consentVoice), liveDemo: consentLiveDemo },
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
    <div className="we-consent-wrap">
      <form
        className="we-consent-card"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (canStart) void start();
        }}
      >
        <span className="we-tape" aria-hidden="true" />
        <header className="we-consent-head">
          <InterviewerMascot state="idle" badgeLabel="" hideBadge />
          <div>
            <h1>{c.title}</h1>
            <p>{c.intro}</p>
          </div>
        </header>

        <ul className="we-points">
          <li className="we-lead">{c.pointAi}</li>
          <li>{c.pointReview}</li>
          <li>{c.pointPrivate}</li>
          <li>{c.pointDontShare}</li>
          <li>{m.modelLine}</li>
        </ul>
        <p className="we-consent-link">
          <Link href="/how-it-works">{c.linkHow}</Link>
        </p>

        <fieldset className="we-consent-section">
          <legend className="we-sr-only">{m.consentLegend}</legend>
          <div className="we-consent-form-stack">
            <ChoiceCard
              type="checkbox"
              title={c.checkInterview}
              data-testid="consent-interview"
              checked={consentInterview}
              onChange={(ev) => setConsentInterview(ev.target.checked)}
            />
            {voiceAvailable ? (
              <ChoiceCard
                type="checkbox"
                title={voiceText}
                help={c.checkVoiceHelp}
                data-testid="consent-voice"
                checked={consentVoice}
                onChange={(ev) => setConsentVoice(ev.target.checked)}
              />
            ) : null}
            <ChoiceCard
              type="checkbox"
              title={c.checkLiveDemo}
              data-testid="consent-live-demo"
              checked={consentLiveDemo}
              onChange={(ev) => setConsentLiveDemo(ev.target.checked)}
            />
          </div>
        </fieldset>

        <Field className="we-consent-field" label={c.language} hint={c.languageHelp}>
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} data-testid="interview-language" value={lang} onChange={(ev) => setLang(ev.target.value as UiLang)}>
              {UI_LANGS.map((code) => (
                <option key={code} value={code}>
                  {UI_LANG_NAMES[code]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset className="we-consent-section">
          <legend>{m.modeTitle}</legend>
          <div className="we-choice-grid">
            <ChoiceCard type="radio" name="mode" title={m.modeExpress} help={m.modeExpressHelp} data-testid="mode-express" checked={mode === "express"} onChange={() => setMode("express")} />
            <ChoiceCard type="radio" name="mode" title={m.modeFull} help={m.modeFullHelp} data-testid="mode-full" checked={mode === "full"} onChange={() => setMode("full")} />
          </div>
        </fieldset>

        <Field className="we-consent-field" label={m.cvLabel} hint={m.cvHelp}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              data-testid="cv-text"
              value={cvText}
              onChange={(ev) => setCvText(ev.target.value)}
              rows={5}
              maxLength={CV_MAX_CHARS}
            />
          )}
        </Field>
        <CvUpload enabled={consentInterview} onText={(text) => setCvText(text.slice(0, CV_MAX_CHARS))} />
        {/* Reading a LinkedIn profile needs a partnership with LinkedIn: shown, but it does nothing yet. */}
        <div className="mt-2 flex flex-wrap items-center gap-3" data-testid="linkedin-fill">
          <Button type="button" variant="ghost" disabled aria-describedby="linkedin-fill-soon" data-testid="linkedin-fill-button">
            {m.linkedinButton}
          </Button>
          <span id="linkedin-fill-soon" className="we-hint-line" data-testid="linkedin-fill-soon">
            {m.linkedinSoon}
          </span>
        </div>

        {failed ? <ErrorState testId="start-error" message={m.startError} action={{ label: e.retry, onClick: () => void start() }} /> : null}

        <div className="we-consent-start">
          {!canStart && !busy ? <p className="we-start-reason">{m.startReason}</p> : null}
          <Button type="submit" variant="primary" size="lg" data-testid="start-interview" disabled={!canStart}>
            {busy ? m.starting : c.start}
          </Button>
        </div>
      </form>
      <PrototypeLine>{c.prototype}</PrototypeLine>
    </div>
  );
}
