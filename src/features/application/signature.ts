/**
 * What an organiser saw of a ranked list, as one string: the Need Card version, then the
 * people in order with their points. The page sends it back with an approval and the server
 * compares it with the list as it stands, so that nobody approves a list they did not read.
 * Pure: the browser and the server compute it from the same fields.
 */
export function rankedListSignature(list: {
  needCardVersion: number | null;
  applicants: ReadonlyArray<{ applicationId: string; points: number; maxPoints: number }>;
}): string {
  return `${list.needCardVersion ?? "-"}#${applicantsSignature(list.applicants)}`;
}

/** People, order and points of a list, as one string to compare. */
export function applicantsSignature(list: ReadonlyArray<{ applicationId: string; points: number; maxPoints: number }>): string {
  return list.map((a) => `${a.applicationId}:${a.points}/${a.maxPoints}`).join("|");
}
