/**
 * Shared, non-city-specific `authorshipRole x ClaimType -> capability
 * strength` mapping for preservation-document synthetic Sources.
 *
 * A city adapter reports authorship role only (see documentEvidencePacket.ts's
 * AuthorshipRole doc). This module alone decides what trust posture each
 * role gets for each production ClaimType — never a city adapter, and never
 * hard-coded directly onto a synthetic Source.
 *
 * PRE-REGISTERED PILOT PRIOR (implementation step 3A, frozen before the
 * six-subject pilot — see AUTHORSHIP_TRUST_PRIOR_FREEZE.md): for narrative
 * claim types (everything other than the structured-designation and
 * core-fact types below), `applicant`, `consultant-preparer`, and `unknown`
 * authorship all receive `"medium"` capability. Unlabeled nomination prose
 * is not intrinsically lower-trust than Wikipedia/Forgotten New York prose
 * merely for lacking a stated author — claim-level integrity concerns
 * remain the responsibility of the existing checks, not this table.
 * Structured-designation and core-fact claim types are NOT covered by this
 * narrative posture and remain fail-closed as before (see
 * STRUCTURED_DESIGNATION_TYPES/CORE_FACT_TYPES below) — no special
 * structured-fact trust exception has been added. `commission-staff`
 * values are unchanged from the prior provisional draft.
 *
 * This table must not be changed again after seeing six-subject pilot
 * outcomes without explicitly invalidating/restarting the pre-registration
 * (see AUTHORSHIP_TRUST_PRIOR_FREEZE.md).
 *
 * Deliberately does not represent cited historical assertions within a
 * document's own prose as an authorship role — those are a root-provenance/
 * `references[]` concern (see documentEvidencePacket.ts), not this table.
 *
 * Offline/non-production, experimental.
 */
import type { AuthorshipRole } from "./documentEvidencePacket";
import type {
  ClaimType,
  SourceCapability,
} from "../../../artifacts/api-server/src/lib/localHistoryAdmission/types";

/** Every production ClaimType, enumerated here only because this provisional
 * table needs one row per type. Frozen for this task — no new ClaimType. */
export const ALL_CLAIM_TYPES: ClaimType[] = [
  "identity",
  "construction-date",
  "architect",
  "register-status",
  "use-history",
  "biographical",
  "institutional-founding",
  "event",
  "superlative",
  "legend-tradition",
  "statistic",
  "demolition",
  "relationship",
  "urban-remnant",
];

// Structured designation/status facts the commission itself determines.
const STRUCTURED_DESIGNATION_TYPES: ReadonlySet<ClaimType> = new Set([
  "register-status",
]);
// Discrete, checkable facts (a date, a name) rather than interpretive prose.
const CORE_FACT_TYPES: ReadonlySet<ClaimType> = new Set([
  "construction-date",
  "architect",
  "identity",
]);
// Everything else (use-history, biographical, event, etc.) is treated as
// interpretive/narrative significance prose.

type Strength = SourceCapability["strength"];

function provisionalStrength(
  role: AuthorshipRole,
  claimType: ClaimType,
): Strength {
  const isStructured = STRUCTURED_DESIGNATION_TYPES.has(claimType);
  const isCoreFact = CORE_FACT_TYPES.has(claimType);
  const isNarrative = !isStructured && !isCoreFact;

  if (role === "unknown") {
    // Pre-registered pilot prior (see AUTHORSHIP_TRUST_PRIOR_FREEZE.md):
    // unknown authorship is no longer globally lowest — narrative claim
    // types get the same "medium" posture as applicant/consultant-preparer
    // narrative prose, since the lack of a stated author does not itself
    // make nomination prose less trustworthy than other narrative sources.
    // Structured-designation and core-fact claim types remain fail-closed.
    return isNarrative ? "medium" : "low";
  }

  switch (role) {
    case "commission-staff":
      return isStructured ? "high" : isCoreFact ? "medium" : "medium";
    case "applicant":
      // Pre-registered pilot prior: narrative prose medium; structured/
      // core-fact lanes unchanged (no special structured-fact exception
      // added in this task).
      return isStructured ? "low" : isCoreFact ? "low" : "medium";
    case "consultant-preparer":
      return isStructured ? "low" : isCoreFact ? "medium" : "medium";
  }
}

export function capabilityForRole(
  role: AuthorshipRole,
  claimType: ClaimType,
): Strength {
  return provisionalStrength(role, claimType);
}

export function capabilitiesForAuthorshipRole(
  role: AuthorshipRole,
  claimTypes: ClaimType[] = ALL_CLAIM_TYPES,
): SourceCapability[] {
  return claimTypes.map((claimType) => ({
    claimType,
    strength: capabilityForRole(role, claimType),
    notes:
      "Provisional placeholder value — pending review/approval before pilot execution.",
  }));
}
