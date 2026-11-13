/**
 * WorkEspoo logo: the "Cheer W" mark (a rounded W that is also someone with
 * both arms up, sun-yellow head) next to the wordmark set as real text.
 *
 * The wordmark font comes from the CSS variable `--font-brand` (see
 * `./fonts.ts`); without it the system sans-serif is used.
 */

const PINE = "#0E5E55";
const MINT = "#5ED1B6"; // pine's stand-in on dark backgrounds
const SUN = "#FFB627";

type LogoProps = {
  /** Height of the mark in pixels. The wordmark scales with it. */
  size?: number;
  showWordmark?: boolean;
  className?: string;
};

export function Logo({ size = 32, showWordmark = true, className }: LogoProps) {
  return (
    <span
      data-testid="site-logo"
      role="img"
      aria-label="WorkEspoo"
      className={["inline-flex items-center select-none", className].filter(Boolean).join(" ")}
      style={{ gap: Math.round(size * 0.28) }}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
      >
        <path
          d="M9 23L20 52L32 33L44 52L55 23"
          fill="none"
          stroke={PINE}
          className="dark:stroke-[#5ED1B6]"
          strokeWidth={11}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="15" r="7.5" fill={SUN} />
      </svg>
      {showWordmark && (
        <span
          aria-hidden="true"
          className="leading-none font-semibold tracking-tight text-current"
          style={{
            fontFamily: "var(--font-brand), ui-sans-serif, system-ui, sans-serif",
            fontSize: Math.round(size * 0.75),
          }}
        >
          WorkEspoo
        </span>
      )}
    </span>
  );
}

export const LOGO_COLORS = { pine: PINE, mint: MINT, sun: SUN } as const;
