import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Sun marker behind one whole cited sentence of the person's own words. Marks whole sentences only,
 * because evidence references are sentence-level. Never wrap anything that is not the person's own words.
 */
export function OwnWordsMark({
  turn,
  sentence,
  sweep,
  highlighted,
  children,
  className,
}: {
  turn: number;
  sentence: number;
  sweep?: boolean;
  highlighted?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("we-mk", sweep && "we-sweep", highlighted && "we-hl", className)} data-turn={turn} data-sentence={sentence} data-testid="own-words-mark">
      {children}
    </span>
  );
}
