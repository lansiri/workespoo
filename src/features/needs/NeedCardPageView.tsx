import type { UiLang } from "@/contracts";
import { fmt } from "@/lib/i18n";
import { UI_LANG_LOCALES } from "@/lib/i18n/types";
import { ConfirmControl } from "./ConfirmControl";
import { QuestionControls } from "./QuestionControls";
import type { NeedMessagesText } from "./messages";
import { poolEvidenceParts, type CompanyNeedView, type CompanyRequirementView } from "./view";

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

function RequirementRow(props: {
  view: CompanyNeedView;
  r: CompanyRequirementView;
  m: NeedMessagesText;
  lang: UiLang;
  token: string;
}) {
  const { view, r, m, lang, token } = props;
  const evidence = poolEvidenceParts(m, r);
  const readOnly = view.status === "stale";
  return (
    <li data-testid="requirement" data-requirement-id={r.id}>
      <p>
        <strong data-testid="requirement-text">{r.text}</strong>{" "}
        <span data-testid="requirement-kind">{r.kind === "must" ? m.kindMust : m.kindNice}</span>
        {" · "}
        <span data-testid="requirement-category">{m[CATEGORY_KEY[r.category]]}</span>
      </p>
      {r.postingSentence !== null ? (
        <details>
          <summary>{m.sourcePosting}</summary>
          <blockquote data-testid="posting-sentence">{r.postingSentence}</blockquote>
        </details>
      ) : (
        <p>{m.sourceCompany}</p>
      )}
      {evidence.length > 0 && r.pool ? (
        <p data-testid="pool-evidence">
          {evidence.map((part, i) => (part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}{" "}
          <small>{fmt(m.poolAsOf, { time: formatTime(r.pool.computedAt, lang) })}</small>
        </p>
      ) : null}
      {r.statutory !== "none" ? (
        <p data-testid="statutory-note">{m.statutoryNote}</p>
      ) : r.question ? (
        <div data-testid="requirement-question">
          <p data-testid="question-text">{r.question.text}</p>
          <p>{fmt(m.questionWhy, { why: r.question.why })}</p>
          {r.question.answer ? (
            <p data-testid="question-answered">
              {r.question.answer.choice === "remove" ? "" : m[ANSWERED_KEY[r.question.answer.choice]]}
            </p>
          ) : (
            <QuestionControls
              needCardId={view.id}
              requirementId={r.id}
              token={token}
              m={m}
              readOnly={readOnly}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}

/** The company's Need Card page, without styling. Everything it shows comes from `view`. */
export function NeedCardPageView(props: { view: CompanyNeedView; m: NeedMessagesText; lang: UiLang; token: string }) {
  const { view, m, lang, token } = props;
  const status =
    view.status === "confirmed" && view.confirmedAt
      ? fmt(m.statusConfirmed, { date: formatDate(view.confirmedAt, lang) })
      : view.status === "stale"
        ? m.statusStale
        : m.statusDraft;
  return (
    <main>
      {view.company.masked ? (
        <aside data-testid="masked-banner">
          <p>
            <strong>{fmt(m.bannerLead, { name: view.company.displayName })}</strong> {m.bannerBody}
          </p>
          <p>{m.bannerPrototype}</p>
        </aside>
      ) : null}
      <h1>{m.yourNeed}</h1>
      <h2 data-testid="need-title">{view.title}</h2>
      <p data-testid="need-summary">{view.summary}</p>
      <p>
        {view.draftedAt ? <>{fmt(m.draftedFrom, { date: formatDate(view.draftedAt, lang) })} · </> : null}
        <span data-testid="need-status" data-status={view.status}>
          {status}
        </span>
      </p>
      <p>{m.intro}</p>
      {view.status === "stale" ? <p>{m.readOnlyStale}</p> : null}
      {view.requirements.length === 0 ? (
        <p>{m.noRequirements}</p>
      ) : (
        <ol>
          {view.requirements.map((r) => (
            <RequirementRow key={r.id} view={view} r={r} m={m} lang={lang} token={token} />
          ))}
        </ol>
      )}
      {view.status === "confirmed" ? (
        <p data-testid="need-confirmed">{m.confirmedNote}</p>
      ) : (
        <ConfirmControl needCardId={view.id} token={token} m={m} readOnly={view.status === "stale"} />
      )}
    </main>
  );
}
