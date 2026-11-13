import Link from "next/link";
import { cx } from "./cx";

/** The Cheer W mark: one thick rounded W with a sun dot above the middle peak. */
export function CheerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <path d="M9 23L20 52L32 33L44 52L55 23" fill="none" stroke="#0E5E55" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="15" r="7.5" fill="#FFB627" />
    </svg>
  );
}

/** Logo link for the top bar. The wordmark hides on phones. `label` is the accessible name. */
export function KitLogo({ label, wordmark, href = "/", className }: { label: string; wordmark: string; href?: string; className?: string }) {
  return (
    <Link href={href} className={cx("we-logo", className)} aria-label={label} data-testid="site-logo">
      <CheerMark />
      <b>{wordmark}</b>
    </Link>
  );
}
