"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./cx";
import { Button } from "./Button";
import { Input } from "./FormFields";

export type QuestionChoice = "keep" | "make_nice" | "reworded" | "remove";

export type RequirementQuestionProps = {
  requirement: string;
  question: { text: string; why: string };
  /** PoolEvidenceLine */
  evidence?: ReactNode;
  /** When set the question is answered: this text replaces the buttons. */
  answered?: string;
  /** Inline error, for example when the answer could not be saved. */
  error?: string;
  onAnswer?: (choice: QuestionChoice, text?: string) => void;
  text: {
    /** "A question about {requirement}" */
    label: string;
    keep: string;
    makeNice: string;
    reword: string;
    remove: string;
    rewordLabel: string;
    save: string;
  };
  /** One column (narrow rails). */
  narrow?: boolean;
  className?: string;
};

/** A question back to the company about a requirement, with pool evidence and four equal answers. */
export function RequirementQuestion(p: RequirementQuestionProps) {
  const [rewording, setRewording] = useState(false);
  const [value, setValue] = useState(p.requirement);
  const t = p.text;
  return (
    <section className={cx("we-question", p.narrow && "we-narrow", p.className)} data-testid="requirement-question" aria-label={t.label.replace("{requirement}", p.requirement)}>
      <span className="we-label">{t.label.replace("{requirement}", p.requirement)}</span>
      <p className="we-q" data-testid="question-text">
        {p.question.text}
      </p>
      <p className="we-why">{p.question.why}</p>
      {p.evidence}
      {p.answered ? (
        <p className="we-q-answered" data-testid="question-answered">
          {p.answered}
        </p>
      ) : rewording ? (
        <div className="we-q-reword">
          <label className="we-sr-only" htmlFor="we-q-reword">
            {t.rewordLabel}
          </label>
          <Input id="we-q-reword" value={value} onChange={(e) => setValue(e.target.value)} data-testid="question-reword-input" />
          <Button variant="primary" disabled={value.trim().length < 2} onClick={() => p.onAnswer?.("reworded", value.trim())} data-testid="question-reword-save">
            {t.save}
          </Button>
        </div>
      ) : (
        <div className="we-q-actions" data-testid="question-controls">
          <Button variant="ghost" onClick={() => p.onAnswer?.("keep")} data-testid="question-answer-keep">
            {t.keep}
          </Button>
          <Button variant="ghost" onClick={() => p.onAnswer?.("make_nice")} data-testid="question-answer-make_nice">
            {t.makeNice}
          </Button>
          <Button variant="ghost" onClick={() => setRewording(true)} data-testid="question-answer-reworded">
            {t.reword}
          </Button>
          <Button variant="ghost" onClick={() => p.onAnswer?.("remove")} data-testid="question-answer-remove">
            {t.remove}
          </Button>
        </div>
      )}
      {p.error ? (
        <p className="we-inline-error" role="alert" data-testid="question-error">
          {p.error}
        </p>
      ) : null}
    </section>
  );
}
