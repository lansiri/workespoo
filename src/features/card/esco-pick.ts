/** Prompt C moved to the shared library (src/lib/esco-pick.ts); the card feature keeps its import path. */
export {
  ESCO_CANDIDATES_PER_SIGNAL,
  ESCO_MIN_CANDIDATE_SIMILARITY,
  ESCO_PICK_DEADLINE_MS,
  ESCO_PICK_SYSTEM_PROMPT,
  buildEscoPickMessages,
  pickEscoLabels,
  type PickItem,
} from "@/lib/esco-pick";
