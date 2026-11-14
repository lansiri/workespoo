"use client";

import { useCallback, useEffect, useState } from "react";
import type { LocalText, UiLang } from "@/contracts";
import { AiTag, Button, ErrorState, Field, Input, LoadingState, PersonHandle, SyntheticTag, Textarea } from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { LEVEL_ANCHORS, LEVEL_NAMES } from "../levels";
import { formatWhen, moveProblem, rankedMessages } from "../messages-organiser";
import type { ApplicationEvidence, RankedApplicant, RankedList } from "../rank";
import { rankedListSignature } from "../signature";
import "./ranked.css";

type M = (typeof rankedMessages)["en"];

const levelName = (lang: UiLang, level: number) => LEVEL_NAMES[lang][Math.min(Math.max(level, 0), 3)];

/** Ratings of one applicant: per requirement the level's name and the reason, marked as written by AI. Shared with the company's page. */
export function RatingsList(props: {
  ratings: ReadonlyArray<{ requirementId: string; level: number; reason: LocalText }>;
  requirements: ReadonlyArray<{ requirementId: string; text: string; kind: "must" | "nice" }>;
  m: M;
  lang: UiLang;
  testId: string;
  aiNote: string;
}) {
  const { ratings, requirements, m, lang, testId, aiNote } = props;
  return (
    <ul className="we-rk-ratings">
      {ratings.map((r) => {
        const req = requirements.find((q) => q.requirementId === r.requirementId);
        return (
          <li key={r.requirementId} className="we-rk-rating" data-testid={testId} data-requirement-id={r.requirementId} data-level={r.level}>
            <b>{req?.text ?? ""}</b>
            <span className="we-rk-level">{levelName(lang, r.level)}</span>
            <p className="we-rk-reason">
              <AiTag mini>{m.aiTag}</AiTag> {r.reason[lang]} <span className="we-rk-sub">({aiNote})</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One applicant's levels at a glance: a mark per requirement, in the list's order, filled by
 * level. It shows the same levels as the text under it and nothing more; the names are in its
 * label and on each mark, so it is not colour alone.
 */
export function LevelStrip(props: {
  ratings: ReadonlyArray<{ requirementId: string; level: number }>;
  requirements: ReadonlyArray<{ requirementId: string; text: string }>;
  lang: UiLang;
  label: string;
}) {
  const marks = props.requirements.flatMap((req) => {
    const rating = props.ratings.find((r) => r.requirementId === req.requirementId);
    return rating ? [{ id: req.requirementId, level: Math.min(Math.max(rating.level, 0), 3), text: `${req.text}: ${levelName(props.lang, rating.level)}` }] : [];
  });
  if (marks.length === 0) return null;
  return (
    <span className="we-rk-strip" role="img" aria-label={`${props.label}: ${marks.map((m) => m.text).join("; ")}`} data-testid="ranked-strip">
      {marks.map((m) => (
        <span key={m.id} data-level={m.level} title={m.text} />
      ))}
    </span>
  );
}

/** What the levels mean, from the anchors, and that nobody is left off by a rating. */
export function LevelsBox({ m, lang }: { m: M; lang: UiLang }) {
  return (
    <section className="we-rk-levels" aria-labelledby="rk-levels-title">
      <h3 id="rk-levels-title">{m.levelsTitle}</h3>
      <dl>
        {LEVEL_NAMES[lang].map((name, i) => (
          <div key={name}>
            <dt>
              <span className="we-rk-strip" aria-hidden="true">
                <span data-level={i} />
              </span>{" "}
              {name}
            </dt>
            <dd>{LEVEL_ANCHORS[lang][i]}</dd>
          </div>
        ))}
      </dl>
      <p className="we-rk-note" style={{ marginTop: 10 }}>
        {m.levelsFine}
      </p>
    </section>
  );
}

/** The person's own sentences per requirement, the cited ones marked. Own words only, rendered from stored turns. */
export function EvidenceList({ evidence, m }: { evidence: ApplicationEvidence["requirements"]; m: M }) {
  return (
    <div className="we-rk-evidence" data-testid="ranked-evidence">
      {evidence.map((r) => (
        <section key={r.requirementId} className="we-rk-ev-req">
          <h3>{r.text}</h3>
          {r.questions.map((q) => (
            <p key={q} className="we-rk-q">
              {m.evidenceQuestion}: {q}
            </p>
          ))}
          {r.answers.length === 0 ? <p className="we-rk-note">{m.evidenceNoAnswer}</p> : null}
          {r.answers.map((a) => (
            <blockquote key={a.index} className="we-rk-own">
              {a.sentences.map((s, i) => {
                const cited = r.cited.some((c) => c.turnIndex === a.index && c.sentence === i + 1);
                return (
                  <span key={i} className={cited ? "we-rk-cited" : undefined} data-cited={cited ? "true" : undefined}>
                    {s}{" "}
                  </span>
                );
              })}
            </blockquote>
          ))}
          {r.cited.length > 0 ? <span className="we-rk-mark">{m.evidenceCited}</span> : null}
        </section>
      ))}
    </div>
  );
}

async function fetchList(jobId: string): Promise<{ state: "ok" | "failed" | "notfound"; list?: RankedList }> {
  try {
    const res = await fetch(`/api/organiser/applicants/${jobId}`);
    if (res.status === 404) return { state: "notfound" };
    if (!res.ok) return { state: "failed" };
    return { state: "ok", list: (await res.json()) as RankedList };
  } catch {
    return { state: "failed" };
  }
}

async function readCode(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  return body?.error?.code ?? null;
}

function ApplicantCard(props: {
  a: RankedApplicant;
  list: RankedList;
  m: M;
  lang: UiLang;
  busy: boolean;
  initialMoveOpen?: boolean;
  onMove: (a: RankedApplicant, position: number, reason: string) => Promise<string | null>;
  onUnpin: (a: RankedApplicant) => Promise<void>;
}) {
  const { a, list, m, lang, busy, onMove, onUnpin } = props;
  const [evidence, setEvidence] = useState<ApplicationEvidence | "loading" | "failed" | null>(null);
  const [moving, setMoving] = useState(props.initialMoveOpen ?? false);
  const [position, setPosition] = useState(String(a.position));
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const invalid = moveProblem(m, position, reason);

  async function toggleEvidence() {
    if (evidence && evidence !== "failed") {
      setEvidence(null);
      return;
    }
    setEvidence("loading");
    try {
      const res = await fetch(`/api/organiser/applicants/${list.jobId}/evidence?application=${encodeURIComponent(a.applicationId)}`);
      setEvidence(res.ok ? ((await res.json()) as ApplicationEvidence) : "failed");
    } catch {
      setEvidence("failed");
    }
  }

  async function confirmMove() {
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem(null);
    const err = await onMove(a, Number(position), reason.trim());
    if (err) setProblem(err);
    else {
      setMoving(false);
      setReason("");
    }
  }

  return (
    <li className="we-rk-card" data-testid="ranked-applicant" data-application-id={a.applicationId} data-position={a.position}>
      <div className="we-rk-head">
        <span className="we-rk-pos">{a.position}</span>
        <PersonHandle handle={a.handle} ariaLabel={fmt(m.handleAria, { handle: a.handle })} />
        <SyntheticTag>{a.synthetic ? m.synthetic : m.liveDemoPerson}</SyntheticTag>
        <span className="we-rk-score">
          <LevelStrip ratings={a.ratings} requirements={list.requirements} lang={lang} label={m.stripLabel} />
          <span className="we-rk-points" data-testid="ranked-points">
            {fmt(m.pointsOf, { n: a.points, m: a.maxPoints })}
          </span>
        </span>
      </div>
      <RatingsList ratings={a.ratings} requirements={list.requirements} m={m} lang={lang} testId="ranked-rating" aiNote={m.aiLabel} />
      <div className="we-rk-summary">
        <span className="we-rk-ai">
          <AiTag mini>{m.aiTag}</AiTag> {m.summaryLabel}
        </span>
        <p>{a.summary[lang]}</p>
      </div>
      {a.pin ? (
        <div className="we-rk-pin" data-testid="ranked-pinned">
          <b>{m.pinned}</b>
          {fmt(m.pinnedReason, { reason: a.pin.reason })}
          <br />
          {fmt(m.ratedPosition, { n: a.computedPosition })}
        </div>
      ) : null}

      <div className="we-rk-actions">
        <Button variant="ghost" data-testid="ranked-read-answers" onClick={() => void toggleEvidence()} aria-expanded={evidence !== null && evidence !== "failed"}>
          {evidence && evidence !== "failed" ? m.hideAnswers : m.readAnswers}
        </Button>
        <Button variant="ghost" data-testid="ranked-move" onClick={() => setMoving((v) => !v)} aria-expanded={moving}>
          {m.move}
        </Button>
        {a.pin ? (
          <Button variant="ghost" data-testid="ranked-unpin" disabled={busy} onClick={() => void onUnpin(a)}>
            {m.unpin}
          </Button>
        ) : null}
      </div>

      {moving ? (
        <form
          className="we-rk-form"
          aria-label={fmt(m.moveTitle, { handle: a.handle })}
          onSubmit={(e) => {
            e.preventDefault();
            void confirmMove();
          }}
        >
          <Field label={m.movePosition} required>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                inputMode="numeric"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                data-testid="ranked-move-position"
              />
            )}
          </Field>
          <Field label={m.moveReason} hint={m.moveReasonHint} required>
            {({ id }) => (
              <Textarea id={id} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="ranked-move-reason" />
            )}
          </Field>
          {problem ? (
            <p className="we-rk-problem" role="alert">
              {problem}
            </p>
          ) : null}
          <div className="we-rk-actions">
            <Button variant="primary" type="submit" data-testid="ranked-move-confirm" disabled={busy || invalid !== null}>
              {m.moveConfirm}
            </Button>
            <Button variant="ghost" onClick={() => setMoving(false)}>
              {m.moveCancel}
            </Button>
          </div>
        </form>
      ) : null}

      {evidence === "loading" ? <p className="we-rk-note">{m.evidenceLoading}</p> : null}
      {evidence === "failed" ? (
        <p className="we-rk-problem" role="alert">
          {m.evidenceFailed}
        </p>
      ) : null}
      {evidence && evidence !== "loading" && evidence !== "failed" ? (
        <>
          <p className="we-rk-note" style={{ marginTop: 14 }}>
            {m.evidenceNote}
          </p>
          <EvidenceList evidence={evidence.requirements} m={m} />
        </>
      ) : null}
    </li>
  );
}

/** True when two fetched lists show the same requirements, people, order, points and ratings. */
export function sameRankedList(a: RankedList, b: RankedList): boolean {
  const shown = (l: RankedList) => JSON.stringify({ r: l.requirements, a: l.applicants, p: l.pendingAssessment });
  return shown(a) === shown(b);
}

/** The organiser's ranked list of one job's applicants, with moves and one approval. */
export function RankedListView({ jobId, initial, initialMoveOpenFor }: { jobId: string; initial?: RankedList; initialMoveOpenFor?: string }) {
  const m = useMessages(rankedMessages);
  const lang = useUiLang();
  const [list, setList] = useState<RankedList | null>(initial ?? null);
  const [state, setState] = useState<"ok" | "failed" | "notfound">("ok");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((r: { state: "ok" | "failed" | "notfound"; list?: RankedList }) => {
    if (r.list) setList(r.list);
    setState(r.state);
  }, []);
  const load = useCallback(async () => apply(await fetchList(jobId)), [jobId, apply]);

  useEffect(() => {
    if (initial) return;
    let live = true;
    void fetchList(jobId).then((r) => {
      if (live) apply(r);
    });
    return () => {
      live = false;
    };
  }, [initial, jobId, apply]);

  const errorLine = (code: string | null) => (code === "nothing_to_approve" ? m.errNothing : code === "list_changed" ? m.errChanged : m.errGeneric);

  /**
   * Reloads just before approving and sends nothing when the list is not the one on screen.
   * What was on screen goes with the approval, so the server refuses (`list_changed`) if the
   * list moved on in the moment between the reload and the approval.
   */
  async function approve(): Promise<string | null> {
    if (!list) return m.errGeneric;
    setBusy(true);
    const fresh = await fetchList(jobId);
    setBusy(false);
    if (fresh.state !== "ok" || !fresh.list) return m.errGeneric;
    apply(fresh);
    if (!sameRankedList(list, fresh.list)) return m.errChanged;
    return post("approve", { seen: rankedListSignature(list) });
  }

  async function post(path: string, body?: unknown): Promise<string | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/organiser/applicants/${jobId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const code = await readCode(res);
        // The list on screen is no longer the list: show the new one next to the message.
        if (code === "list_changed") await load();
        return errorLine(code);
      }
      await load();
      return null;
    } catch {
      return m.errGeneric;
    } finally {
      setBusy(false);
    }
  }

  if (state === "notfound") return <div className="we-rk"><ErrorState message={m.listNotFound} /></div>;
  if (!list) {
    return (
      <div className="we-rk">
        {state === "failed" ? <ErrorState message={m.listLoadFailed} action={{ label: m.tryAgain, onClick: () => void load() }} /> : <LoadingState message={m.listLoading} />}
      </div>
    );
  }

  const status = list.published
    ? list.changedSincePublished
      ? { key: "changed", text: m.statusChanged }
      : { key: "approved", text: fmt(m.statusApproved, { time: formatWhen(list.published.publishedAt, lang) }) }
    : { key: "none", text: m.statusNone };

  return (
    <div className="we-rk">
      <Button variant="ghost" href="/organiser/applicants" className="we-rk-back">
        {m.listBack}
      </Button>
      <h1>{fmt(m.companyJob, { company: list.companyName, title: list.title })}</h1>
      <p className="we-rk-lead">{m.orderLine}</p>

      <section aria-labelledby="rk-reqs">
        <h2 id="rk-reqs" style={{ marginTop: 20 }}>
          {m.requirementsTitle}
        </h2>
        <ul className="we-rk-reqs">
          {list.requirements.map((r) => (
            <li key={r.requirementId}>
              <span className="we-rk-kind">{r.kind === "must" ? m.kindMust : m.kindNice}</span> {r.text}
            </li>
          ))}
        </ul>
      </section>

      <div className="we-rk-bar">
        <span className="we-rk-status" data-testid="ranked-status" data-state={status.key}>
          {status.text}
        </span>
        <Button variant="primary" data-testid="ranked-approve" disabled={busy || list.applicants.length === 0} onClick={async () => setError(await approve())}>
          {busy ? m.approving : m.approve}
        </Button>
      </div>
      {error ? (
        <p className="we-rk-problem" role="alert">
          {error}
        </p>
      ) : null}
      {list.companyPath ? (
        <p className="we-rk-note">
          <a href={list.companyPath} data-testid="ranked-company-link">
            {m.companyPageLink}
          </a>
          {list.changedSincePublished ? ` ${m.companyPageStale}` : null}
        </p>
      ) : null}

      {list.pendingAssessment > 0 ? <p className="we-rk-pending">{fmt(m.pendingLine, { n: list.pendingAssessment })}</p> : null}
      {list.applicants.length === 0 ? <p className="we-rk-note">{m.noApplicants}</p> : null}
      <ol className="we-rk-list">
        {list.applicants.map((a) => (
          <ApplicantCard
            key={a.applicationId}
            a={a}
            list={list}
            m={m}
            lang={lang}
            busy={busy}
            initialMoveOpen={initialMoveOpenFor === a.applicationId}
            onMove={(x, position, reason) => post("move", { applicationId: x.applicationId, position, reason })}
            onUnpin={async (x) => setError(await post("unpin", { applicationId: x.applicationId }))}
          />
        ))}
      </ol>
      <LevelsBox m={m} lang={lang} />
    </div>
  );
}
