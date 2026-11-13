/**
 * Public API of the needs feature (stream S2). Signatures are fixed by docs/FEATURE-API.md.
 * Other features import only from here.
 */
export { draftNeedCard } from "./draft";
export { getNeedCard, getNeedCardForJob, listNeedCards } from "./store";
export { recomputePoolEvidence } from "./pool";
