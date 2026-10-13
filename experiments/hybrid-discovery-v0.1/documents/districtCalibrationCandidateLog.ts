/**
 * Step 5 (district calibration selection + structural validation only) —
 * tracked, machine-readable candidate-check log. Records every
 * district-package candidate checked, in frozen seeded order, while
 * searching for the district calibration subject. This becomes part of the
 * pilot record (see PILOT_PREREGISTRATION.md section 10, "District
 * calibration").
 *
 * Two candidates were checked before the walk stopped at the first
 * structurally qualifying candidate (CANDIDATE_CHECK_CAP = 10 was not
 * exhausted):
 * - #1 (144 BREAD ST / Old City): Gate 3 applicable (narrative-block-
 *   inventory dialect), Gate 4 skip (district-entry-not-found — a genuine
 *   street-type-suffix abbreviation mismatch between this document and the
 *   PRHP register, never worked around).
 * - #2 (4004 SPRUCE ST / Southeast Spruce Hill): Gate 3 applicable
 *   (per-parcel-field-survey dialect), Gate 4 match — ACCEPTED as the
 *   district calibration subject.
 *
 * Offline/non-production, experimental.
 */
import type { StructuralSkipReason } from "./enumeratePhiladelphiaFrame";

export interface DistrictCalibrationCandidateLogEntry {
  seededOrderPosition: number;
  candidateAddress: string;
  districtName: string;
  packageDocumentTitle: string;
  packageDocumentUrl: string;
  retrievalOutcome: "fetched" | "unfetchable-missing-file";
  textLayerStatus: "has-text-layer" | "scan-only";
  gate3Outcome: "applicable" | "skip";
  gate3MatchedDialectLabel?: string;
  gate4Outcome?: "match" | "skip";
  skipReason?: Extract<
    StructuralSkipReason,
    | "wrong-document-type-adapter-inapplicable"
    | "district-entry-not-found"
    | "package-already-represented"
  >;
  structuralEvidence: string;
  accepted: boolean;
}

export const DISTRICT_CALIBRATION_CANDIDATE_LOG: DistrictCalibrationCandidateLogEntry[] =
  [
    {
      seededOrderPosition: 1,
      candidateAddress: "144 BREAD ST",
      districtName: "Old City",
      packageDocumentTitle:
        "Old City Historic District nomination (Philadelphia Historical Commission)",
      packageDocumentUrl:
        "https://www.phila.gov/media/20241023081326/Historic-District-Old-City.pdf",
      retrievalOutcome: "fetched",
      textLayerStatus: "has-text-layer",
      gate3Outcome: "applicable",
      gate3MatchedDialectLabel: "narrative-block-inventory",
      gate4Outcome: "skip",
      skipReason: "district-entry-not-found",
      structuralEvidence:
        'Gate 3: repeating "<STREET NAME> \u2013 <NUMBER|Unit> Block" section heading confirmed 108 occurrences in the real extraction, zero false positives. Gate 4: the document spells street-type suffixes in full (e.g. "144 BREAD STREET"), while the PRHP register abbreviates them (e.g. "144 BREAD ST") \u2014 no exact match under the frozen no-fuzzy-matching rule; a genuine, non-workaroundable mismatch, not a bug.',
      accepted: false,
    },
    {
      seededOrderPosition: 2,
      candidateAddress: "4004 SPRUCE ST",
      districtName: "Southeast Spruce Hill",
      packageDocumentTitle:
        "Southeast Spruce Hill Historic District nomination (Philadelphia Historical Commission)",
      packageDocumentUrl:
        "https://www.phila.gov/media/20241023081326/Historic-District-Southeast-Spruce-Hill.pdf",
      retrievalOutcome: "fetched",
      textLayerStatus: "has-text-layer",
      gate3Outcome: "applicable",
      gate3MatchedDialectLabel: "per-parcel-field-survey",
      gate4Outcome: "match",
      structuralEvidence:
        'Gate 3: repeating "Address            <ADDRESS>" per-parcel field-label line confirmed 574 occurrences in the real extraction, exactly matching 574 "Registry Number" fields, zero false positives. Gate 4: exact normalized-address match \u2014 the document\'s own "Address" field for Registry Number 020S110070 reads "4004 SPRUCE ST", identical in abbreviation format to the PRHP register\'s printed form.',
      accepted: true,
    },
  ];
