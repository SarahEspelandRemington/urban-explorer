/**
 * Shared, non-city-specific `authorshipRole x ClaimType -> capability
 * strength` mapping for preservation-document synthetic Sources.
 *
 * A city adapter reports authorship role only (see documentEvidencePacket.ts's
 * AuthorshipRole doc). This module alone decides what trust posture each
 * role gets for each production ClaimType — never a city adapter, and never
 * hard-coded directly onto a synthetic Source.
 *
 * All non-"unknown" values below are PROVISIONAL PLACEHOLDERS, not approved
 * trust decisions — Sarah reviews and approves the real values before pilot
 * execution. Tests intentionally do not lock in specific staff/applicant/
 * consultant-preparer strengths; only the mapping's structure and
 * "unknown" authorship's fail-closed behavior are asserted.
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
  // Unknown/ambiguous authorship fails closed regardless of claim type —
  // the lowest permitted posture, never assumed "medium" by default.
  if (role === "unknown") return "low";

  const isStructured = STRUCTURED_DESIGNATION_TYPES.has(claimType);
  const isCoreFact = CORE_FACT_TYPES.has(claimType);

  switch (role) {
    case "commission-staff":
      return isStructured ? "high" : isCoreFact ? "medium" : "medium";
    case "applicant":
      return isStructured ? "low" : isCoreFact ? "low" : "low";
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
