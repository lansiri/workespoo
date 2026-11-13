import { Fredoka } from "next/font/google";

/**
 * Wordmark and heading font. Apply `brandFont.variable` on <html> in the root
 * layout; components read it through `var(--font-brand)`.
 */
export const brandFont = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-brand",
  display: "swap",
});
