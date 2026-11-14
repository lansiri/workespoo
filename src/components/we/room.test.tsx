// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InterviewControls, InterviewerMascot, Transcript, WordsBox } from "./index";

const text = { title: "Conversation", onlyYou: "Only you see your own words.", empty: "Nothing yet.", remove: "Remove this answer", legendMarked: "Marked words", legendRest: "became notes." };

describe("kit additions for the interview room", () => {
  it("Transcript gives a turn's own index to the remove control and can leave it out", () => {
    const html = renderToStaticMarkup(
      <Transcript
        text={text}
        onRemoveTurn={() => {}}
        turns={[
          { speaker: "ai", sentences: ["Question?"], label: "Interviewer · AI" },
          { speaker: "person", sentences: ["One."], label: "You · answer 1", index: 7 },
          { speaker: "person", sentences: ["Two."], label: "You · answer 2", index: 9, removable: false },
        ]}
      />,
    );
    expect(html.match(/data-testid="turn-remove"/g)).toHaveLength(1);
    expect(html).toContain('data-turn-index="7"');
  });

  it("WordsBox highlights only the sentences it is told to", () => {
    const html = renderToStaticMarkup(
      <WordsBox mode="said" label="You said" hint="h" answerNumber={1} sentences={["A.", "B.", "C."]} cited={[0, 1]} highlight={[1]} />,
    );
    expect(html.match(/we-hl/g)).toHaveLength(1);
    expect(html).toMatch(/we-mk we-hl"[^>]*data-sentence="1"/);
  });

  it("InterviewControls without a talk control is text-only and shows no 'or'", () => {
    const html = renderToStaticMarkup(<InterviewControls orLabel="or" typeBox={<input />} />);
    expect(html).toContain("we-text-only");
    expect(html).not.toContain("we-or");
    const withTalk = renderToStaticMarkup(<InterviewControls orLabel="or" talk={<button>Talk</button>} typeBox={<input />} />);
    expect(withTalk).toContain("we-or");
    expect(withTalk).not.toContain("we-text-only");
  });

  it("the mascot can be drawn without its badge", () => {
    expect(renderToStaticMarkup(<InterviewerMascot state="idle" badgeLabel="" hideBadge />)).not.toContain("we-state-badge");
    expect(renderToStaticMarkup(<InterviewerMascot state="idle" badgeLabel="Your turn" />)).toContain("Your turn");
  });
});
