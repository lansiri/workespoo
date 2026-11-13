/**
 * Everything the simulator and the seed call in other features, gathered in one object so that
 * tests (and `--fake`) can substitute a stand-in. The default wiring calls the real features
 * through their public `index.ts` only, as docs/FEATURE-API.md requires.
 */
import { approveCard, cardForCompany, cardForPerson, setPoolOptIn } from "@/features/card";
import { settleInterview, startInterview, submitTurn } from "@/features/interview";
import { draftNeedCard } from "@/features/needs";
import { computeEligibility } from "@/features/matching";
import { draftDailyDigests } from "@/features/picks";
import { callFeature } from "./errors";

export type SimDeps = {
  startInterview: typeof startInterview;
  submitTurn: typeof submitTurn;
  settleInterview: typeof settleInterview;
  cardForPerson: typeof cardForPerson;
  cardForCompany: typeof cardForCompany;
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
  return {
    startInterview: (db, req) => callFeature("interview", "startInterview", "start a simulated interview", () => startInterview(db, req)),
    submitTurn: (db, id, req, opts) =>
      (async function* () {
        try {
          yield* submitTurn(db, id, req, opts);
        } catch (error) {
          // Re-thrown through callFeature so a stub becomes FeatureNotReadyError.
          await callFeature("interview", "submitTurn", "answer the interviewer", () => Promise.reject(error));
        }
      })(),
    settleInterview: (db, id, ms) => callFeature("interview", "settleInterview", "wait for card synthesis", () => settleInterview(db, id, ms)),
    cardForPerson: (db, id) => callFeature("card", "cardForPerson", "read the draft card", () => cardForPerson(db, id)),
    cardForCompany: (db, id) => callFeature("card", "cardForCompany", "read the company view of the card", () => cardForCompany(db, id)),
    approveCard: (db, id) => callFeature("card", "approveCard", "approve the card", () => approveCard(db, id)),
    setPoolOptIn: (db, id, inPool) => callFeature("card", "setPoolOptIn", "opt the person in to the pool", () => setPoolOptIn(db, id, inPool)),
  };
}

export function realSeedDeps(): SeedDeps {
  return {
    ...realSimDeps(),
    draftNeedCard: (db, jobId, companyId) => callFeature("needs", "draftNeedCard", "draft a demo company's Need Card", () => draftNeedCard(db, jobId, companyId)),
    computeEligibility: (db, scope) => callFeature("matching", "computeEligibility", "compute who counts for each need", () => computeEligibility(db, scope)),
    draftDailyDigests: (db, date) => callFeature("picks", "draftDailyDigests", "draft today's digests", () => draftDailyDigests(db, date)),
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
