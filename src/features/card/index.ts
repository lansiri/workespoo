/**
 * Public API of the card feature (stream S1b). Signatures are fixed by docs/FEATURE-API.md.
 * Extra exports (`editCard`, `CardEdit`, `purgeLiveSessions`) serve this feature's own routes.
 */
export { synthesiseCard } from "./synthesis";
export {
  cardForPerson,
  cardPageView,
  cardForCompany,
  cardForOrganiser,
  cardForCompanyRevealed,
  getApprovedCard,
} from "./projections";
export { approveCard, setPoolOptIn } from "./approval";
export { editCard, CardEdit } from "./review";
export { purgeLiveSessions } from "./jobs";
export { renderSignal } from "./render";
export { exportPersonData, deletePerson } from "./mydata";
