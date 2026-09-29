/**
 * Hand-transcribed claim dataset for the Streetlit Hybrid Discovery v0.1
 * harness. Offline/non-production — see README.md.
 *
 * Real corridor claims are transcribed from claims actually gathered by
 * manual research (WebFetch/WebSearch) against Spring Garden Street,
 * 22nd->17th, in prior sessions, including the two known real failure
 * shapes this harness is specifically built to catch:
 *   - the 1822 Spring Garden casket-showroom provenance failure
 *   - the Newkirk/1837 synthesized-search-summary conflation at 1901
 *     Spring Garden Street
 *
 * A small block of claims at the end is clearly marked SYNTHETIC —
 * illustrative-only stand-ins (same disclosed-synthetic methodology used in
 * the earlier Task C adversarial retest) used solely to exercise the
 * temporal-consistency and self-corrected-primary-source check paths, which
 * no real claim in this corridor happens to trigger on its own. They are
 * attached to a placeKey that is not a real Spring Garden address and must
 * be excluded from any "real corridor" tally.
 */
import type { Claim } from "../types";

export const SPRING_GARDEN_CLAIMS: Claim[] = [
  // --- 1700 Spring Garden St — Spring Garden Carnegie Library (former-site) ---
  {
    id: "carnegie-construction-date",
    placeKey: "1700-spring-garden-carnegie-library",
    address: "1700 Spring Garden St",
    proposedIdentityType: "former-site",
    sourceIds: ["phillyhistory-blog"],
    supportingSpan: "opened in 1907",
    claimType: "construction-date",
    claimText:
      "The Spring Garden branch of the Carnegie library system opened in 1907.",
    dateRange: { start: "1907", precise: true },
  },
  {
    id: "carnegie-architect",
    placeKey: "1700-spring-garden-carnegie-library",
    address: "1700 Spring Garden St",
    proposedIdentityType: "former-site",
    sourceIds: ["phillyhistory-blog"],
    supportingSpan: "designed by Field & Medary",
    claimType: "architect",
    claimText: "The branch building was designed by the firm Field & Medary.",
    relatedEntities: ["Field & Medary"],
  },
  {
    id: "carnegie-use-history",
    placeKey: "1700-spring-garden-carnegie-library",
    address: "1700 Spring Garden St",
    proposedIdentityType: "former-site",
    sourceIds: ["phillyhistory-blog"],
    supportingSpan: "one of Philadelphia's 25 Carnegie branch libraries",
    claimType: "use-history",
    claimText:
      "Operated as one of Philadelphia's 25 Carnegie-funded branch libraries until demolition.",
  },
  {
    id: "carnegie-librarian-relationship",
    placeKey: "1700-spring-garden-carnegie-library",
    address: "1700 Spring Garden St",
    proposedIdentityType: "former-site",
    sourceIds: ["phillyhistory-blog"],
    supportingSpan:
      "branch librarian Amy Ridgway is named in passing, role/tenure not independently confirmed",
    claimType: "relationship",
    claimText:
      "Names Amy Ridgway as a branch librarian associated with the building, without independent confirmation of her role or tenure.",
    relatedEntities: ["Amy Ridgway"],
    epistemicMarkers: ["author-uncertainty"],
  },

  // --- 1818-1820 Spring Garden St — Reyburn Mansion / PCOM ---
  {
    id: "reyburn-identity",
    placeKey: "1818-spring-garden-reyburn-mansion",
    address: "1818-1820 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["pcom-institutional-history"],
    supportingSpan:
      "the former Reyburn Mansion became an early campus building",
    claimType: "identity",
    claimText:
      "The former Reyburn Mansion was later occupied by the Philadelphia College of Osteopathic Medicine (PCOM).",
  },
  {
    id: "reyburn-institutional-founding",
    placeKey: "1818-spring-garden-reyburn-mansion",
    address: "1818-1820 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["pcom-institutional-history"],
    supportingSpan:
      "served as one of PCOM's early Philadelphia campus buildings",
    claimType: "institutional-founding",
    claimText: "Served as one of PCOM's early Philadelphia campus buildings.",
  },

  // --- 1822 Spring Garden St — flagship provenance-failure retest ---
  {
    id: "1822-casket-showroom",
    placeKey: "1822-spring-garden-casket-claim",
    address: "1822 Spring Garden St",
    proposedIdentityType: "unresolved",
    sourceIds: ["baldwinparkphilly-1822-casket-claim"],
    supportingSpan: "F.H. Hill Co. operated a casket showroom here",
    claimType: "use-history",
    claimText:
      "F.H. Hill Co. operated a casket showroom at 1822 Spring Garden St, on a site now occupied by present-day retail.",
  },

  // --- 1901 Spring Garden St — St. George Society Building ---
  {
    id: "st-george-construction-date-real",
    placeKey: "1901-spring-garden-st-george-society",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["spring-garden-1901-history-article"],
    supportingSpan: "built in 1875",
    claimType: "construction-date",
    claimText: "1901 Spring Garden Street was built in 1875.",
    dateRange: { start: "1875", precise: true },
  },
  {
    id: "st-george-architect-real",
    placeKey: "1901-spring-garden-st-george-society",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["spring-garden-1901-history-article"],
    supportingSpan: "designed by architect Edwin Randolph",
    claimType: "architect",
    claimText: "Designed by architect Edwin Randolph.",
    relatedEntities: ["Edwin Randolph"],
  },
  {
    id: "st-george-construction-date-newkirk-error",
    placeKey: "1901-spring-garden-st-george-society",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["search-summary-ephemeral"],
    supportingSpan:
      "AI search summary: 'built in 1837 for railroader Matthew Newkirk, designed by Thomas U. Walter'",
    claimType: "construction-date",
    claimText:
      "Built in 1837 as a home for railroader Matthew Newkirk, designed by Thomas U. Walter.",
    relatedEntities: ["Matthew Newkirk", "Thomas U. Walter"],
    dateRange: { start: "1837", precise: true },
  },

  // --- 2133-35 Spring Garden St — Polonia Federal Savings Bank ---
  {
    id: "polonia-identity",
    placeKey: "2133-spring-garden-polonia",
    address: "2133-35 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["philadelphiabuildings-org", "phc-register"],
    supportingSpan:
      "individually documented cultural-resource / register entry",
    claimType: "identity",
    claimText:
      "Individually documented as the former Polonia Federal Savings Bank building.",
    corroborationKey: "polonia-identity",
  },
  {
    id: "polonia-construction-date",
    placeKey: "2133-spring-garden-polonia",
    address: "2133-35 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["philadelphiabuildings-org"],
    supportingSpan: "construction date on record",
    claimType: "construction-date",
    claimText:
      "Construction date documented in the Philadelphia Architects and Buildings record.",
  },
  {
    id: "polonia-architect",
    placeKey: "2133-spring-garden-polonia",
    address: "2133-35 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["philadelphiabuildings-org"],
    supportingSpan: "architect on record",
    claimType: "architect",
    claimText:
      "Architect documented in the Philadelphia Architects and Buildings record.",
  },

  // --- 1800 Spring Garden St ---
  {
    id: "1800-register-status",
    placeKey: "1800-spring-garden",
    address: "1800 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["philadelphiabuildings-org", "phc-register"],
    supportingSpan: "individually listed 1971",
    claimType: "register-status",
    claimText:
      "Individually listed on the Philadelphia Register in 1971, predating the later Spring Garden Historic District (designated 2000).",
    dateRange: { start: "1971", precise: true },
  },

  // --- 1701-1707 Spring Garden St ---
  {
    id: "1701-register-status",
    placeKey: "1701-1707-spring-garden",
    address: "1701-1707 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["philadelphiabuildings-org"],
    supportingSpan: "listed building within the Spring Garden corridor",
    claimType: "register-status",
    claimText: "Listed building within the Spring Garden Historic District.",
  },
  {
    id: "1701-local-union-98",
    placeKey: "1701-1707-spring-garden",
    address: "1701-1707 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["loopnet-listing-1701"],
    supportingSpan:
      "commercial listing copy referencing a former Local Union 98 tenancy",
    claimType: "use-history",
    claimText: "Later home to Local Union 98 (IBEW).",
  },

  // --- 1711 Spring Garden St ---
  {
    id: "1711-register-status",
    placeKey: "1711-spring-garden",
    address: "1711 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["philadelphiabuildings-org"],
    supportingSpan: "listed building within the Spring Garden corridor",
    claimType: "register-status",
    claimText: "Listed building within the Spring Garden Historic District.",
  },

  // --- 1809 Spring Garden St — PA College of Optometry ---
  {
    id: "1809-register-status",
    placeKey: "1809-spring-garden-pa-college-optometry",
    address: "1809 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["philadelphiabuildings-org"],
    supportingSpan: "listed building within the Spring Garden corridor",
    claimType: "register-status",
    claimText: "Listed building within the Spring Garden Historic District.",
  },
  {
    id: "1809-eye-clinic-superlative",
    placeKey: "1809-spring-garden-pa-college-optometry",
    address: "1809 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["baldwinparkphilly-org"],
    supportingSpan: "billed as one of the largest eye clinics in the region",
    claimType: "superlative",
    claimText: "Billed as one of the largest eye clinics in the region.",
    epistemicMarkers: ["superlative"],
  },

  // --- 1903 Spring Garden St — La Milagrosa ---
  {
    id: "la-milagrosa-founding",
    placeKey: "1903-spring-garden-la-milagrosa",
    address: "1903 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["catholicphilly-com"],
    supportingSpan: "100 years and still going strong",
    claimType: "institutional-founding",
    claimText:
      "Founded circa 1911-1912 as a chapel serving Philadelphia's Spanish-speaking Catholic community.",
    dateRange: { start: "1911", precise: false },
  },
  {
    id: "la-milagrosa-closure-event",
    placeKey: "1903-spring-garden-la-milagrosa",
    address: "1903 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["inquirer-la-milagrosa-2013"],
    supportingSpan: "La Milagrosa chapel to close in June",
    claimType: "event",
    claimText: "Chapel closed in June 2013 amid parish consolidation.",
    dateRange: { start: "2013-06", precise: true },
  },
  {
    id: "la-milagrosa-use-history-conflict",
    placeKey: "1903-spring-garden-la-milagrosa",
    address: "1903 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["inquirer-la-milagrosa-2023"],
    supportingSpan:
      "post-closure residential conversion, unit type/count disputed against a separate secondary account",
    claimType: "use-history",
    claimText:
      "Building later converted to residential use; a separate secondary account disputes whether the units are apartments or condos and the unit count.",
    epistemicMarkers: ["disputed-across-sources"],
  },

  // --- 1717 Spring Garden St — Stetson House ---
  {
    id: "stetson-identity",
    placeKey: "1717-spring-garden-stetson-house",
    address: "1717 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["stetson-house-search-excerpt", "condoshop-listing-1717"],
    supportingSpan: "originally built for the famous Stetson Hat family",
    claimType: "identity",
    claimText: "Originally built for the Stetson Hat family.",
    corroborationKey: "stetson-hat-family-identity",
  },

  // --- SYNTHETIC illustrative-only claims — not a real Spring Garden address ---
  // Disclosed stand-ins used only to exercise temporal-consistency and
  // self-corrected-primary-source, which no real corridor claim triggers.
  // Excluded from all real-corridor tallies in the evaluation report.
  {
    id: "synthetic-temporal-conflict-a",
    placeKey: "synthetic-illustrative-not-a-real-address",
    proposedIdentityType: "unresolved",
    sourceIds: ["synthetic-illustrative-source-a"],
    supportingSpan: "SYNTHETIC — illustrative only",
    claimType: "construction-date",
    claimText: "SYNTHETIC — illustrative only: built in 1890.",
    dateRange: { start: "1890", precise: true },
  },
  {
    id: "synthetic-temporal-conflict-b",
    placeKey: "synthetic-illustrative-not-a-real-address",
    proposedIdentityType: "unresolved",
    sourceIds: ["synthetic-illustrative-source-b"],
    supportingSpan: "SYNTHETIC — illustrative only",
    claimType: "construction-date",
    claimText: "SYNTHETIC — illustrative only: built in 1905.",
    dateRange: { start: "1905", precise: true },
  },
  {
    id: "synthetic-self-corrected",
    placeKey: "synthetic-illustrative-not-a-real-address",
    proposedIdentityType: "unresolved",
    sourceIds: ["synthetic-illustrative-source-c"],
    supportingSpan: "SYNTHETIC — illustrative only",
    claimType: "use-history",
    claimText:
      "SYNTHETIC — illustrative only: the same primary source initially reported one use, then corrected itself in a later edition of the same publication.",
    epistemicMarkers: ["self-corrected-primary-source"],
  },
];
