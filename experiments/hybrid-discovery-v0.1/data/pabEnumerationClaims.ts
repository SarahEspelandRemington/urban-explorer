/**
 * Phase 4 claims for the PAB structured-source enumeration experiment.
 * Offline/non-production — see README.md.
 *
 * These are the only records out of ~129 PAB records enumerated for the
 * Spring Garden 17th->22nd corridor that had actual claim-bearing content
 * (a named identity tied to an independent citation, a dated architectural
 * record, or an explicit register-status date) rather than bare register
 * metadata (building type + client name only, no citation). Per the task's
 * Phase 4 instruction, register-only records (e.g. Dannenbaum Residence,
 * Heisher Residence) are NOT included here — they remain discovery leads,
 * documented in the retrieval-output table, not claims.
 */
import type { Claim } from "../types";

export const PAB_ENUMERATION_CLAIMS: Claim[] = [
  // --- 1822 Spring Garden St — Osteopathic Hospital of Philadelphia ---
  // Deliberately a SEPARATE placeKey from the existing flagged
  // "1822-spring-garden-casket-claim" test case, not a merge/edit of it.
  {
    id: "osteopathic-hospital-identity",
    placeKey: "1822-spring-garden-osteopathic-hospital",
    address: "1822 Spring Garden St",
    proposedIdentityType: "unresolved",
    sourceIds: ["pab-osteopathic-hospital-1822"],
    supportingSpan:
      "Client: Osteopathic Hospital of Philadelphia; Building Type: hospital",
    claimType: "identity",
    claimText:
      "1822 Spring Garden St is PAB's building/project record for the Osteopathic Hospital of Philadelphia.",
    extractionMethod: "direct-source-text",
  },
  {
    id: "osteopathic-hospital-architect-plans",
    placeKey: "1822-spring-garden-osteopathic-hospital",
    address: "1822 Spring Garden St",
    proposedIdentityType: "unresolved",
    sourceIds: ["pab-osteopathic-hospital-1822"],
    supportingSpan:
      "Plans, Elevations, and Section (Savery and Scheetz, architects, 9/11/1916)",
    claimType: "architect",
    claimText:
      "Architectural plans, elevations, and section for the hospital were drawn by Savery and Scheetz, dated September 11, 1916, held in the Hutton-Savery, Scheetz & Savery Collection at the Athenaeum of Philadelphia.",
    relatedEntities: ["Savery and Scheetz"],
    dateRange: { start: "1916-09-11", precise: true },
    extractionMethod: "direct-source-text",
  },

  // --- 1801-1803 Spring Garden St — Fifth Baptist Church ---
  {
    id: "fifth-baptist-identity",
    placeKey: "1801-1803-spring-garden-fifth-baptist-church",
    address: "1801-1803 Spring Garden St",
    proposedIdentityType: "unresolved",
    sourceIds: ["pab-fifth-baptist-church-1801"],
    supportingSpan:
      "Fifth Baptist Church; Also known as: Highway Tabernacle Church; Brandywine Fifth Baptist Church",
    claimType: "identity",
    claimText:
      "Built/used as the Fifth Baptist Church (Baptist denomination) at 1801-1803 Spring Garden St, later known as Highway Tabernacle Church and Brandywine Fifth Baptist Church.",
    relatedEntities: [
      "Fifth Baptist Church",
      "Highway Tabernacle Church",
      "Brandywine Fifth Baptist Church",
    ],
    extractionMethod: "direct-source-text",
  },
  {
    id: "fifth-baptist-register-status",
    placeKey: "1801-1803-spring-garden-fifth-baptist-church",
    address: "1801-1803 Spring Garden St",
    proposedIdentityType: "unresolved",
    sourceIds: ["pab-fifth-baptist-church-1801"],
    supportingSpan:
      "Historic Registrations and Surveys: Philadelphia Register of Historic Places -- 10/11/2000",
    claimType: "register-status",
    claimText:
      "Listed on the Philadelphia Register of Historic Places on 10/11/2000.",
    dateRange: { start: "2000-10-11", precise: true },
    extractionMethod: "direct-source-text",
  },

  // --- 1818 Spring Garden St — Graham Residence ---
  // Same street number PAB files SEPARATELY from the adjoining Reyburn
  // Residence (1820) and from Streetlit's existing combined "1818-1820
  // Spring Garden St" Reyburn/PCOM claim. Flagged for human resolution
  // rather than silently merged or silently dropped.
  {
    id: "graham-residence-identity",
    placeKey: "1818-spring-garden-graham-residence",
    address: "1818 Spring Garden St",
    proposedIdentityType: "unresolved",
    sourceIds: ["pab-graham-residence-1818"],
    supportingSpan:
      "Charles Henry Graham Residence. King, Moses. Philadelphia and Notable Philadelphians. (New York: Blanchard Press, Isaac H. Blanchard Co., 1901), p. 73.",
    claimType: "identity",
    claimText:
      "PAB's own record for 1818 Spring Garden St identifies the building as the residence of Charles Henry Graham, later home to the Russian Missionary & Educational Society -- distinct from the 'Reyburn Mansion' identity Streetlit's existing PCOM-sourced claim uses for the adjoining, combined '1818-1820 Spring Garden St' address range.",
    relatedEntities: [
      "Charles Henry Graham",
      "Russian Missionary & Educational Society",
    ],
    epistemicMarkers: ["unresolved-cross-source-conflict"],
    extractionMethod: "direct-source-text",
  },
];
