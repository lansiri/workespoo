import { cx } from "./cx";
import { Icon } from "./icons";

/**
 * The only identity a person has before both sides agree: a sun sticker with a neutral diamond.
 * The same diamond for everyone. No initials, avatars, colours per person or flags.
 */
export function PersonHandle({
  handle,
  size = "md",
  ariaLabel,
  className,
}: {
  handle: string;
  size?: "md" | "sm";
  /** Full accessible name, for example "Nickname Birch-27". */
  ariaLabel: string;
  className?: string;
}) {
  return (
    <span className={cx("we-handle", size === "sm" && "we-sm", className)} aria-label={ariaLabel} role="img" data-testid="person-handle">
      <Icon name="diamond" />
      <span aria-hidden="true">{handle}</span>
    </span>
  );
}

/** Always shown beside a synthetic handle or name. */
export function SyntheticTag({ children, className }: { children: string; className?: string }) {
  return <span className={cx("we-syn", className)}>{children}</span>;
}
