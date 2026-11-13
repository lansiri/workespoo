"use client";

import Link from "next/link";
import { useState } from "react";
import type { CardForPerson, LookingFor, SignalKind } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approvalCopy, cardCopy, coreCopy, poolCopy } from "@/lib/i18n/content";
import { useMessages } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n";
import { cardMessages } from "./messages";
import { useCard } from "./useCard";

type PersonSignal = CardForPerson["signals"][number];
const GROUPS: Array<{ kind: SignalKind; key: "groupSkill" | "groupTool" | "groupKnowledge" | "groupDomain" }> = [
  { kind: "skill", key: "groupSkill" },
  { kind: "tool", key: "groupTool" },
  { kind: "knowledge", key: "groupKnowledge" },
  { kind: "domain", key: "groupDomain" },
];

export function CardReview() {
  const m = useMessages(cardMessages);
  const c = useMessages(cardCopy);
  const a = useMessages(approvalCopy);
  const core = useMessages(coreCopy);
  const { state, busy, actionError, sensitiveSignalId, retry, edit, approve, setPool, deleteMyData } = useCard();

  if (state.phase === "loading") return <main className="mx-auto max-w-2xl p-6"><p>{core.loading}</p></main>;
  if (state.phase === "signed_out") return <main className="mx-auto max-w-2xl p-6"><p data-testid="card-signed-out">{m.signedOut}</p></main>;
  if (state.phase === "pending") {
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-6">
        <p data-testid="card-waiting" role="status">{m.waiting}</p>
        {state.waitedLong ? (
          <>
            <p>{m.waitingLong}</p>
            <Button type="button" variant="outline" onClick={retry}>{core.tryAgain}</Button>
          </>
        ) : null}
      </main>
    );
  }
  if (state.phase === "error") {
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-6">
        <p data-testid="card-error" role="alert">{m.loadFailed}</p>
        <Button type="button" variant="outline" onClick={retry}>{core.tryAgain}</Button>
      </main>
    );
  }

  const card = state.card;
  const active = card.signals.filter((s) => s.status !== "removed");
  const removed = card.signals.filter((s) => s.status === "removed");
  // Approval never waits for a rewrite: it uses the company text that is current.
  const canApprove = active.length > 0 && !busy;
  const errorText =
    actionError === null ? null : actionError === "stale_rendering" ? m.staleError : actionError === "approve_empty" ? a.approveEmpty : actionError === "delete_failed" ? m.deleteFailed : m.saveFailed;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{c.title}</h1>
        <p>{c.intro}</p>
        <p>{fmt(c.handle, { handle: card.handle })}</p>
        {card.status === "draft" && card.hasApprovedVersion ? <p>{m.draftNotice} {a.editAgainHelp}</p> : null}
        {card.reworded.length > 0 ? <p role="status" data-testid="card-reworded">{m.reworded}</p> : null}
      </header>

      <section aria-labelledby="preview-title" className="space-y-1 rounded-md border p-4" data-testid="company-preview">
        <h2 id="preview-title" className="font-medium">{c.previewTitle}</h2>
        <p data-testid="card-headline" className="text-lg">{card.headline}</p>
        {card.summary ? <p>{card.summary}</p> : null}
        <p className="text-sm">{c.renderingLabel}</p>
      </section>

      {active.length === 0 ? <p data-testid="card-empty">{a.approveEmpty}</p> : null}

      {GROUPS.map(({ kind, key }) => {
        const signals = active.filter((s) => s.kind === kind);
        if (signals.length === 0) return null;
        return (
          <section key={kind} aria-label={c[key]} className="space-y-3">
            <h2 className="text-lg font-medium">{c[key]}</h2>
            <ul className="space-y-3">
              {signals.map((s) => (
                <SignalItem
                  key={s.id}
                  signal={s}
                  busy={busy}
                  sensitive={sensitiveSignalId === s.id}
                  reworded={card.reworded.includes(s.id)}
                  onRemove={() => void edit({ op: "remove", signalId: s.id })}
                  onPhrase={(phrase) => edit({ op: "phrase", signalId: s.id, phrase })}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {removed.length > 0 ? (
        <section aria-label={m.removedHeading} className="space-y-2">
          <h2 className="text-lg font-medium">{m.removedHeading}</h2>
          <ul>
            {removed.map((s) => (
              <li key={s.id} data-testid="removed-signal" data-signal-id={s.id} className="flex items-center gap-3">
                <span>{c.removed} {s.phrase}</span>
                <Button type="button" variant="ghost" size="sm" data-testid="signal-undo" disabled={busy} onClick={() => void edit({ op: "restore", signalId: s.id })}>
                  {c.undo}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <LookingForForm key={JSON.stringify(card.lookingFor)} value={card.lookingFor} busy={busy} onSave={(lookingFor) => edit({ op: "lookingFor", lookingFor })} />

      {errorText ? <p role="alert" data-testid="card-action-error">{errorText}</p> : null}

      {card.status === "draft" ? (
        <section className="space-y-2">
          <Button type="button" data-testid="approve-card" disabled={!canApprove} onClick={() => void approve()}>
            {a.approve}
          </Button>
        </section>
      ) : (
        <p data-testid="card-approved">{a.approved}</p>
      )}

      {card.status === "approved" || card.hasApprovedVersion ? (
        <section className="space-y-2 rounded-md border p-4">
          <PoolBox inPool={card.inPool} busy={busy} onChange={(v) => void setPool(v)} />
          <p>
            <Link href="/matches" data-testid="go-to-matches" className="underline">{m.seeMatches}</Link>
          </p>
        </section>
      ) : null}

      <MyData busy={busy} onDelete={() => void deleteMyData()} />
    </main>
  );
}

function MyData({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  const m = useMessages(cardMessages);
  const [confirming, setConfirming] = useState(false);
  return (
    <section aria-labelledby="my-data-title" className="space-y-2 rounded-md border p-4">
      <h2 id="my-data-title" className="font-medium">{m.myDataTitle}</h2>
      <p>{m.myDataHelp}</p>
      <p>
        <a href="/api/me/export" download data-testid="export-data" className="underline">{m.exportData}</a>
      </p>
      {confirming ? (
        <div className="space-y-2">
          <p role="alert">{m.deleteWarning}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" data-testid="delete-data-confirm" disabled={busy} onClick={onDelete}>{m.deleteConfirm}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>{m.deleteCancel}</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" data-testid="delete-data" disabled={busy} onClick={() => setConfirming(true)}>{m.deleteData}</Button>
      )}
    </section>
  );
}

function PoolBox({ inPool, busy, onChange }: { inPool: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  const p = useMessages(poolCopy);
  return (
    <div className="space-y-2">
      <h2 className="font-medium">{p.title}</h2>
      <p>{p.body}</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" data-testid="pool-opt-in" checked={inPool} disabled={busy} onChange={(e) => onChange(e.target.checked)} />
        <span>{p.yes}</span>
      </label>
      <p className="text-sm">{inPool ? p.statusIn : p.noHelp}</p>
    </div>
  );
}

function SignalItem(props: {
  signal: PersonSignal;
  busy: boolean;
  sensitive: boolean;
  reworded: boolean;
  onRemove: () => void;
  onPhrase: (phrase: string) => Promise<boolean>;
}) {
  const { signal: s } = props;
  const m = useMessages(cardMessages);
  const c = useMessages(cardCopy);
  const core = useMessages(coreCopy);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.phraseOwn ?? s.phrase);

  async function save() {
    if (await props.onPhrase(text)) setEditing(false);
  }

  return (
    <li data-testid="card-signal" data-signal-id={s.id} className="space-y-2 rounded-md border p-4">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor={`phrase-${s.id}`}>{m.phraseLabel}</label>
          <Input id={`phrase-${s.id}`} data-testid="signal-phrase-input" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} />
          <Button type="button" size="sm" data-testid="signal-phrase-save" disabled={props.busy || text.trim().length < 2} onClick={() => void save()}>{core.save}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{core.cancel}</Button>
        </div>
      ) : (
        <p className="font-medium" data-testid="signal-phrase">{s.phraseOwn ?? s.phrase}</p>
      )}
      {s.phraseOwn && s.phraseOwn !== s.phrase ? (
        <p className="text-sm" data-testid="signal-shown-as">{m.shownAs} {s.phrase}</p>
      ) : null}
      {props.sensitive ? <p role="status" data-testid="signal-sensitive-warning">{c.sensitiveWarning}</p> : null}
      {s.addedBy === "person" ? <p className="text-sm">{c.addedByYou}</p> : null}
      <p className="text-sm" data-testid="signal-esco">
        {s.esco ? `${s.esco.labelEn}${s.esco.labelFi ? ` · ${s.esco.labelFi}` : ""}` : c.noEsco}
      </p>
      {s.quotes.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">{c.yourWords}</h3>
          <ul>
            {s.quotes.map((q, i) => (
              <li key={i} data-testid="signal-quote"><q>{q}</q></li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h3 className="text-sm font-medium">{c.companySees}</h3>
        <p data-testid="signal-rendering">{s.rendering ?? m.notShownYet}</p>
        {s.stale ? <p className="text-sm" data-testid="signal-rewriting">{m.rewriting}</p> : null}
        {props.reworded ? <p className="text-sm" data-testid="signal-reworded">{m.reworded}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" data-testid="signal-edit" disabled={props.busy} onClick={() => setEditing(true)}>{c.edit}</Button>
        <Button type="button" size="sm" variant="outline" data-testid="signal-remove" disabled={props.busy} onClick={props.onRemove}>{c.remove}</Button>
      </div>
    </li>
  );
}

const splitList = (text: string) => text.split(",").map((x) => x.trim()).filter(Boolean);

function LookingForForm(props: { value: LookingFor; busy: boolean; onSave: (v: LookingFor) => Promise<boolean> }) {
  const m = useMessages(cardMessages);
  const c = useMessages(cardCopy);
  const core = useMessages(coreCopy);
  const [roles, setRoles] = useState(props.value.roles.join(", "));
  const [workMode, setWorkMode] = useState<LookingFor["workMode"]>(props.value.workMode);
  const [startFrom, setStartFrom] = useState<LookingFor["startFrom"]>(props.value.startFrom);
  const [languages, setLanguages] = useState(props.value.workLanguages.join(", "));
  const [saved, setSaved] = useState(false);

  const workModes: Array<[NonNullable<LookingFor["workMode"]>, string]> = [
    ["onsite", c.workModeOnsite],
    ["hybrid", c.workModeHybrid],
    ["remote", c.workModeRemote],
    ["any", c.workModeAny],
  ];
  const starts: Array<[NonNullable<LookingFor["startFrom"]>, string]> = [
    ["now", c.startNow],
    ["within_1_month", c.startWithin1Month],
    ["within_3_months", c.startWithin3Months],
    ["later", c.startLater],
  ];

  return (
    <form
      data-testid="looking-for-form"
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await props.onSave({
          roles: splitList(roles).slice(0, 3),
          workMode,
          startFrom,
          workLanguages: splitList(languages).slice(0, 5),
        });
        setSaved(ok);
      }}
    >
      <h2 className="text-lg font-medium">{c.lookingForTitle}</h2>
      <p>{c.lookingForHelp}</p>
      <div>
        <label htmlFor="lf-roles">{c.lookingForRoles}</label>
        <Input id="lf-roles" data-testid="looking-for-roles" value={roles} onChange={(e) => setRoles(e.target.value)} />
        <p className="text-sm">{m.rolesHelp}</p>
      </div>
      <div>
        <label htmlFor="lf-mode">{c.lookingForWorkMode}</label>{" "}
        <select id="lf-mode" data-testid="looking-for-work-mode" value={workMode ?? ""} onChange={(e) => setWorkMode((e.target.value || null) as LookingFor["workMode"])}>
          <option value="">{m.notSet}</option>
          {workModes.map(([v, label]) => (<option key={v} value={v}>{label}</option>))}
        </select>
      </div>
      <div>
        <label htmlFor="lf-start">{c.lookingForStart}</label>{" "}
        <select id="lf-start" data-testid="looking-for-start" value={startFrom ?? ""} onChange={(e) => setStartFrom((e.target.value || null) as LookingFor["startFrom"])}>
          <option value="">{m.notSet}</option>
          {starts.map(([v, label]) => (<option key={v} value={v}>{label}</option>))}
        </select>
      </div>
      <div>
        <label htmlFor="lf-lang">{c.lookingForLanguages}</label>
        <Input id="lf-lang" data-testid="looking-for-languages" value={languages} onChange={(e) => setLanguages(e.target.value)} />
        <p className="text-sm">{m.languagesHelp}</p>
      </div>
      <Button type="submit" data-testid="looking-for-save" variant="outline" disabled={props.busy}>{core.save}</Button>
      {saved ? <span role="status">{m.saved}</span> : null}
    </form>
  );
}
