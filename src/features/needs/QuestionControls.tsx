"use client";

import { useState } from "react";
import type { NeedMessagesText } from "./messages";
import { useNeedActions } from "./useNeedActions";

/** The four answers to a requirement's question. */
export function QuestionControls(props: {
  needCardId: string;
  requirementId: string;
  token: string;
  m: NeedMessagesText;
  readOnly: boolean;
}) {
  const { m } = props;
  const actions = useNeedActions(props.needCardId, props.token, m);
  const [rewording, setRewording] = useState(false);
  const [text, setText] = useState("");
  const disabled = actions.busy || props.readOnly;

  return (
    <div data-testid="question-controls">
      <button
        type="button"
        data-testid="question-answer-keep"
        disabled={disabled}
        onClick={() => void actions.answer(props.requirementId, "keep")}
      >
        {m.keepMust}
      </button>{" "}
      <button
        type="button"
        data-testid="question-answer-make_nice"
        disabled={disabled}
        onClick={() => void actions.answer(props.requirementId, "make_nice")}
      >
        {m.makeNice}
      </button>{" "}
      <button
        type="button"
        data-testid="question-answer-reworded"
        disabled={disabled}
        onClick={() => setRewording((v) => !v)}
      >
        {m.changeWording}
      </button>{" "}
      <button
        type="button"
        data-testid="question-answer-remove"
        disabled={disabled}
        onClick={() => void actions.answer(props.requirementId, "remove")}
      >
        {m.removeIt}
      </button>
      {rewording ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void actions.answer(props.requirementId, "reworded", text);
          }}
        >
          <label>
            {m.newWording}{" "}
            <input
              data-testid="question-reword-input"
              value={text}
              maxLength={80}
              onChange={(e) => setText(e.target.value)}
            />
          </label>{" "}
          <button type="submit" data-testid="question-reword-save" disabled={disabled || text.trim() === ""}>
            {m.saveWording}
          </button>
        </form>
      ) : null}
      {actions.error ? (
        <p role="alert" data-testid="question-error">
          {actions.error}
        </p>
      ) : null}
    </div>
  );
}
