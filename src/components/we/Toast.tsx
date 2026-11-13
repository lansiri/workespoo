import { cx } from "./cx";

/** Ink toast, bottom centre. The page decides when to show it (2.4 s) and when to remove it. */
export function Toast({ message, show = true, className }: { message: string; show?: boolean; className?: string }) {
  return (
    <div role="status" className={cx("we-toast", show && "we-show", className)}>
      {message}
    </div>
  );
}
