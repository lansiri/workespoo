import { sha256Hex } from "./hash";

/**
 * Choosing the handful (matching.md 3.3). The only inputs are when each person was last
 * suggested and a hash. Nothing from a card, and nothing about how many requirements a
 * person touches, can enter here: the candidate type has no field for it.
 */
export type Candidate = {
  talentId: string;
  /** Latest pick of this person for any company and in any status, or null if never. */
  lastDrafted: Date | null;
  /** Had a pick for this company within the rotation window. */
  recent: boolean;
  /** Already has the daily maximum of picks today. */
  capped: boolean;
};

export type Chosen = { talentId: string; pass: 1 | 2; lastDraftedBefore: Date | null };

export function tieKey(seed: string, talentId: string): string {
  return sha256Hex(`${seed}:${talentId}`);
}

function byExposure(seed: string) {
  return (a: Candidate, b: Candidate): number => {
    const ta = a.lastDrafted?.getTime() ?? Number.NEGATIVE_INFINITY;
    const tb = b.lastDrafted?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ka = tieKey(seed, a.talentId);
    const kb = tieKey(seed, b.talentId);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

export function chooseHandful(candidates: readonly Candidate[], opts: { k: number; seed: string }): Chosen[] {
  const sort = byExposure(opts.seed);
  const pass1 = candidates.filter((c) => !c.recent && !c.capped).sort(sort).slice(0, opts.k);
  const chosen: Chosen[] = pass1.map((c) => ({ talentId: c.talentId, pass: 1, lastDraftedBefore: c.lastDrafted }));
  if (chosen.length < opts.k) {
    const pass2 = candidates
      .filter((c) => c.recent && !c.capped)
      .sort(sort)
      .slice(0, opts.k - chosen.length);
    for (const c of pass2) chosen.push({ talentId: c.talentId, pass: 2, lastDraftedBefore: c.lastDrafted });
  }
  return chosen;
}
