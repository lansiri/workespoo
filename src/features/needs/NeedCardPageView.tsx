import type { UiLang } from "@/contracts";
import { EmptyState, Icon, MaskedDemoBanner, PoolEvidenceLine, RequirementList, type RequirementItem } from "@/components/we";
import { fmt } from "@/lib/i18n";
import { UI_LANG_LOCALES } from "@/lib/i18n/types";
import { ConfirmControl } from "./ConfirmControl";
import { QuestionControls } from "./QuestionControls";
import type { NeedMessagesText } from "./messages";
import type { CompanyNeedView, CompanyRequirementView } from "./view";

function formatDate(iso: string, lang: UiLang): string {
  return new Date(iso).toLocaleDateString(UI_LANG_LOCALES[lang], { dateStyle: "medium", timeZone: "Europe/Helsinki" });
}
function formatTime(iso: string, lang: UiLang): string {
  return new Date(iso).toLocaleString(UI_LANG_LOCALES[lang], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Helsinki",
  });
}

const CATEGORY_KEY = {
  skill: "categorySkill",
  language: "categoryLanguage",
  education: "categoryEducation",
  experience: "categoryExperience",
  authorisation: "categoryAuthorisation",
  other: "categoryOther",
} as const;

const ANSWERED_KEY = { keep: "answeredKeep", make_nice: "answeredMakeNice", reworded: "answeredReworded" } as const;

function evidenceFor(m: NeedMessagesText, r: CompanyRequirementView, lang: UiLang) {
  const p = r.pool;
  if (!p) return null;
  const wholePool = p.scope === "whole_pool";
  const kind = wholePool ? "wholePool" : r.statutory !== "none" ? "statutory" : r.category === "language" ? "language" : "normal";
  return (
    <PoolEvidenceLine
      kind={kind}
      speakTo={p.speakTo}
      relevant={p.relevant}
      exclude={p.hardFilterWouldExclude ?? 0}
      selfDeclaredOnly={p.selfDeclaredOnly}
      templates={{
        normal: m.poolNormal,
        languageExtra: m.poolSelfDeclared,
        statutory: m.poolStatutory,
        // Nobody in the pool at all: one plain sentence, nothing to count.
        wholePool: p.relevant === 0 ? m.poolEmpty : m.poolWholePool,
      }}
      asOf={fmt(m.poolAsOf, { time: formatTime(p.computedAt, lang) })}
    />
  );
}

/** What sits under a requirement: the pool evidence and then the question, or the note that the law sets it. */
function RowExtra(props: { view: CompanyNeedView; r: CompanyRequirementView; m: NeedMessagesText; lang: UiLang; token: string }) {
  const { view, r, m, lang, token } = props;
  const evidence = evidenceFor(m, r, lang);
  if (r.statutory === "none" && r.question) {
    const answer = r.question.answer;
    return (
      <QuestionControls
        needCardId={view.id}
        requirementId={r.id}
        requirementText={r.text}
        question={{ text: r.question.text, why: fmt(m.questionWhy, { why: r.question.why }) }}
        evidence={evidence}
        answered={answer ? (answer.choice === "remove" ? m.answeredRemove : m[ANSWERED_KEY[answer.choice]]) : undefined}
        token={token}
        m={m}
        readOnly={view.status === "stale"}
      />
    );
  }
  return evidence;
}

/** The company's Need Card page. Everything it shows comes from `view`; the answers go through `useNeedActions`. */
export function NeedCardPageView(props: { view: CompanyNeedView; m: NeedMessagesText; lang: UiLang; token: string }) {
  const { view, m, lang, token } = props;
  const status =
    view.status === "confirmed" && view.confirmedAt
      ? fmt(m.statusConfirmed, { date: formatDate(view.confirmedAt, lang) })
      : view.status === "stale"
        ? m.statusStale
        : m.statusDraft;
  const items: RequirementItem[] = view.requirements.map((r) => ({
    id: r.id,
    text: r.text,
    kind: r.kind,
    category: m[CATEGORY_KEY[r.category]],
    postingSentence: r.postingSentence,
    addedByYou: r.postingSentence === null,
    statutory: r.statutory !== "none",
    extra: <RowExtra view={view} r={r} m={m} lang={lang} token={token} />,
  }));
  return (
    <div className="we-page we-need-page">
      {view.company.masked ? (
        <MaskedDemoBanner lead={fmt(m.bannerLead, { name: view.company.displayName })} text={m.bannerBody} prototypeLine={m.bannerPrototype} />
      ) : null}
      <header className="we-page-head we-need-head" style={{ marginTop: 28 }}>
        <span className="we-label">{m.yourNeed}</span>
        <h1 data-testid="need-title" style={{ marginTop: 6 }}>
          {view.title}
        </h1>
        <p data-testid="need-summary">{view.summary}</p>
        <div className="we-need-meta">
          {view.draftedAt ? <span>{fmt(m.draftedFrom, { date: formatDate(view.draftedAt, lang) })}</span> : null}
          <span
            className={view.status === "confirmed" ? "we-status-chip we-ok" : "we-status-chip"}
            data-testid="need-status"
            data-status={view.status}
          >
            {view.status === "confirmed" ? <Icon name="check" /> : null}
            {status}
          </span>
        </div>
        <p className="we-need-explain">{m.intro}</p>
      </header>
      {view.status === "stale" ? <EmptyState message={m.readOnlyStale} className="we-stale-note" /> : null}
      {view.requirements.length === 0 ? (
        <EmptyState message={m.noRequirements} ghostShape="rows" />
      ) : (
        <RequirementList
          mode="full"
          requirements={items}
          text={{
            must: m.kindMust,
            nice: m.kindNice,
            fromPosting: m.sourcePosting,
            addedByYou: m.sourceCompany,
            showSentence: m.showSentence,
            hideSentence: m.hideSentence,
            edit: m.editLabel,
            save: m.saveWording,
            cancel: m.cancelLabel,
            statutory: m.statutoryNote,
            kindGroup: m.kindGroup,
          }}
        />
      )}
      {view.status === "confirmed" ? (
        <p className="we-confirmed-line" data-testid="need-confirmed">
          <Icon name="check" />
          <span>{m.confirmedNote}</span>
        </p>
      ) : (
        <ConfirmControl needCardId={view.id} token={token} m={m} readOnly={view.status === "stale"} />
      )}
    </div>
  );
}
