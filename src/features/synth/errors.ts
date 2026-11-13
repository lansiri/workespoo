/**
 * The features the simulator and the seed call are built by other streams and are stubs until
 * those streams merge. A stub throws "... is not implemented yet"; here that becomes an error
 * that names the missing feature, so a script can print one clear line instead of a stack.
 */
export class FeatureNotReadyError extends Error {
  constructor(
    readonly feature: string,
    readonly fn: string,
    readonly neededFor: string,
  ) {
    super(
      `${feature}.${fn} is not implemented yet (needed to ${neededFor}). ` +
        `Merge the stream that owns "${feature}" first, or run with --fake to exercise the harness against a built-in stand-in.`,
    );
    this.name = "FeatureNotReadyError";
  }
}

const NOT_IMPLEMENTED = /is not implemented yet/;

export function isNotImplemented(error: unknown): boolean {
  return error instanceof Error && NOT_IMPLEMENTED.test(error.message);
}

/** Run a call into another feature; translate a stub's failure into `FeatureNotReadyError`. */
export async function callFeature<T>(feature: string, fn: string, neededFor: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isNotImplemented(error)) throw new FeatureNotReadyError(feature, fn, neededFor);
    throw error;
  }
}

/** One readable line for a script's last words. Never a stack. */
export function describeError(error: unknown): string {
  if (error instanceof FeatureNotReadyError) return error.message;
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
