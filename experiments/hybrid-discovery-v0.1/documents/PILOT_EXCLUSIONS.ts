/**
 * Step 4 (preregistration) — tracked exclusion list. Every resource here is
 * removed from the candidate frame/universe before any draw, because it
 * was already curated, discussed, or used as a calibration subject prior
 * to this pilot — it must not be eligible to be (re)drawn as one of the
 * six pilot subjects. See `PILOT_PREREGISTRATION.md` for how this list is
 * applied.
 *
 * `address` must match the inventory's own printed address string exactly
 * (see `enumeratePhiladelphiaFrame.ts` — `buildCandidateFrame` matches on
 * this field). Addresses were cross-checked against the parsed PRHP
 * inventory text (retrieved 2026-10-11; see `enumeratePhiladelphiaFrame.ts`
 * module doc comment for the full acquisition record) to confirm the exact
 * printed form (e.g. the inventory prints "1701-07", not "1701-1707").
 */

export interface ExclusionEntry {
  address: string;
  reasonCode: "calibration-subject" | "already-curated-production";
  reasonDetail: string;
  sourceOfReason: string;
}

export const PILOT_EXCLUSIONS: ExclusionEntry[] = [
  {
    address: "2301 FAIRMOUNT AVE",
    reasonCode: "calibration-subject",
    reasonDetail:
      'Used as the Step 3/3A authorship-trust-prior calibration subject (real pipeline rerun against the real nomination PDF, pre/post-change comparison). Historic name "Rothacker-Orth Brewery and Lager Beer Saloon", individually designated 10/14/2022, construction date 1845 per the PRHP inventory. Also already present in production `curatedLocalHistory.ts`, which references the nomination document at https://www.phila.gov/media/20260518102954/2301-Fairmount-Ave-nomination-amended.pdf.',
    sourceOfReason:
      "AUTHORSHIP_TRUST_PRIOR_FREEZE.md, PDF_ACQUISITION_FREEZE.md, acquisitionMetadata.ts (this experiment); artifacts/api-server/src/lib/curatedLocalHistory.ts line ~215 (production)",
  },
  {
    address: "1701-07 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'District-only resource (district "Spring Garden", designated 10/11/2000, construction date 1939, no individual designation date). Cited in production curated content via "Philadelphia Architects and Buildings — 1701-1707 Spring Garden Street".',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "1719-29 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'District-only resource (district "Spring Garden", designated 10/11/2000, construction date 1972, no individual designation date). Cited in production curated content via "Philadelphia Architects and Buildings — 1719-1729 Spring Garden Street".',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "1733 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'District-only resource (district "Spring Garden", designated 10/11/2000, construction date 1875, no individual designation date). Cited in production curated content via "Philadelphia Architects and Buildings — 1733 Spring Garden Street" / "Baldwin Park — The Hoopes Mansion".',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "1801 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'District-only resource (district "Spring Garden", designated 10/11/2000, historic name "Brandywine Fifth Baptist Church", construction date 1864, no individual designation date). Cited in production curated content via "Philadelphia Architects and Buildings — Fifth Baptist Church; Highway Tabernacle Church; Brandywine Fifth Baptist Church".',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "1809 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'District-only resource (district "Spring Garden", designated 10/11/2000, construction date 1940, no individual designation date). Cited in production curated content via "Philadelphia Architects and Buildings — Houston Residence" / "1809 Spring Garden Street" / Baldwin Park pages.',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "1901 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'Both individual (designated 11/6/1975) and district (district "Spring Garden", designated 10/11/2000) resource, construction date 1873. Classified "individual" stratum per the frozen rule. Cited in production curated content via "Philadelphia Architects and Buildings — Heisher Residence" / Baldwin Park pages.',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "1914 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'Both individual (designated 6/29/1971) and district (district "Spring Garden", designated 10/11/2000) resource, construction date 1886. Classified "individual" stratum per the frozen rule. Cited in production curated content via "Philadelphia Architects and Buildings — Residence (1914 Spring Garden St)".',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "1923 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'Both individual (designated 11/6/1975) and district (district "Spring Garden", designated 10/11/2000) resource, construction date 1875. Classified "individual" stratum per the frozen rule. Cited in production curated content via "Philadelphia Architects and Buildings — 1923 Spring Garden Street" / "Baldwin Park — Dinan Funeral Home".',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "1924 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'District-only resource (district "Spring Garden", designated 10/11/2000, construction date 1961, no individual designation date). Cited in production curated content via "Philadelphia Architects and Buildings — 1924 Spring Garden Street" / "Baldwin Park — Unions in the Neighborhood".',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "2013 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'Both individual (designated 5/1/1975) and district (district "Spring Garden", designated 10/11/2000) resource, construction date 1855. Classified "individual" stratum per the frozen rule. Cited in production curated content via "Philadelphia Architects and Buildings — 2013 Spring Garden Street" / "Baldwin Park — Robert Carson".',
    sourceOfReason: "artifacts/api-server/src/lib/curatedLocalHistory.ts",
  },
  {
    address: "2133-35 SPRING GARDEN ST",
    reasonCode: "already-curated-production",
    reasonDetail:
      'District-only resource (district "Spring Garden", designated 10/11/2000, historic name "Polonia Federal Savings Bank", construction date 1875, no individual designation date). Already curated in production as an AUTO-ADMIT subject (Polonia Federal Savings Bank), with the PRHP register entry cited as the authoritative source for the 1875 construction date.',
    sourceOfReason:
      "artifacts/api-server/src/lib/curatedLocalHistory.ts (lines ~239-241)",
  },
];
