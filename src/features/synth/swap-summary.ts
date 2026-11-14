/**
 * The arithmetic of the language swap check (evals/application-swap): for each requirement of
 * each assessed application, did the level change when the same answers were put into another
 * language? Pure, so it is tested; the eval script only gathers the numbers.
 */

export type SwapRow = {
  applicationId: string;
  requirementId: string;
  /** The language the answers were put into (or `baseline`: the same words rated again). */
  variant: string;
  /** The stored level of the application as it was interviewed. */
  before: number;
  after: number;
};

export type SwapCounts = { total: number; stayed: number; movedByOne: number; movedByMore: number; up: number; down: number };

export type SwapSummary = SwapCounts & {
  perVariant: Record<string, SwapCounts>;
  /** Applications in which at least one requirement moved by more than one level. */
  applicationsWithBigMove: string[];
  /** The share of ratings that stayed, as a number between 0 and 1 (1 when there are none). */
  stayedShare: number;
};

const empty = (): SwapCounts => ({ total: 0, stayed: 0, movedByOne: 0, movedByMore: 0, up: 0, down: 0 });

function add(c: SwapCounts, r: SwapRow): void {
  const d = r.after - r.before;
  c.total++;
  if (d === 0) c.stayed++;
  else if (Math.abs(d) === 1) c.movedByOne++;
  else c.movedByMore++;
  if (d > 0) c.up++;
  if (d < 0) c.down++;
}

export function summariseSwap(rows: SwapRow[]): SwapSummary {
  const all = empty();
  const perVariant: Record<string, SwapCounts> = {};
  const big = new Set<string>();
  for (const r of rows) {
    add(all, r);
    add((perVariant[r.variant] ??= empty()), r);
    if (Math.abs(r.after - r.before) > 1) big.add(r.applicationId);
  }
  return { ...all, perVariant, applicationsWithBigMove: [...big].sort(), stayedShare: all.total === 0 ? 1 : all.stayed / all.total };
}

export function renderSwapSummary(s: SwapSummary): string {
  const line = (label: string, c: SwapCounts) =>
    `${label}: ${c.total} ratings, ${c.stayed} stayed, ${c.movedByOne} moved by one, ${c.movedByMore} moved by more (${c.up} up, ${c.down} down)`;
  return [line("All", s), ...Object.entries(s.perVariant).sort(([a], [b]) => a.localeCompare(b)).map(([k, c]) => line(`  ${k}`, c))].join("\n");
}
