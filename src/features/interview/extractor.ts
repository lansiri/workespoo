/**
 * The turn extractor (docs/specs/prompts/turn-extractor.md): lenient parsing, the merge rules,
 * and the runner that stores signals and publishes events. It runs in parallel with the live
 * reply and never fails the turn.
 */
import {
  CoverageArea,
  ExtractorOutput,
  InterviewFlag,
  SignalKind,
  labelsToEvidenceRefs,
  toSignalPublic,
  type CoverageStatus,
  type EscoRef,
  type EvidenceRef,
  type Signal,
} from "@/contracts";
import type { Db } from "@/db/client";
import { signal as signalTable } from "@/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { escoTopMatch } from "@/lib/esco";
import { pickEscoLabels } from "@/lib/esco-pick";
import { jobsLitForSignals } from "@/lib/jobs-lit";
import { chatJson } from "@/lib/llm";
import { findProtectedCard, stripQualityWords } from "@/lib/lexicon";
import { publishEvent } from "./events";
import { buildExtractorPrompt, safeNote } from "./prompts";
import { track, withLock } from "./runtime";
import {
  loadInterview,
  loadSignalRows,
  loadTurns,
  mutateState,
  readState,
  rowToSignal,
} from "./store";

export const EXTRACTOR_DEADLINE_MS = 20_000;
export const MAX_LIVE_SIGNALS = 20;
export const LIVE_ESCO_PICK_DEADLINE_MS = 10_000;
export const DEDUPE_TRIGRAM_THRESHOLD = 0.8;
const SIGNAL_ID_RE = /^s\d+$/;
const LABEL_RE = /^T\d+\.S\d+(-S?\d+)?$/;

/* Lenient coercion ------------------------------------------------------------------------- */

const AREAS = new Set<string>(CoverageArea.options);
const FLAGS = new Set<string>(InterviewFlag.options);
const KINDS = new Set<string>(SignalKind.options);

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

/**
 * Applied before the Zod parse: unknown flags and coverage keys are dropped instead of
 * failing, `"true"`/`"false"` strings become booleans, an invalid `kind` becomes `skill`,
 * and malformed signals are dropped one by one.
 */
export function coerce(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = raw as Record<string, unknown>;

  const lang =
    typeof r.lang === "string" && r.lang.trim().length >= 2
      ? r.lang.trim().toLowerCase().slice(0, 2)
      : "und";

  const signals = (Array.isArray(r.signals) ? r.signals : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => {
      const phrase = typeof s.phrase === "string" ? s.phrase.trim().slice(0, 60) : "";
      const evidenceRaw = Array.isArray(s.evidence)
        ? s.evidence
        : typeof s.evidence === "string"
          ? [s.evidence]
          : [];
      const evidence = evidenceRaw
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim())
        .filter((e) => LABEL_RE.test(e))
        .slice(0, 4);
      const ref =
        typeof s.ref === "string" && /^(new|s\d+)$/.test(s.ref.trim()) ? s.ref.trim() : "new";
      const kind =
        typeof s.kind === "string" && KINDS.has(s.kind.trim().toLowerCase())
          ? s.kind.trim().toLowerCase()
          : "skill";
      return { ref, phrase, kind, evidence, hasExample: asBool(s.hasExample) };
    })
    .filter((s) => s.phrase.length >= 2 && s.evidence.length >= 1)
    .slice(0, 5);

  const coverage: Record<string, string> = {};
  if (r.coverage && typeof r.coverage === "object" && !Array.isArray(r.coverage)) {
    for (const [area, status] of Object.entries(r.coverage)) {
      const s = typeof status === "string" ? status.trim().toLowerCase() : "";
      if (AREAS.has(area) && (s === "covered" || s === "thin")) coverage[area] = s;
    }
  }

  const flagsRaw = Array.isArray(r.flags) ? r.flags : typeof r.flags === "string" ? [r.flags] : [];
  const flags = [
    ...new Set(
      flagsRaw
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.trim().toLowerCase())
        .filter((f) => FLAGS.has(f)),
    ),
  ];

  const note = typeof r.note === "string" ? r.note.trim().slice(0, 200) : "";
  return { lang, signals, coverage, flags, note };
}

/* Similarity ------------------------------------------------------------------------------- */

function trigramsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Trigram similarity in the style of `pg_trgm`: shared trigrams over all trigrams. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigramsOf(a);
  const tb = trigramsOf(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/* Merge ------------------------------------------------------------------------------------ */

export type TurnView = {
  role: "interviewer" | "participant";
  sentences: readonly string[];
  redacted: boolean;
};

export type MergeInput = {
  output: ExtractorOutput;
  turns: ReadonlyMap<number, TurnView>;
  /** Every signal of the talent, with any status. New ids continue after the highest one. */
  known: readonly Signal[];
  /** Live signals this interview already has (the cap applies to these). */
  liveCount: number;
  /** Index of the participant turn being extracted. Only a signal citing it is new (patch TE-1). */
  currentTurn: number;
  resolveEsco: (phrase: string) => Promise<EscoRef | null>;
};

export type MergeResult = {
  created: Signal[];
  updated: Signal[];
  /** Signals the extraction created or changed, in order, without duplicates. */
  touched: string[];
  protectedDropped: number;
  unresolvedDropped: number;
};

const refKey = (r: EvidenceRef) => `${r.turnIndex}:${r.sentenceFrom}:${r.sentenceTo}`;

/** Resolve references against the stored sentences; whatever does not resolve is dropped. */
export function resolveRefs(
  labels: readonly string[],
  turns: ReadonlyMap<number, TurnView>,
): EvidenceRef[] {
  return labelsToEvidenceRefs(labels).filter((ref) => {
    const t = turns.get(ref.turnIndex);
    return !!t && t.role === "participant" && !t.redacted && ref.sentenceTo <= t.sentences.length;
  });
}

export async function mergeSignals(input: MergeInput): Promise<MergeResult> {
  const working = new Map<string, Signal>(input.known.map((s) => [s.id, structuredClone(s)]));
  const original = new Set(input.known.map((s) => s.id));
  const created: string[] = [];
  const changed = new Set<string>();
  const touched: string[] = [];
  let nextNumber = Math.max(0, ...input.known.map((s) => Number(s.id.slice(1)) || 0));
  let liveCount = input.liveCount;
  let protectedDropped = 0;
  let unresolvedDropped = 0;

  const active = () => [...working.values()].filter((s) => s.status !== "removed");

  for (const candidate of input.output.signals) {
    const refs = resolveRefs(candidate.evidence, input.turns);
    // Drop a signal with no resolved ref, or with none in the current turn: the earlier turn is context only.
    if (refs.length === 0 || !refs.some((r) => r.turnIndex === input.currentTurn)) {
      unresolvedDropped++;
      continue;
    }
    if (findProtectedCard(candidate.phrase).length > 0) {
      protectedDropped++;
      continue;
    }
    const phrase = stripQualityWords(candidate.phrase).slice(0, 60).trim();
    if (phrase.length < 2 || findProtectedCard(phrase).length > 0) continue;

    let target: Signal | undefined;
    if (candidate.ref !== "new" && SIGNAL_ID_RE.test(candidate.ref)) {
      const named = working.get(candidate.ref);
      if (named && named.status !== "removed") target = named;
    }
    if (!target) {
      const lower = phrase.toLowerCase();
      target = active().find(
        (s) =>
          s.phrase.toLowerCase() === lower ||
          trigramSimilarity(s.phrase, phrase) >= DEDUPE_TRIGRAM_THRESHOLD,
      );
    }

    if (target) {
      const have = new Set(target.evidence.map(refKey));
      let added = false;
      for (const ref of refs) {
        if (!have.has(refKey(ref))) {
          target.evidence.push(ref);
          have.add(refKey(ref));
          added = true;
        }
      }
      const example = target.hasExample || candidate.hasExample;
      if (example !== target.hasExample) {
        target.hasExample = example;
        added = true;
      }
      if (added) {
        if (!touched.includes(target.id)) touched.push(target.id);
        if (!created.includes(target.id)) changed.add(target.id);
      }
      continue;
    }

    if (liveCount >= MAX_LIVE_SIGNALS) continue;
    liveCount++;
    nextNumber++;
    const id = `s${nextNumber}`;
    working.set(id, {
      id,
      phrase,
      phraseOwn: null,
      kind: candidate.kind,
      esco: await input.resolveEsco(phrase).catch(() => null),
      evidence: refs,
      hasExample: candidate.hasExample,
      status: "proposed",
      addedBy: "agent",
    });
    created.push(id);
    touched.push(id);
  }

  return {
    created: created.map((id) => working.get(id)!).filter(Boolean),
    updated: [...changed].filter((id) => original.has(id)).map((id) => working.get(id)!),
    touched,
    protectedDropped,
    unresolvedDropped,
  };
}

/** Apply an extraction's coverage report. `covered` is never downgraded. */
export function applyCoverage(
  current: Record<CoverageArea, CoverageStatus>,
  report: Partial<Record<CoverageArea, "covered" | "thin">>,
): Record<CoverageArea, CoverageStatus> {
  const next = { ...current };
  for (const [area, status] of Object.entries(report) as [CoverageArea, "covered" | "thin"][]) {
    if (next[area] === "covered") continue;
    next[area] = status;
  }
  return next;
}

/* Runner ----------------------------------------------------------------------------------- */

/** Extract signals from participant turn `turnIndex`. Never throws. */
export async function runExtraction(db: Db, interviewId: string, turnIndex: number): Promise<void> {
  try {
    await extractTurn(db, interviewId, turnIndex);
  } catch (error) {
    console.error(
      "[interview] extraction failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function extractTurn(db: Db, interviewId: string, turnIndex: number): Promise<void> {
  const row = await loadInterview(db, interviewId);
  if (!row) return;
  const turns = await loadTurns(db, interviewId);
  const current = turns.find((t) => t.index === turnIndex);
  if (
    !current ||
    current.role !== "participant" ||
    current.redactedAt ||
    current.sentences.length === 0
  )
    return;
  const lastQuestion =
    [...turns].reverse().find((t) => t.role === "interviewer" && t.index < turnIndex)?.text ?? "";
  const previous = [...turns]
    .reverse()
    .find(
      (t) =>
        t.role === "participant" && t.index < turnIndex && !t.redactedAt && t.sentences.length > 0,
    );
  const signalRows = await loadSignalRows(db, row.talentId);
  const state = readState(row);

  const prompt = buildExtractorPrompt({
    lastQuestion,
    turns: [previous, current]
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ index: t.index, sentences: t.sentences, redacted: t.redactedAt !== null })),
    knownSignals: signalRows
      .filter((s) => s.status !== "removed")
      .slice(-20)
      .map((s) => ({ id: s.id, kind: s.kind, phrase: s.phrase, hasExample: s.hasExample })),
    coverage: state.coverage,
  });

  const result = await chatJson({
    role: "live",
    purpose: "interview.extract",
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.1,
    maxTokens: 500,
    deadlineMs: EXTRACTOR_DEADLINE_MS,
    schema: ExtractorOutput,
    coerce,
    db,
  });
  if (result.data === null) return;
  const output = result.data;

  let toLabel: LabelItem[] = [];
  await withLock(`${interviewId}#extract`, async () => {
    const freshRows = await loadSignalRows(db, row.talentId);
    const freshTurns = await loadTurns(db, interviewId);
    // The answer was removed while the model was working: nothing from it may land.
    if (freshTurns.find((t) => t.index === turnIndex)?.redactedAt) return;
    const known = freshRows.map(rowToSignal);
    const liveCount = freshRows.filter(
      (s) => s.interviewId === interviewId && s.status !== "removed",
    ).length;
    const turnViews = new Map<number, TurnView>(
      freshTurns.map((t) => [
        t.index,
        { role: t.role, sentences: t.sentences, redacted: t.redactedAt !== null },
      ]),
    );

    const merged = await mergeSignals({
      output,
      turns: turnViews,
      known,
      liveCount,
      currentTurn: turnIndex,
      resolveEsco: (phrase) => escoTopMatch(db, phrase),
    });

    for (const s of [...merged.created, ...merged.updated]) {
      await db
        .insert(signalTable)
        .values({
          talentId: row.talentId,
          id: s.id,
          interviewId,
          phrase: s.phrase,
          phraseOwn: s.phraseOwn,
          kind: s.kind,
          escoUri: s.esco?.uri ?? null,
          escoLabelEn: s.esco?.labelEn ?? null,
          escoLabelFi: s.esco?.labelFi ?? null,
          evidence: s.evidence,
          hasExample: s.hasExample,
          status: s.status,
          addedBy: s.addedBy,
        })
        .onConflictDoUpdate({
          target: [signalTable.talentId, signalTable.id],
          set: { evidence: s.evidence, hasExample: s.hasExample, updatedAt: new Date() },
        });
    }

    const note = safeNote(output.note);
    let coverageChanged = false;
    const next = await mutateState(
      db,
      interviewId,
      (st) => {
        const coverage = applyCoverage(st.coverage, output.coverage);
        coverageChanged = JSON.stringify(coverage) !== JSON.stringify(st.coverage);
        const flagCounts = { ...st.flagCounts };
        for (const flag of output.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
        return {
          ...st,
          coverage,
          flagCounts,
          lastNote: note,
          lastExtracted: merged.touched,
          // Only the flags the planner situations read are kept; distress and protected_info stay counts.
          // Once the interview is closing nobody reads them, so a late extraction leaves them cleared.
          recentFlags:
            st.stage === "closing" || st.stage === "synthesising"
              ? st.recentFlags
              : [
                  ...(st.recentFlags ?? []),
                  output.flags.filter(
                    (f): f is "off_topic" | "buzzwords" => f === "off_topic" || f === "buzzwords",
                  ),
                ].slice(-2),
        };
      },
      output.lang !== "und" ? { lang: output.lang } : undefined,
    );

    for (const s of merged.created)
      await publishEvent(db, interviewId, { type: "signal.proposed", signal: toSignalPublic(s) });
    for (const s of merged.updated)
      await publishEvent(db, interviewId, { type: "signal.updated", signal: toSignalPublic(s) });
    if (coverageChanged)
      await publishEvent(db, interviewId, { type: "coverage.updated", areas: next.coverage });

    if (merged.created.length > 0) {
      // The person's notes by phrase and ESCO uri: a posting that mentions a note in so many words
      // lights up too, and says which one (`mention` on each sample posting).
      const notes = [...known, ...merged.created]
        .filter((s) => s.status !== "removed")
        .map((s) => ({ phrase: s.phrase, escoUri: s.esco?.uri ?? null }));
      const lit = await jobsLitForSignals(db, notes, { sampleSize: 3 }).catch(() => null);
      if (lit)
        await publishEvent(db, interviewId, {
          type: "jobs.lit",
          count: lit.count,
          sample: lit.sample,
        });
    }

    if (merged.protectedDropped > 0) {
      await audit(db, {
        actor: "agent:extractor",
        action: "card.protected_dropped",
        subjectType: "interview",
        subjectId: interviewId,
        detail: { interviewId, count: merged.protectedDropped, source: "extractor" },
      });
    }

    toLabel = await claimNotesToLabel(db, interviewId);
  });

  // After everything above is stored and published. The label call is its own kind of work: the
  // end of the interview and the removal of an answer do not wait for it.
  if (toLabel.length > 0)
    track(interviewId, chooseLabels(db, row.talentId, interviewId, toLabel), "label");
}

/* Live skill labels ------------------------------------------------------------------------ */

type LabelItem = { key: string; phrase: string; kind: Signal["kind"] };

/**
 * This interview's notes that have no ESCO skill and were not offered before, recorded as
 * offered now so a failed call is not repeated for the same notes. Nothing while the interview
 * is closing or over: synthesis chooses the card's labels itself. Runs under the extraction lock.
 */
async function claimNotesToLabel(db: Db, interviewId: string): Promise<LabelItem[]> {
  const row = await loadInterview(db, interviewId);
  if (!row) return [];
  const state = readState(row);
  if (row.status !== "active" || state.stage === "closing" || state.stage === "synthesising")
    return [];
  const asked = new Set(state.escoAsked ?? []);
  const rows = await loadSignalRows(db, row.talentId);
  const items = rows
    .filter(
      (s) =>
        s.interviewId === interviewId && s.status !== "removed" && !s.escoUri && !asked.has(s.id),
    )
    .map((s) => ({ key: s.id, phrase: s.phrase, kind: s.kind }));
  if (items.length === 0) return [];
  await mutateState(db, interviewId, (st) => ({
    ...st,
    escoAsked: [...(st.escoAsked ?? []), ...items.map((i) => i.key)],
  }));
  return items;
}

/** One model call for the batch, then write what came back and light the board again. Never throws. */
async function chooseLabels(
  db: Db,
  talentId: string,
  interviewId: string,
  items: LabelItem[],
): Promise<void> {
  try {
    const picked = await pickEscoLabels(db, items, {
      purpose: "interview.esco_pick",
      deadlineMs: LIVE_ESCO_PICK_DEADLINE_MS,
    });
    if (![...picked.values()].some((v) => v)) return;
    // The engine lock first (as removeAnswer does), so the stage check and the writes cannot
    // interleave with the closing line; then the extraction lock. Nothing holding the engine lock
    // waits for "label" work, so this cannot deadlock.
    await withLock(interviewId, () =>
      withLock(`${interviewId}#extract`, async () => {
        const row = await loadInterview(db, interviewId);
        if (!row) return;
        const state = readState(row);
        // A label that arrives after the interview has closed is dropped.
        if (row.status !== "active" || state.stage === "closing" || state.stage === "synthesising")
          return;
        let written = 0;
        for (const item of items) {
          const esco = picked.get(item.key);
          if (!esco) continue;
          const [updated] = await db
            .update(signalTable)
            .set({
              escoUri: esco.uri,
              escoLabelEn: esco.labelEn,
              escoLabelFi: esco.labelFi,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(signalTable.talentId, talentId),
                eq(signalTable.id, item.key),
                eq(signalTable.interviewId, interviewId),
                ne(signalTable.status, "removed"),
                isNull(signalTable.escoUri),
              ),
            )
            .returning();
          if (!updated) continue;
          written++;
          await publishEvent(db, interviewId, {
            type: "signal.updated",
            signal: toSignalPublic(rowToSignal(updated)),
          });
        }
        if (written === 0) return;
        const notes = (await loadSignalRows(db, talentId))
          .filter((s) => s.status !== "removed")
          .map((s) => ({ phrase: s.phrase, escoUri: s.escoUri }));
        const lit = await jobsLitForSignals(db, notes, { sampleSize: 3 }).catch(() => null);
        if (lit)
          await publishEvent(db, interviewId, {
            type: "jobs.lit",
            count: lit.count,
            sample: lit.sample,
          });
      }),
    );
  } catch (error) {
    console.error(
      "[interview] live skill labels failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
