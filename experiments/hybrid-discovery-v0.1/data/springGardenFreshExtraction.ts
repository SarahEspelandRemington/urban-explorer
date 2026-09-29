/**
 * Stage 1 fresh-extraction claim set for the Streetlit Hybrid Discovery
 * v0.1 harness. Offline/non-production — see README.md.
 *
 * BLIND-TEST DISCLOSURE: extracted in a fresh research pass against the
 * approved source universe for Spring Garden Street, 22nd->17th, WITHOUT
 * searching for named places already known from prior Streetlit sessions
 * (Carnegie Library, Reyburn Mansion, Polonia, La Milagrosa, Stetson House,
 * St. George Society, the 1822 SG casket claim, etc.). Search queries used
 * generic corridor/address/source-class terms only (e.g. "site:
 * philadelphiabuildings.org Spring Garden Street", "1900 block Spring
 * Garden Street history", "2229 2237 Spring Garden Street"). Where a known
 * place organically resurfaced in a generic result set, it was not
 * re-extracted here — recall against it is scored at reconciliation, not
 * avoided during search. This file was frozen before comparing against
 * curatedLocalHistory.ts or any prior experiment output.
 *
 * Two real corridor buildings not previously in any Streetlit dataset were
 * found this way: the Julia R. Masterman School (1699 SG, née Philadelphia
 * High School for Girls, 1876/1933) and the Hoopes Mansion (1733 SG). A
 * third, 1901 SG / former St. George Society building, was re-extracted
 * directly from its own admissible source page for the first time (prior
 * work only had the erroneous search-summary version plus a stand-in
 * source) and a fourth, 1818-1820 SG, is corrected/expanded here: the
 * former Reyburn Mansion/PCOM Hospital site was demolished in 1937 and is
 * now Spring Garden Towers (1978), not still occupied by PCOM.
 */
import type { Claim } from "../types";

export const SPRING_GARDEN_FRESH_CLAIMS: Claim[] = [
  // --- 1699 Spring Garden St — Julia R. Masterman School ---
  {
    id: "masterman-1876-origin",
    placeKey: "1699-spring-garden-masterman",
    address: "1699 Spring Garden St",
    proposedIdentityType: "former-site",
    sourceIds: ["phillyhistory-blog-girls-high"],
    supportingSpan:
      "In 1876, a new building located at 17th and Spring Garden Streets was erected... forty classrooms, terraced lecture halls, and an auditorium capable of seating 1200 people",
    claimType: "institutional-founding",
    claimText:
      "In 1876 a combined Girls' High and Normal School building was erected at 17th and Spring Garden Streets, with forty classrooms and an auditorium seating 1,200; only Girard College and the University of Pennsylvania used more land in the city at the time.",
    dateRange: { start: "1876", precise: true },
  },
  {
    id: "masterman-1893-split",
    placeKey: "1699-spring-garden-masterman",
    address: "1699 Spring Garden St",
    proposedIdentityType: "former-site",
    sourceIds: ["phillyhistory-blog-girls-high"],
    supportingSpan:
      "In 1893, the High School and Normal School were separated...renamed the Philadelphia High School for Girls",
    claimType: "event",
    claimText:
      "In 1893 the Normal School moved to 13th & Spring Garden Streets and the 17th & Spring Garden building was renamed the Philadelphia High School for Girls.",
    dateRange: { start: "1893", precise: true },
  },
  {
    id: "masterman-1933-rebuild",
    placeKey: "1699-spring-garden-masterman",
    address: "1699 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["wikipedia-masterman-nrhp"],
    supportingSpan:
      "built in 1933 and designed by architect Irwin T. Catharine in the Classical Revival architectural style",
    claimType: "construction-date",
    claimText:
      "The current building at 1699 Spring Garden Street was constructed in 1933, designed by architect Irwin T. Catharine in the Classical Revival style.",
    relatedEntities: ["Irwin T. Catharine"],
    dateRange: { start: "1933", precise: true },
  },
  {
    id: "masterman-1958-transition",
    placeKey: "1699-spring-garden-masterman",
    address: "1699 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["phillyhistory-blog-girls-high", "wikipedia-masterman-nrhp"],
    supportingSpan:
      "Girls' High moved to its current location at Broad Street and Olney Avenue in 1958, with the old building on Spring Garden Street becoming the Julia R. Masterman School",
    claimType: "event",
    claimText:
      "Girls' High moved to Broad & Olney Avenue in 1958; the Spring Garden Street building became the Julia R. Masterman School.",
    dateRange: { start: "1958", precise: true },
    corroborationKey: "masterman-1958-transition",
  },
  {
    id: "masterman-nrhp",
    placeKey: "1699-spring-garden-masterman",
    address: "1699 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["wikipedia-masterman-nrhp"],
    supportingSpan:
      "added to the NRHP on December 4, 1986... under the name Philadelphia High School for Girls, NRHP reference number 86003302",
    claimType: "register-status",
    claimText:
      'Listed on the National Register of Historic Places in 1986 under the name "Philadelphia High School for Girls" (NRHP ref. 86003302).',
    dateRange: { start: "1986", precise: true },
  },

  // --- 1733 Spring Garden St — Hoopes Mansion ---
  {
    id: "hoopes-construction",
    placeKey: "1733-spring-garden-hoopes-mansion",
    address: "1733 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["baldwinparkphilly-hoopes-mansion"],
    supportingSpan: "in 1878 he built a massive four-story mansion on this lot",
    claimType: "construction-date",
    claimText:
      "Built in 1878 by industrialist Barton Hoopes as a four-story mansion (7,567 sq ft including the carriage house).",
    dateRange: { start: "1878", precise: true },
    // Address/name first surfaced via a real-estate listing (Zillow) lead;
    // this claim itself is sourced from and resolves to the admissible
    // baldwinparkphilly.org page, not the listing.
    extractionMethod: "discovery-lead-traced-to-source",
  },
  {
    id: "hoopes-biographical",
    placeKey: "1733-spring-garden-hoopes-mansion",
    address: "1733 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["baldwinparkphilly-hoopes-mansion"],
    supportingSpan:
      "Barton's partner, Samuel Sharpless Townsend... In 1852 Hoopes & Townsend moved to Broad and Buttonwood Street",
    claimType: "biographical",
    claimText:
      "Barton Hoopes co-owned Hoopes & Townsend, a nut/bolt/rivet manufacturer, with partner Samuel Sharpless Townsend; the factory was at Broad & Buttonwood Street, supplying industrial customers including Baldwin Locomotive Works.",
    relatedEntities: ["Samuel Sharpless Townsend", "Hoopes & Townsend"],
    extractionMethod: "discovery-lead-traced-to-source",
  },
  {
    id: "hoopes-land-purchase",
    placeKey: "1733-spring-garden-hoopes-mansion",
    address: "1733 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["baldwinparkphilly-hoopes-mansion"],
    supportingSpan:
      "In 1872 Hoopes bought the block from 17th to 18th Streets and from Spring Garden to Brandywine Streets",
    claimType: "event",
    claimText:
      "In 1872 Hoopes bought the entire block bounded by 17th, 18th, Spring Garden, and Brandywine Streets, later selling off most of it as residential lots.",
    dateRange: { start: "1872", precise: true },
    extractionMethod: "direct-source-text",
  },
  {
    id: "hoopes-filbert-rumor-denied",
    placeKey: "1733-spring-garden-hoopes-mansion",
    address: "1733 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["baldwinparkphilly-hoopes-mansion"],
    supportingSpan: "Rumors that Filbert Street is named for him are incorrect",
    claimType: "legend-tradition",
    claimText:
      "A rumor that Filbert Street is named for a later owner of the mansion, Dr. Ludwig Spang Filbert, is explicitly stated by the source to be incorrect.",
    sourceRefutesThisClaim: true,
    epistemicMarkers: ["rumor-explicitly-denied"],
    extractionMethod: "direct-source-text",
  },
  {
    id: "hoopes-ownership-chain",
    placeKey: "1733-spring-garden-hoopes-mansion",
    address: "1733 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["baldwinparkphilly-hoopes-mansion"],
    supportingSpan:
      "sold his house...in 1879 to one Elizabeth Downing...purchased in 1900 by Ludwig Spang Filbert MD...sold the house to the Russian Brotherhood Organization (RBO) in 1922...sold to an entity called 1733 Spring Garden LLC",
    claimType: "use-history",
    claimText:
      "Sold 1879 to Elizabeth Downing; purchased 1900 by Dr. Ludwig Spang Filbert; sold 1922 to the Russian Brotherhood Organization; sold 2015 to 1733 Spring Garden LLC for $1.6 million.",
    extractionMethod: "direct-source-text",
  },
  {
    id: "hoopes-current-use",
    placeKey: "1733-spring-garden-hoopes-mansion",
    address: "1733 Spring Garden St",
    proposedIdentityType: "current-building-former-use",
    sourceIds: ["baldwinparkphilly-hoopes-mansion"],
    supportingSpan:
      "Our House Montessori...basement, first floor, and rear of the second floor...designed as apartments",
    claimType: "use-history",
    claimText:
      "Currently home to Our House Montessori (basement, first floor, rear second floor), with the remaining upper floors and carriage house used as apartments.",
    extractionMethod: "direct-source-text",
  },

  // --- 1901 Spring Garden St — fresh direct-source re-extraction ---
  {
    id: "stgeorge-construction-fresh",
    placeKey: "1901-spring-garden-fresh",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-1901-spring-garden-fresh"],
    supportingSpan:
      "In 1875 builder Edwin Randolph built a beautiful residence at 1901 Spring Garden Street on spec",
    claimType: "construction-date",
    claimText: "Built in 1875 by builder Edwin Randolph on speculation.",
    relatedEntities: ["Edwin Randolph"],
    dateRange: { start: "1875", precise: true },
    extractionMethod: "direct-source-text",
  },
  {
    id: "stgeorge-original-owner",
    placeKey: "1901-spring-garden-fresh",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-1901-spring-garden-fresh"],
    supportingSpan:
      "lived at 1901 Spring Garden with his wife Caroline and son Abram until Abraham's death in 1890",
    claimType: "biographical",
    claimText:
      "Original owner Abraham R. Cox lived there with his wife Caroline and son Abram until his death in 1890.",
    relatedEntities: ["Abraham R. Cox"],
    extractionMethod: "direct-source-text",
  },
  {
    id: "stgeorge-facade-1901",
    placeKey: "1901-spring-garden-fresh",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-1901-spring-garden-fresh"],
    supportingSpan:
      "Architect Carl Berger put on a marble façade for Penrose Fleisher (1844-1931) in 1901",
    claimType: "architect",
    claimText:
      "A marble façade was added in 1901 by architect Carl Berger for then-owner Penrose Fleisher.",
    relatedEntities: ["Carl Berger", "Penrose Fleisher"],
    dateRange: { start: "1901", precise: true },
    extractionMethod: "direct-source-text",
  },
  {
    id: "stgeorge-1911-sale",
    placeKey: "1901-spring-garden-fresh",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-1901-spring-garden-fresh"],
    supportingSpan:
      "Penrose Fleisher sold the home at 1901 Spring Garden Street to the firm of Mastbaum & Fleisher for a nominal fee in 1911",
    claimType: "event",
    claimText:
      "Fleisher sold the home to the firm of Mastbaum & Fleisher for a nominal fee in 1911.",
    dateRange: { start: "1911", precise: true },
    extractionMethod: "direct-source-text",
  },
  {
    id: "stgeorge-1911-sale-embellishment-unverified",
    placeKey: "1901-spring-garden-fresh",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["search-summary-ephemeral"],
    supportingSpan:
      "AI search summary: 'Jules Mastbaum, benefactor of the Rodin Museum, and Alfred W. Fleisher, real-estate tycoon and grandfather of Comcast CEO Brian Roberts'",
    claimType: "biographical",
    claimText:
      "The 1911 buying firm's partners were Jules Mastbaum (Rodin Museum benefactor) and Alfred W. Fleisher (grandfather of Comcast CEO Brian Roberts).",
    relatedEntities: ["Jules Mastbaum", "Alfred W. Fleisher"],
    // Deliberately modeled as unresolved: this biographical elaboration
    // appeared in a WebSearch AI summary but is NOT present in the direct
    // fetch of the admissible baldwinparkphilly.org page, which states only
    // the bare sale to "the firm of Mastbaum & Fleisher." It has not been
    // traced to an admissible source and must not be treated as evidence.
  },
  {
    id: "stgeorge-1922-purchase",
    placeKey: "1901-spring-garden-fresh",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-1901-spring-garden-fresh"],
    supportingSpan:
      "In 1922 the St. George Society bought 1901 Spring Garden Street from Morris Dannenbaum...The purchase price was $45,000",
    claimType: "event",
    claimText:
      "The St. George Society bought the building from Morris Dannenbaum in 1922 for $45,000.",
    dateRange: { start: "1922", precise: true },
    extractionMethod: "direct-source-text",
  },
  {
    id: "stgeorge-1949-sale-and-restaurant",
    placeKey: "1901-spring-garden-fresh",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-1901-spring-garden-fresh"],
    supportingSpan:
      "In 1949 the St. George Society sold 1901 Spring Garden Street...remodeled in 1950 for commercial use...to accommodate a restaurant",
    claimType: "use-history",
    claimText:
      "Sold in 1949 by the St. George Society; remodeled in 1950 for commercial/restaurant use.",
    extractionMethod: "direct-source-text",
  },
  {
    id: "stgeorge-1999-renovation",
    placeKey: "1901-spring-garden-fresh",
    address: "1901 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-1901-spring-garden-fresh"],
    supportingSpan: "Six apartments for the elderly, handicap accessible",
    claimType: "use-history",
    claimText:
      "Renovated in 1999 into six accessible apartments for the elderly.",
    dateRange: { start: "1999", precise: true },
    extractionMethod: "direct-source-text",
  },

  // --- 1818-1820 Spring Garden St — corrected/expanded current identity ---
  {
    id: "towers-former-site",
    placeKey: "1818-1820-spring-garden-towers",
    address: "1818-1820 Spring Garden St",
    proposedIdentityType: "former-site",
    sourceIds: ["baldwinparkphilly-spring-garden-towers"],
    supportingSpan:
      "demolished in 1937 for the tower site...previously occupied by structures including a Reyburn mansion (razed 1937) and parts of the Philadelphia College of Osteopathic Medicine Hospital",
    claimType: "demolition",
    claimText:
      "A former Reyburn mansion and a Philadelphia College of Osteopathic Medicine (PCOM) hospital building on this site were demolished in 1937.",
    dateRange: { start: "1937", precise: true },
    // The source's own PCOM-relocation claim (1928, see towers-pcom-relocation)
    // and this 1937 demolition date leave the exact end date of PCOM's own
    // occupancy here unresolved -- preserved rather than resolved.
    epistemicMarkers: ["author-uncertainty"],
    extractionMethod: "direct-source-text",
  },
  {
    id: "towers-pcom-relocation",
    placeKey: "1818-1820-spring-garden-towers",
    address: "1818-1820 Spring Garden St",
    proposedIdentityType: "former-site",
    sourceIds: ["baldwinparkphilly-spring-garden-towers"],
    supportingSpan:
      "moved to a new building at 48th and Spruce (still there) in 1928",
    claimType: "event",
    claimText:
      "PCOM relocated to a new building at 48th & Spruce Streets in 1928.",
    dateRange: { start: "1928", precise: true },
    extractionMethod: "direct-source-text",
  },
  {
    id: "towers-construction",
    placeKey: "1818-1820-spring-garden-towers",
    address: "1818-1820 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-spring-garden-towers"],
    supportingSpan:
      "In 1978 Lutheran Associates completed a tower called Lutheran Elderly Housing (now called Spring Garden Towers, plural)",
    claimType: "construction-date",
    claimText:
      "In 1978 Lutheran Associates completed a 17-story senior-housing tower on the site, originally Lutheran Elderly Housing, now Spring Garden Towers.",
    dateRange: { start: "1978", precise: true },
    extractionMethod: "direct-source-text",
  },
  {
    id: "towers-unit-details",
    placeKey: "1818-1820-spring-garden-towers",
    address: "1818-1820 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["baldwinparkphilly-spring-garden-towers"],
    supportingSpan:
      "208 units, all one bedroom, one bath with an average area of 300 square feet",
    claimType: "statistic",
    claimText:
      "208 one-bedroom, one-bath subsidized senior-housing units, averaging about 300 square feet each.",
    extractionMethod: "direct-source-text",
  },

  // --- Thin/generic metadata found via generic corridor PAB search ---
  {
    id: "2035-register-status",
    placeKey: "2035-spring-garden",
    address: "2035 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["philadelphiabuildings-org"],
    supportingSpan:
      "Philadelphia Register of Historic Places -- 05/01/1975; 10/11/2000",
    claimType: "register-status",
    claimText:
      "Listed on the Philadelphia Register of Historic Places (05/01/1975; 10/11/2000). No architect, construction date, or use-history detail available from this source.",
    extractionMethod: "direct-source-text",
  },
  {
    id: "2229-2237-register-status",
    placeKey: "2229-2237-spring-garden",
    address: "2229-2237 Spring Garden St",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["philadelphiabuildings-org"],
    supportingSpan: "Philadelphia Register of Historic Places -- 10/11/2000",
    claimType: "register-status",
    claimText:
      "Listed on the Philadelphia Register of Historic Places (10/11/2000). No architect, construction date, or use-history detail available from this source.",
    extractionMethod: "direct-source-text",
  },
];
