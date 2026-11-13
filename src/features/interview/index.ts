/**
 * Public API of the interview feature (stream S1a). Signatures are fixed by
 * docs/FEATURE-API.md.
 */
export { startInterview, submitTurn, stopInterview, settleInterview } from "./engine";
export type { SubmitTurnOptions } from "./engine";
export { followEvents } from "./events";
