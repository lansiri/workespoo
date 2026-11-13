import type { ReactNode } from "react";
import { cx } from "./cx";

/** Cream pill for plain values such as the "looking for" list. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("we-tag", className)}>{children}</span>;
}

/** The small sun "AI" tag that sits beside every piece of AI-written text. */
export function AiTag({ children, mini, className }: { children: ReactNode; mini?: boolean; className?: string }) {
  return <span className={cx(mini ? "we-ai-mini" : "we-ai-tag", className)}>{children}</span>;
}
