"use client";

import { useEffect, useRef, useState } from "react";
import type { CardForPerson, LookingFor, SignalKind } from "@/contracts";
import {
  ApproveBar,
  ApproveBox,
  Button,
  CompanyPreviewBanner,
  CompanyViewSwitch,
  DataControls,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PoolConsent,
  Select,
  SignalCard,
  Tag,
  type SignalCardGroup,
  type SkillRowData,
  type SkillRowText,
} from "@/components/we";
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

/** The person's Signal Card page. Data loading and every server call are in `useCard`. */
export function CardReview() {
  const m = useMessages(cardMessages);
  const c = useMessages(cardCopy);
  const a = useMessages(approvalCopy);
  const p = useMessages(poolCopy);
  const core = useMessages(coreCopy);
  const { state, busy, actionError, sensitiveSignalId, retry, edit, approve, setPool, deleteMyData } = useCard();
  const [view, setView] = useState<"person" | "company">("person");
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const firstView = useRef(true);

  // Switching to the company view moves focus to its banner, so a screen reader hears what changed.
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (view === "company") document.querySelector<HTMLElement>('[data-testid="company-preview-banner"]')?.focus();
  }, [view]);

  const head = (
    <div className="we-page-head">
      <h1>{c.title}</h1>
      <p>{c.intro}</p>
    </div>
  );
  if (state.phase === "loading") {
    return (
      <div className="we-page">
        {head}
        <LoadingState message={core.loading} />
      </div>
    );
  }
  if (state.phase === "signed_out") {
    return (
      <div className="we-page">
        {head}
        <EmptyState message={m.signedOut} testId="card-signed-out" />
        <p style={{ marginTop: 16 }}>
          <Button variant="primary" href="/interview">
            {m.signedOutLink}
          </Button>
        </p>
      </div>
    );
  }
  if (state.phase === "pending") {
    return (
      <div className="we-page">
        {head}
        <div data-testid="card-waiting">
          <LoadingState message={m.waiting} badgeLabel={m.waitingBadge} />
        </div>
        {state.waitedLong ? (
          <div style={{ marginTop: 16 }}>
            <p>{m.waitingLong}</p>
            <p style={{ marginTop: 12 }}>
              <Button variant="ghost" onClick={retry}>
                {core.tryAgain}
              </Button>
            </p>
          </div>
        ) : null}
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="we-page">
        {head}
        <ErrorState message={m.loadFailed} testId="card-error" action={{ label: core.tryAgain, onClick: retry }} />
      </div>
    );
  }

  const card = state.card;
  const company = view === "company";
  const active = card.signals.filter((s) => s.status !== "removed");
  const removedCount = card.signals.length - active.length;
  const approved = card.status === "approved";
  const poolOpen = approved || card.hasApprovedVersion;
  const rewriting = active.some((s) => s.stale);
  const errorText =
    actionError === null ? null : actionError === "stale_rendering" ? m.staleError : actionError === "approve_empty" ? a.approveEmpty : actionError === "delete_failed" ? m.deleteFailed : m.saveFailed;

  const rowOf = (s: PersonSignal): SkillRowData => {
    const notes: NonNullable<SkillRowData["notes"]> = [];
    if (s.phraseOwn && s.phraseOwn !== s.phrase) notes.push({ text: `${m.shownAs} ${s.phrase}`, testId: "signal-shown-as" });
    if (sensitiveSignalId === s.id) notes.push({ text: c.sensitiveWarning, testId: "signal-sensitive-warning" });
    if (s.stale && s.rendering !== null) notes.push({ text: m.rewriting, testId: "signal-rewriting" });
    if (card.reworded.includes(s.id)) notes.push({ text: m.reworded, testId: "signal-reworded" });
    return {
      id: s.id,
      // Companies see the stored phrase; the person sees their own wording first.
      phrase: company ? s.phrase : (s.phraseOwn ?? s.phrase),
      group: s.kind,
      esco: s.esco ? { en: s.esco.labelEn, fi: s.esco.labelFi ?? "" } : null,
      addedBy: s.addedBy === "person" ? "person" : "ai",
      rendering: s.rendering,
      removed: s.status === "removed",
      quotes: company ? [] : s.quotes.map((text) => ({ text })),
      notes,
    };
  };
  const shownSignals = company ? card.signals.filter((s) => s.status !== "removed" && s.rendering !== null) : card.signals;
  const groups: SignalCardGroup[] = GROUPS.map(({ kind, key }) => ({
    key: kind,
    title: c[key],
    rows: shownSignals.filter((s) => s.kind === kind).map(rowOf),
  })).filter((g) => g.rows.length > 0);

  const rowText: SkillRowText = {
    edit: c.edit,
    remove: c.remove,
    undo: c.undo,
    removedNote: c.removed,
    escoLabel: m.escoBox,
    noEsco: company ? m.noEscoShort : c.noEsco,
    yourWords: c.yourWords,
    shownAs: c.companySees,
    aiTag: m.aiTag,
    addedByYou: c.addedByYou,
    stale: a.approvePreparing,
    editAria: m.editAria,
    removeAria: m.removeAria,
    inputLabel: m.phraseLabel,
    save: core.save,
    cancel: core.cancel,
  };

  const tally = [
    active.length === 1 ? m.keptOne : fmt(m.keptMany, { n: active.length }),
    removedCount === 0 ? null : removedCount === 1 ? m.removedOne : fmt(m.removedMany, { n: removedCount }),
  ]
    .filter(Boolean)
    .join(" · ");
  const approveState = approved ? "approved" : active.length === 0 ? "empty" : busy ? "preparing" : "ready";
  const approveText = {
    sticker: m.yoursToApprove,
    title: m.approveTitle,
    help: card.status === "draft" && card.hasApprovedVersion ? `${m.draftNotice} ${a.editAgainHelp}` : m.approveHelp,
    approve: a.approve,
    preparing: a.approvePreparing,
    empty: a.approveEmpty,
    approved: a.approved,
    goToMatches: `${m.seeMatches} →`,
  };

  const lookingFor = company ? (
    <LookingForRead value={card.lookingFor} />
  ) : (
    <LookingForForm key={JSON.stringify(card.lookingFor)} value={card.lookingFor} busy={busy} onSave={(lookingFor) => edit({ op: "lookingFor", lookingFor })} />
  );
  const lookingForInCard = groups.length > 0 && !(active.length === 0);

  const footer = [
    card.synthetic ? m.footerSynthetic : null,
    approved ? m.stampLabel : card.hasApprovedVersion ? m.footerDraftEdit : m.footerDraft,
    m.footerEsco,
  ].filter((x): x is string => x !== null);

  return (
    <>
      <div className="we-cd-wrap">
        <div className="we-cd-intro">
          <div>
            <h1>{c.title}</h1>
            <p>{c.intro}</p>
            {card.status === "draft" && card.hasApprovedVersion ? <p>{m.draftNotice}</p> : null}
            {card.reworded.length > 0 ? (
              <p role="status" data-testid="card-reworded">
                {m.reworded}
              </p>
            ) : null}
            {rewriting && !company ? (
              <p role="status" data-testid="card-rewriting">
                {m.rewriting}
              </p>
            ) : null}
          </div>
          <CompanyViewSwitch value={view} onChange={setView} groupLabel={m.viewGroup} personLabel={m.viewPerson} companyLabel={c.previewTitle} />
        </div>

        <div data-testid={company ? "company-preview" : undefined}>
          {company ? <CompanyPreviewBanner className="we-cp-banner">{card.status === "draft" && card.hasApprovedVersion ? m.companyBannerDraft : m.companyBanner}</CompanyPreviewBanner> : null}
          <SignalCard
            view={view}
            approved={approved}
            handle={card.handle}
            handleAria={fmt(m.handleAria, { handle: card.handle })}
            header={{
              kicker: m.kicker,
              aiTag: m.aiTag,
              aiLabel: company ? m.aiLabelCompany : m.aiLabelPerson,
              headline: card.headline,
              summary: card.summary ?? "",
              readSummary: m.readSummary,
              hideSummary: m.hideSummary,
            }}
            orderNote={company ? m.companyLabel : m.orderNote}
            groups={groups}
            editing={
              editing && !company
                ? {
                    id: editing.id,
                    draft: editing.draft,
                    onDraftChange: (v) => setEditing({ id: editing.id, draft: v }),
                    onSave: () => {
                      void edit({ op: "phrase", signalId: editing.id, phrase: editing.draft }).then((ok) => {
                        if (ok) setEditing(null);
                      });
                    },
                    onCancel: () => setEditing(null),
                  }
                : undefined
            }
            rowText={rowText}
            lookingFor={lookingForInCard ? lookingFor : undefined}
            footer={footer}
            stampLabel={m.stampLabel}
            waitingText={m.waiting}
            waitingBadge={m.waitingBadge}
            emptyText={m.emptyText}
            errorText={m.loadFailed}
            onEditSignal={(id) => {
              const s = card.signals.find((x) => x.id === id);
              if (s) setEditing({ id, draft: s.phraseOwn ?? s.phrase });
            }}
            onRemoveSignal={(id) => void edit({ op: "remove", signalId: id })}
            onUndo={(id) => void edit({ op: "restore", signalId: id })}
            busy={busy}
          />
          {lookingForInCard ? null : <div className="we-cd-after">{lookingFor}</div>}
          {errorText ? (
            <ErrorState className="we-cd-after" message={errorText} testId="card-action-error" />
          ) : null}
        </div>

        <aside className="we-cd-side">
          {company ? (
            <div className="we-box">
              <h3>{m.sideNoScoreTitle}</h3>
              <p>{m.sideNoScoreBody}</p>
            </div>
          ) : (
            <>
              <ApproveBox state={approveState} tally={tally} text={approveText} onApprove={() => void approve()} />
              {!approved && card.hasApprovedVersion ? (
                <Button variant="ghost" href="/matches" data-testid="go-to-matches">
                  {approveText.goToMatches}
                </Button>
              ) : null}
              <PoolConsent
                approved={poolOpen}
                inPool={poolOpen ? card.inPool : null}
                busy={busy}
                onChange={(v) => void setPool(v)}
                text={{
                  title: p.title,
                  body: p.body,
                  yes: p.yes,
                  yesHelp: m.poolYesHelp,
                  no: p.no,
                  noHelp: p.noHelp,
                  locked: m.poolLocked,
                  statusIn: p.statusIn,
                  statusOut: p.statusOut,
                  leave: p.leave,
                  leaveTitle: m.poolLeaveTitle,
                  leaveBody: m.poolLeaveBody,
                  leaveConfirm: p.leave,
                  cancel: core.cancel,
                }}
              />
              <DataControls
                exportHref="/api/me/export"
                onDelete={() => void deleteMyData()}
                busy={busy}
                purgeNotice={card.synthetic ? undefined : p.liveDemo}
                text={{
                  title: m.myDataTitle,
                  body: m.myDataHelp,
                  export: m.exportData,
                  delete: m.deleteData,
                  confirmTitle: m.deleteTitle,
                  confirmBody: m.deleteWarning,
                  confirmYes: m.deleteConfirm,
                  cancel: m.deleteCancel,
                  deleted: m.deletedDone,
                }}
              />
            </>
          )}
        </aside>
      </div>
      {company ? null : <ApproveBar state={approveState} tally={tally} text={approveText} onApprove={() => void approve()} />}
    </>
  );
}

const splitList = (text: string) => text.split(",").map((x) => x.trim()).filter(Boolean);

function LookingForRead({ value }: { value: LookingFor }) {
  const c = useMessages(cardCopy);
  const modes = { onsite: c.workModeOnsite, hybrid: c.workModeHybrid, remote: c.workModeRemote, any: c.workModeAny };
  const starts = { now: c.startNow, within_1_month: c.startWithin1Month, within_3_months: c.startWithin3Months, later: c.startLater };
  const rows: Array<[string, string[]]> = [
    [c.lookingForRoles, value.roles],
    [c.lookingForWorkMode, value.workMode ? [modes[value.workMode]] : []],
    [c.lookingForStart, value.startFrom ? [starts[value.startFrom]] : []],
    [c.lookingForLanguages, value.workLanguages],
  ];
  const shown = rows.filter(([, items]) => items.length > 0);
  if (shown.length === 0) return null;
  return (
    <>
      <h3 className="we-looking-title">{c.lookingForTitle}</h3>
      <dl>
        {shown.map(([label, items]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {items.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

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
      className="we-lf-form"
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
      <h3 className="we-looking-title">{c.lookingForTitle}</h3>
      <p className="we-hint-line">{c.lookingForHelp}</p>
      <div className="we-lf-grid">
        <Field label={c.lookingForRoles} hint={m.rolesHelp}>
          {(f) => <Input id={f.id} aria-describedby={f.describedBy} data-testid="looking-for-roles" value={roles} onChange={(e) => setRoles(e.target.value)} />}
        </Field>
        <Field label={c.lookingForLanguages} hint={m.languagesHelp}>
          {(f) => <Input id={f.id} aria-describedby={f.describedBy} data-testid="looking-for-languages" value={languages} onChange={(e) => setLanguages(e.target.value)} />}
        </Field>
        <Field label={c.lookingForWorkMode}>
          {(f) => (
            <Select id={f.id} data-testid="looking-for-work-mode" value={workMode ?? ""} onChange={(e) => setWorkMode((e.target.value || null) as LookingFor["workMode"])}>
              <option value="">{m.notSet}</option>
              {workModes.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={c.lookingForStart}>
          {(f) => (
            <Select id={f.id} data-testid="looking-for-start" value={startFrom ?? ""} onChange={(e) => setStartFrom((e.target.value || null) as LookingFor["startFrom"])}>
              <option value="">{m.notSet}</option>
              {starts.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="we-lf-actions">
        <Button type="submit" variant="ghost" data-testid="looking-for-save" disabled={props.busy}>
          {core.save}
        </Button>
        {saved ? <span role="status">{m.saved}</span> : null}
      </div>
    </form>
  );
}
