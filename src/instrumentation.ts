/**
 * Runs once when the web server starts (Next.js `register`). Lead-owned.
 *
 * The CV anonymiser is a hundred-odd patterns, and the first time they run in a process they
 * are compiled: about two seconds on the server's Node, during which that process answers
 * nobody. That wait should fall on the start of the server, not on the first person who brings
 * a CV or on whoever is in the middle of an interview at that moment.
 *
 * Calling the anonymiser from here does not do it: this file is built as its own bundle, with
 * its own copy of the patterns, and the request handlers have theirs (measured: a second copy
 * is made on the first request, cold). So the warm-up has to arrive as a request: shortly
 * after the start the server asks itself for `GET /api/interview/cv`, which runs the patterns
 * once in the handlers' copy.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const url = `http://127.0.0.1:${process.env.PORT ?? "3000"}/api/interview/cv`;
  const ask = (triesLeft: number): void => {
    const timer = setTimeout(() => {
      const started = Date.now();
      fetch(url, { signal: AbortSignal.timeout(20_000) })
        .then((res) => {
          // One line in the server's log per start, so it can be seen that the warm-up happened.
          if (res.ok) console.log(`[start] the CV anonymiser's patterns are compiled (${Date.now() - started} ms)`);
          else if (triesLeft > 0) ask(triesLeft - 1);
        })
        .catch(() => {
          // Not listening yet, or busy: try again a few times, then leave it to the first CV.
          if (triesLeft > 0) ask(triesLeft - 1);
        });
    }, 1500);
    timer.unref?.();
  };
  ask(5);
}
