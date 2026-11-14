"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  DecisionControls,
  EmptyState,
  ErrorState,
  KeysBar,
  KeysOverlay,
  LoadingState,
  NotMentionedList,
  OrganiserPickCard,
  PublishBox,
  ReasonLine,
  ReasonList,
  RemoveReasonDialog,
  Select,
  Field,
} from "@/components/we";
import { fmt, UI_LANG_LOCALES } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { REMOVE_NOTE_MAX, REMOVE_REASON_CODES, type RemoveReasonCode } from "./constants";
import { organiserMessages } from "./messages";
import type { QueueDigest, QueueNeed, QueuePick } from "./queue-view";
import { pickHandle, useReviewQueue } from "./useReviewQueue";

type M = (typeof organiserMessages)["en"];
type Q = ReturnType<typeof useReviewQueue>;

const REASON_LABEL_KEY = {
  evidence_thin: "reasonEvidenceThin",
  already_in_contact: "reasonAlreadyInContact",
  duplicate: "reasonDuplicate",
  person_asked: "reasonPersonAsked",
  other: "reasonOther",
} as const satisfies Record<RemoveReasonCode, keyof M>;

const REQ_LIMIT = 6;
const NOT_MENTIONED_LIMIT = 4;

const allPicks = (d: QueueDigest): QueuePick[] => d.needs.flatMap((n) => n.picks);

export function ReviewQueue() {
  const m = useMessages(organiserMessages);
  const lang = useUiLang();
  const locale = UI_LANG_LOCALES[lang];
  const q = useReviewQueue(m);
  const [viewId, setViewId] = useState<string | null>(null);

  const digests = q.queue?.digests ?? [];
  const selectedDigestId =
    digests.find((d) => allPicks(d).some((p) => p.id === q.selectedId))?.id ?? null;
  // Moving to a pick in another company (keys, or after a decision) shows that company.
  const [seenDigestId, setSeenDigestId] = useState<string | null>(null);
  if (selectedDigestId && selectedDigestId !== seenDigestId) {
    setSeenDigestId(selectedDigestId);
    setViewId(selectedDigestId);
  }

  const shownId = viewId ?? selectedDigestId ?? digests[0]?.id ?? null;
  const { setShownDigestId } = q;
  useEffect(() => setShownDigestId(shownId), [shownId, setShownDigestId]);

  const reasonLabel = (code: string | null) =>
    code && code in REASON_LABEL_KEY ? m[REASON_LABEL_KEY[code as RemoveReasonCode]] : "";

  if (q.loadError && !q.queue) {
    return (
      <div className="we-con">
        <ErrorState
          message={m.loadFailed}
          action={{ label: m.tryAgain, onClick: () => void q.reload() }}
        />
      </div>
    );
  }
  if (!q.queue) {
    return (
      <div className="we-con">
        <LoadingState message={m.loading} />
      </div>
    );
  }

  const current =
    digests.find((d) => d.id === viewId) ??
    digests.find((d) => d.id === selectedDigestId) ??
    digests[0] ??
    null;
  const dateText = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${q.queue.date}T12:00:00Z`));
  const time = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(locale, {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Helsinki",
        }).format(new Date(iso))
      : "";
  const showDigest = (d: QueueDigest) => {
    setViewId(d.id);
    const list = allPicks(d);
    const first = list.find((p) => p.status === "suggested") ?? list[0];
    if (first) q.setSelectedId(first.id);
  };
  const railStatus = (d: QueueDigest) => {
    const total = allPicks(d).length;
    if (d.status === "published")
      return { cls: "we-pub", text: `${m.publishedLabel} ${time(d.publishedAt)}`.trim() };
    if (total === 0) return { cls: "we-none", text: m.railNobody };
    return { cls: "", text: fmt(m.railDecided, { decided: d.approved + d.removed, total }) };
  };

  const removingPick = q.removing
    ? digests.flatMap(allPicks).find((p) => p.id === q.removing?.pickId)
    : null;

  return (
    <div className="we-rv-main">
      <aside className="we-rv-rail">
        <h2>{m.reviewTitle}</h2>
        <p className="we-date">{fmt(m.today, { date: dateText })}</p>
        <Button
          variant="ghost"
          className="we-run"
          onClick={() => void q.runDaily()}
          disabled={q.busy}
          data-testid="run-daily"
        >
          {q.busy ? m.running : m.runDaily}
        </Button>
        <Button
          variant="quiet"
          kbd="?"
          className="we-keys-open"
          onClick={() => q.setHelpOpen(true)}
        >
          {m.keysOpen}
        </Button>
        {digests.length > 0 && current ? (
          <div className="we-rail-select">
            <Field label={m.companySelectLabel}>
              {({ id }) => (
                <Select
                  id={id}
                  value={current.id}
                  onChange={(e) => {
                    const d = digests.find((x) => x.id === e.target.value);
                    if (d) showDigest(d);
                  }}
                >
                  {digests.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.company.displayName} · {railStatus(d).text}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : null}
        <div className="we-co-list">
          {digests.map((d) => {
            const st = railStatus(d);
            return (
              <button
                key={d.id}
                type="button"
                className="we-co"
                aria-current={d.id === current?.id ? "true" : undefined}
                onClick={() => showDigest(d)}
              >
                <b>{d.company.displayName}</b>
                <span>{d.needs[0]?.title}</span>
                <span className={`we-st ${st.cls}`}>{st.text}</span>
              </button>
            );
          })}
        </div>
        <p className="we-rail-note">{m.railNote}</p>
      </aside>

      <div className="we-rv-work">
        {q.notice && !q.removing ? (
          <p className="we-rv-notice" role="status" data-testid="review-notice">
            {q.notice}
          </p>
        ) : null}
        {digests.length === 0 ? (
          <EmptyState testId="review-empty" ghostShape="rows" message={m.nothingYet} />
        ) : null}
        {digests.length > 0 && digests.every((d) => d.status === "published") ? (
          <p className="we-rv-line">{m.allPublished}</p>
        ) : null}
        {current ? (
          <DigestView digest={current} q={q} m={m} locale={locale} reasonLabel={reasonLabel} />
        ) : null}
      </div>

      <KeysBar
        hints={[
          { key: "J K", label: m.kMove },
          { key: "A", label: m.kApprove },
          { key: "R", label: m.kRemove },
          { key: "U", label: m.kUndo },
          { key: "P", label: m.kPublish },
          { key: "?", label: m.kAll },
        ]}
        rule={m.oneAtATime}
      />

      {q.helpOpen ? (
        <KeysOverlay
          title={m.keysOverlayTitle}
          closeLabel={m.keysClose}
          onClose={() => q.setHelpOpen(false)}
          keys={[
            { key: "J / ↓", label: m.kNext },
            { key: "K / ↑", label: m.kPrev },
            { key: "A", label: m.kApproveLong },
            { key: "R", label: m.kRemoveLong },
            { key: "1–5", label: m.kPickReason },
            { key: "Enter", label: m.kConfirmKey },
            { key: "Esc", label: m.kEsc },
            { key: "U", label: m.kUndoLong },
            { key: "P", label: m.kPublishLong },
            { key: "?", label: m.kHelp },
          ]}
        />
      ) : null}

      {q.removing && removingPick ? (
        <RemoveReasonDialog
          key={q.removing.pickId}
          title={fmt(m.removeDialogTitle, { handle: pickHandle(removingPick) })}
          help={m.removeHelp}
          reasons={REMOVE_REASON_CODES.map((code) => ({ code, label: reasonLabel(code) }))}
          otherCode="other"
          noteLabel={m.noteLabel}
          noteMaxLength={REMOVE_NOTE_MAX}
          confirmLabel={fmt(m.removeConfirm, { handle: pickHandle(removingPick) })}
          cancelLabel={m.cancel}
          notice={q.notice ?? undefined}
          onCancel={q.cancelRemove}
          onConfirm={(v) =>
            q.confirmRemove({ reasonCode: v.reasonCode as RemoveReasonCode, note: v.note })
          }
        />
      ) : null}
    </div>
  );
}

function DigestView(props: {
  digest: QueueDigest;
  q: Q;
  m: M;
  locale: string;
  reasonLabel: (code: string | null) => string;
}) {
  const dayText = (date: string) =>
    new Intl.DateTimeFormat(props.locale, {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  const { digest, q, m, locale } = props;
  const picks = allPicks(digest);
  const undecided = picks.filter((p) => p.status === "suggested").map(pickHandle);
  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
    undecided,
  );
  // Where the language puts the full stop right after the names, the tail message is empty.
  const names = m.publishHelpTail === "" ? `${list}.` : list;
  const publishBox = (
    <PublishBox
      total={picks.length}
      undecided={undecided}
      published={digest.status === "published"}
      link={digest.companyPath ?? undefined}
      onPublish={() => void q.publish(digest.id)}
      text={{
        status: fmt(m.publishStatus, { n: undecided.length, total: picks.length }),
        ready: m.publishReady,
        published: m.publishedLabel,
        publish: fmt(m.publishTo, { company: digest.company.displayName }),
        helpLead: m.publishHelpLead,
        names,
        helpTail: m.publishHelpTail,
        sent: m.publishSent,
      }}
    />
  );
  return (
    <section data-testid="review-digest" data-digest-id={digest.id}>
      {digest.needs.length === 0 ? (
        <div className="we-need">
          <div className="we-need-main">
            <p className="we-co-name">{digest.company.displayName}</p>
          </div>
          {publishBox}
        </div>
      ) : null}
      {digest.needs.map((need, i) => (
        <NeedBlock
          key={need.needCardId}
          need={need}
          first={i === 0}
          digest={digest}
          q={q}
          m={m}
          publishBox={i === 0 ? publishBox : null}
          reasonLabel={props.reasonLabel}
          dayText={dayText}
        />
      ))}
    </section>
  );
}

function NeedBlock(props: {
  need: QueueNeed;
  first: boolean;
  digest: QueueDigest;
  q: Q;
  m: M;
  publishBox: React.ReactNode;
  reasonLabel: (code: string | null) => string;
  dayText: (date: string) => string;
}) {
  const { need, digest, q, m } = props;
  const Title = props.first ? "h1" : "h2";
  const [reqsOpen, setReqsOpen] = useState(false);
  return (
    <div className="we-need">
      <div className="we-need-main">
        <p className="we-co-name">{fmt(m.needKicker, { company: digest.company.displayName })}</p>
        <Title>{need.title}</Title>
        {need.summary ? <p className="we-one">{need.summary}</p> : null}
        {need.requirements.length > 0 ? (
          <>
            <ul className="we-reqs" style={{ listStyle: "none", padding: 0 }}>
              {(reqsOpen ? need.requirements : need.requirements.slice(0, REQ_LIMIT)).map((r) => (
                <li key={r.id} className="we-req">
                  <small>{r.kind === "must" ? m.reqMust : m.reqNice}</small>
                  {r.text}
                </li>
              ))}
              {need.requirements.length > REQ_LIMIT ? (
                <li>
                  <button
                    type="button"
                    className="we-more"
                    aria-expanded={reqsOpen}
                    onClick={() => setReqsOpen(!reqsOpen)}
                  >
                    {reqsOpen ? m.showFewer : m.moreN.replace("{n}", String(need.requirements.length - REQ_LIMIT))}
                  </button>
                </li>
              ) : null}
            </ul>
            <p className="we-req-note">{m.mustHaveNote}</p>
          </>
        ) : null}
      </div>
      {props.publishBox ?? <div />}
      <div style={{ gridColumn: "1 / -1" }}>
        {need.nobodyRelates ? (
          <p className="we-rv-line">{fmt(m.nobodyRelates, { need: need.title })}</p>
        ) : null}
        {!need.nobodyRelates && need.picks.length === 0 ? (
          <p className="we-rv-line">{fmt(m.noPicksForNeed, { need: need.title })}</p>
        ) : null}
        {need.picks.length > 0 ? (
          <>
            <div className="we-list-head">
              <h2 data-testid="order-note">
                {need.picks.length === 1
                  ? m.suggestionsOne
                  : fmt(m.suggestionsMany, { n: need.picks.length })}{" "}
                · {m.orderNote} · {m.sortNote}
              </h2>
            </div>
            <ul className="we-pick-self">
              {need.picks.map((p) => (
                <PickItem
                  key={p.id}
                  pick={p}
                  digest={digest}
                  q={q}
                  m={m}
                  reasonLabel={props.reasonLabel}
                  dayText={props.dayText}
                />
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PickItem(props: {
  pick: QueuePick;
  digest: QueueDigest;
  q: Q;
  m: M;
  reasonLabel: (code: string | null) => string;
  dayText: (date: string) => string;
}) {
  const { pick, digest, q, m, dayText } = props;
  const ref = useRef<HTMLLIElement>(null);
  const selected = q.selectedId === pick.id;
  const handle = pickHandle(pick);

  // Keep the selected pick in view only when the person moved the selection (keys, or after a decision).
  const scrollHere = q.scrollToId === pick.id;
  useEffect(() => {
    if (scrollHere) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [scrollHere]);

  const status = pick.status === "suggested" ? "undecided" : pick.status;
  const origin =
    pick.origin === "talent_request"
      ? m.originTalent
      : pick.origin === "organiser"
        ? m.originOrganiser
        : undefined;
  const reasonText =
    pick.status === "removed"
      ? // Only the reason label: a free-text note can name personal characteristics and stays out of the console.
        props.reasonLabel(pick.decision?.reasonCode ?? null)
      : undefined;
  const why = pick.basis.seedPrefix
    ? pick.basis.lastDrafted
      ? fmt(m.whyTodayLast, { date: dayText(pick.basis.lastDrafted) })
      : m.whyTodayNever
    : undefined;

  return (
    <li
      ref={ref}
      className="we-pick-wrap"
      onClick={() => q.setSelectedId(pick.id)}
      onFocusCapture={() => q.setSelectedId(pick.id)}
    >
      <OrganiserPickCard
        pickId={pick.id}
        handle={handle}
        handleAria={fmt(m.handleAria, { handle })}
        summary={pick.card ? pick.card.headline : m.cardMissing}
        whyToday={why}
        origin={origin}
        syntheticLabel={pick.card?.synthetic ? m.synthetic : undefined}
        status={status}
        selected={selected}
        outOfDate={pick.outOfDate ? m.outOfDate : undefined}
        reasons={
          pick.outOfDate ? null : (
            <ReasonList variant="organiser">
              {pick.reasons.map((r) => (
                <ReasonLine
                  key={`${r.requirementId}-${r.signalId}`}
                  variant="organiser"
                  cardKind="rendering"
                  cardText={r.rendering ?? r.signalPhrase ?? r.text}
                  postingSentence={r.postingSentence}
                  escoLabel={r.requirementText}
                  text={{
                    cardLabel: m.reasonFromCard,
                    postingLabel: m.reasonFromPosting,
                    mentions: m.reasonMentions,
                  }}
                />
              ))}
            </ReasonList>
          )
        }
        notMentioned={
          pick.outOfDate ? null : (
            <NotMentionedList
              audience="organiser"
              limit={NOT_MENTIONED_LIMIT}
              items={pick.notMentioned}
              text={{
                label: m.notMentionedLabel,
                statutory: m.statutory,
                fine: m.notMentionedNote,
                notRead: m.notRead,
                more: m.moreN,
                less: m.showFewer,
              }}
            />
          )
        }
        controls={
          <DecisionControls
            status={status}
            reason={reasonText}
            approveDisabled={q.busy || Boolean(pick.outOfDate)}
            readOnly={digest.status !== "draft"}
            onApprove={() => void q.approve(pick.id)}
            onRemove={() => q.startRemove(pick.id)}
            onUndo={() => void q.undo(pick.id)}
            text={{
              approve: m.approve,
              remove: m.remove,
              undo: m.undo,
              hint: m.decideAlone,
              approved: m.approved,
              approvedNote: m.approvedNote,
              removed: m.removedShort,
            }}
          />
        }
      />
    </li>
  );
}
