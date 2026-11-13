/**
 * Raw `db.execute(sql...)` returns an array of rows with postgres.js and `{ rows }` with
 * PGlite. This hides the difference.
 */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}
