/**
 * Forgotten New York -> physical-place grounding.
 *
 * Promoted (faithful port) from
 * experiments/hybrid-discovery-v0.1/forgottenny/forgottenNyGrounding.ts for
 * production offline batch-tool use. That file re-exported Ephemeral's
 * address-only categorical grounding unchanged; this now re-exports from the
 * generalized production module ../../narrativeAddressGrounding.ts (the same
 * logic, promoted and renamed generically since it's shared by any
 * address-only narrative source, not just Ephemeral). No behavior change.
 */
export {
  fetchOsmBboxIndex,
  groundNarrativeAddress as groundForgottenNyAddress,
} from "../../narrativeAddressGrounding";
export type {
  NarrativeBbox,
  NarrativeOsmElement,
  NarrativeGroundingResult,
} from "../../narrativeAddressGrounding";
