import type { ReactNode } from "react";
import { cx } from "./cx";

/** The one loud brand moment per region ("Real open jobs", "Yours to approve"). Never on a skill. */
export function Sticker({ children, flat, className }: { children: ReactNode; flat?: boolean; className?: string }) {
  return <span className={cx("we-sticker", flat && "we-flat", className)}>{children}</span>;
}
