import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

export type ButtonVariant = "primary" | "ghost" | "quiet" | "danger";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  block?: boolean;
  /** Keyboard hint shown inside the button, for example "A". */
  kbd?: string;
  icon?: IconName;
  /** Renders a link that looks like a button. */
  href?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/** All actions. One primary per region; paired decisions are both ghost. Labels wrap, never truncate. */
export function Button({ variant = "ghost", size = "md", block, kbd, icon, href, className, children, type, ...rest }: ButtonProps) {
  const cls = cx("we-btn", `we-btn-${variant}`, size === "lg" && "we-btn-lg", block && "we-btn-block", className);
  const inner = (
    <>
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
      {kbd ? <kbd className="we-kbd">{kbd}</kbd> : null}
    </>
  );
  if (href && !rest.disabled) {
    return (
      <Link href={href} className={cls} data-testid={(rest as { "data-testid"?: string })["data-testid"]}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} className={cls} aria-disabled={rest.disabled || undefined} {...rest}>
      {inner}
    </button>
  );
}
