"use client";

import type { ReactNode } from "react";
import { RequirementQuestion } from "@/components/we";
import type { NeedMessagesText } from "./messages";
import { useNeedActions } from "./useNeedActions";

/** A question back to the company about one requirement, with its four answers. The page reloads when one is saved. */
export function QuestionControls(props: {
  needCardId: string;
  requirementId: string;
  requirementText: string;
  question: { text: string; why: string };
  /** The pool evidence line, drawn by the page. */
  evidence?: ReactNode;
  /** The sentence that replaces the answers once the question is answered. */
  answered?: string;
  token: string;
  m: NeedMessagesText;
  readOnly: boolean;
}) {
  const { m } = props;
  const actions = useNeedActions(props.needCardId, props.token, m);
  return (
    <RequirementQuestion
      requirement={props.requirementText}
      question={props.question}
      evidence={props.evidence}
      answered={props.answered}
      error={actions.error ?? undefined}
      disabled={actions.busy || props.readOnly}
      rewordMaxLength={80}
      onAnswer={(choice, text) => void actions.answer(props.requirementId, choice, text)}
      text={{
        label: m.questionLabel,
        keep: m.keepMust,
        makeNice: m.makeNice,
        reword: m.changeWording,
        remove: m.removeIt,
        rewordLabel: m.newWording,
        save: m.saveWording,
        cancel: m.cancelLabel,
      }}
    />
  );
}
