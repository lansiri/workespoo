/**
 * Runs once when the web server starts, before it answers anyone (Next.js `register`).
 * Lead-owned.
 */
export async function register(): Promise<void> {
  // The patterns of the CV anonymiser take a couple of seconds to compile on their first run.
  // Pay that here, while the server is starting, not during somebody's interview.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { warmCvAnonymiser } = await import("@/features/interview/cv-anonymise");
    warmCvAnonymiser();
  } catch {
    // A warm-up that fails must never keep the server from starting.
  }
}
