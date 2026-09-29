/**
 * Forgotten New York -> physical-place grounding. Offline/non-production,
 * experimental — see ../README.md.
 *
 * Notable finding: this module adds NO new grounding logic at all. Forgotten
 * New York's grounding need — address-only (no BIN or other structured NYC
 * identifier; an ordinary narrative publication, not a government dataset),
 * same current-entity/unnamed-current-building/former-site/unresolved
 * categorical shape, same scale-implausibility safeguard — is IDENTICAL to
 * Ephemeral New York's. This re-exports ephemeral/ephemeralGrounding.ts's
 * `groundEphemeralAddress` unchanged rather than duplicating it, confirming
 * that address-only narrative-source grounding is now a reusable shape
 * across two independent NYC sources, not something re-derived per source.
 */
export {
  groundEphemeralAddress as groundForgottenNyAddress,
  fetchOsmBboxIndex,
  W38_W53_CORRIDOR_BBOX,
} from "../ephemeral/ephemeralGrounding";
export type {
  EphemeralGroundingResult as ForgottenNyGroundingResult,
  LpcOsmElement,
  LpcCorridorBbox,
} from "../ephemeral/ephemeralGrounding";
