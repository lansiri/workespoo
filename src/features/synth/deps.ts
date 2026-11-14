/**
 * Everything the simulator and the seed call in other features, gathered in one object so that
 * tests (and `--fake`) can substitute a stand-in. The default wiring calls the real features
 * through their public `index.ts` only, as docs/FEATURE-API.md requires. `--fake` swaps in the
 * stand-in of `fake-engine.ts`.
 */
import { approveCard, cardForCompany, cardForPerson, editCard, setPoolOptIn } from "@/features/card";
import { settleInterview, startInterview, submitTurn } from "@/features/interview";
import { draftNeedCard } from "@/features/needs";
import { computeEligibility } from "@/features/matching";
import { draftDailyDigests } from "@/features/picks";

export type SimDeps = {
  startInterview: typeof startInterview;
  submitTurn: typeof submitTurn;
  settleInterview: typeof settleInterview;
  cardForPerson: typeof cardForPerson;
  cardForCompany: typeof cardForCompany;
  /** The review edit of the card page; the simulator uses it to declare how the person wants to work. */
  editCard: typeof editCard;
  approveCard: typeof approveCard;
  setPoolOptIn: typeof setPoolOptIn;
};

export type SeedDeps = SimDeps & {
  draftNeedCard: typeof draftNeedCard;
  computeEligibility: typeof computeEligibility;
  draftDailyDigests: typeof draftDailyDigests;
  /** Run the queue until nothing is ready. Returns how many jobs ran. */
  runQueue: (db: Parameters<typeof startInterview>[0]) => Promise<number>;
};

export function realSimDeps(): SimDeps {
  return { startInterview, submitTurn, settleInterview, cardForPerson, cardForCompany, editCard, approveCard, setPoolOptIn };
}

export function realSeedDeps(): SeedDeps {
  return {
    ...realSimDeps(),
    draftNeedCard,
    computeEligibility,
    draftDailyDigests,
    runQueue: async (db) => {
      const { runReadyJobs } = await import("@/lib/queue");
      const { allJobs } = await import("@/worker/registry");
      let total = 0;
      for (let round = 0; round < 50; round++) {
        const ran = await runReadyJobs(db, allJobs);
        total += ran;
        if (ran === 0) break;
      }
      return total;
    },
  };
}
