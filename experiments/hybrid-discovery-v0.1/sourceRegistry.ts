/**
 * Source registry for the Streetlit Hybrid Discovery v0.1 harness.
 * Offline/non-production — see README.md.
 *
 * Capability profiles are hand-authored from what was actually observed
 * about each source during manual research against Spring Garden Street —
 * not invented, not a single global trust score.
 */
import type { Source } from "./types";

export const SOURCES: Record<string, Source> = {
  "baldwinparkphilly-org": {
    id: "baldwinparkphilly-org",
    title: "Matthias Baldwin Park — neighborhood-history site",
    url: "https://www.baldwinparkphilly.org",
    sourceClass: "local-public-history-narrative",
    capabilities: [
      { claimType: "use-history", strength: "high" },
      { claimType: "biographical", strength: "high" },
      { claimType: "event", strength: "high" },
      { claimType: "institutional-founding", strength: "high" },
      { claimType: "relationship", strength: "medium" },
      {
        claimType: "construction-date",
        strength: "low",
        notes: "sometimes states a date, not always independently checkable",
      },
      { claimType: "architect", strength: "low" },
      { claimType: "register-status", strength: "none" },
      {
        claimType: "superlative",
        strength: "low",
        notes: "frequently hedges its own superlatives",
      },
      {
        claimType: "legend-tradition",
        strength: "medium",
        notes: "often the one that also states/corrects the rumor",
      },
      { claimType: "statistic", strength: "low" },
    ],
  },
  "philadelphiabuildings-org": {
    id: "philadelphiabuildings-org",
    title: "Philadelphia Architects and Buildings (Athenaeum of Philadelphia)",
    url: "https://www.philadelphiabuildings.org",
    sourceClass: "built-environment-cultural-database",
    capabilities: [
      { claimType: "register-status", strength: "high" },
      {
        claimType: "construction-date",
        strength: "medium",
        notes:
          "populated for some records, blank for many individual in-corridor pages",
      },
      { claimType: "architect", strength: "medium" },
      { claimType: "identity", strength: "high" },
      { claimType: "use-history", strength: "none" },
      { claimType: "biographical", strength: "none" },
      { claimType: "event", strength: "none" },
    ],
  },
  "phc-register": {
    id: "phc-register",
    title:
      "Philadelphia Historical Commission / Philadelphia Register of Historic Places",
    sourceClass: "government-preservation-record",
    capabilities: [
      { claimType: "register-status", strength: "high" },
      { claimType: "construction-date", strength: "high" },
      { claimType: "identity", strength: "high" },
      { claimType: "architect", strength: "medium" },
      { claimType: "use-history", strength: "none" },
    ],
  },
  "phillyhistory-blog": {
    id: "phillyhistory-blog",
    title:
      "PhillyHistory.org blog (City of Philadelphia Department of Records)",
    url: "https://blog.phillyhistory.org/index.php/2019/03/an-architectural-census-philadelphias-25-carnegie-branch-libraries/",
    sourceClass: "institutional-history-archive",
    publicationDate: "2019-03-01",
    capabilities: [
      { claimType: "use-history", strength: "high" },
      { claimType: "construction-date", strength: "high" },
      { claimType: "architect", strength: "high" },
      { claimType: "demolition", strength: "medium" },
      { claimType: "statistic", strength: "medium" },
      {
        claimType: "relationship",
        strength: "low",
        notes:
          "names individuals/firms in passing within an architectural-census post; not independently verified",
      },
    ],
  },
  "spring-garden-1901-history-article": {
    id: "spring-garden-1901-history-article",
    title:
      "Underlying local-history article on 1901 Spring Garden Street (St. George Society Building)",
    sourceClass: "local-public-history-narrative",
    capabilities: [
      { claimType: "construction-date", strength: "high" },
      { claimType: "architect", strength: "high" },
      { claimType: "identity", strength: "medium" },
      { claimType: "use-history", strength: "medium" },
    ],
    // This is the real underlying article a WebSearch AI summary later
    // conflated with a different, nearby building's 1837/Newkirk/Walter
    // facts. Direct extraction of this page's own text supports 1875 /
    // architect Edwin Randolph for 1901 Spring Garden itself.
  },
  "stetson-house-search-excerpt": {
    id: "stetson-house-search-excerpt",
    title:
      "Search-result excerpt referencing 1717 Spring Garden Street (Stetson Hat family)",
    sourceClass: "local-public-history-narrative",
    capabilities: [
      {
        claimType: "identity",
        strength: "medium",
        notes:
          "retrieved via a search-result excerpt rather than a fully fetched page; treated as lower-confidence than a directly fetched narrative source",
      },
    ],
  },
  "pcom-institutional-history": {
    id: "pcom-institutional-history",
    title: "History of Philadelphia College of Osteopathic Medicine",
    url: "https://www.pcom.edu/campuses/philadelphia-campus/history.html",
    sourceClass: "institutional-history-archive",
    capabilities: [
      { claimType: "identity", strength: "high" },
      { claimType: "use-history", strength: "high" },
      { claimType: "institutional-founding", strength: "high" },
      { claimType: "biographical", strength: "medium" },
      { claimType: "demolition", strength: "medium" },
      { claimType: "construction-date", strength: "low" },
    ],
  },
  "catholicphilly-com": {
    id: "catholicphilly-com",
    title:
      "CatholicPhilly — 100 Years and Still Going Strong at La Milagrosa Chapel",
    url: "https://catholicphilly.com/2011/05/news/100-years-and-still-going-strong-at-la-milagrosa-chapel/",
    sourceClass: "local-public-history-narrative",
    publicationDate: "2011-05-01",
    capabilities: [
      { claimType: "institutional-founding", strength: "high" },
      { claimType: "biographical", strength: "high" },
      { claimType: "event", strength: "high" },
      { claimType: "use-history", strength: "medium" },
    ],
  },
  "inquirer-la-milagrosa-2013": {
    id: "inquirer-la-milagrosa-2013",
    title:
      "Philadelphia Inquirer — La Milagrosa chapel to close in June (2013)",
    url: "https://www.inquirer.com/philly/news/20130420_La_Milagrosa_chapel_to_close_in_June.html",
    sourceClass: "local-public-history-narrative",
    publicationDate: "2013-04-20",
    capabilities: [
      { claimType: "event", strength: "high" },
      { claimType: "use-history", strength: "medium" },
    ],
  },
  "inquirer-la-milagrosa-2023": {
    id: "inquirer-la-milagrosa-2023",
    title: "Philadelphia Inquirer — La Milagrosa follow-up (2023)",
    url: "https://www.inquirer.com/news/la-milagrosa-latino-community-using-parish-trust-oldest-spanish-speaking-church-scholarships-20230428.html",
    sourceClass: "local-public-history-narrative",
    publicationDate: "2023-04-28",
    capabilities: [
      {
        claimType: "use-history",
        strength: "medium",
        notes:
          "conflicts with a separate secondary account on apartments-vs-condos/unit count",
      },
    ],
  },
  "condoshop-listing-1717": {
    id: "condoshop-listing-1717",
    title: "TheCondoShops.com listing, 1717 Spring Garden Street",
    url: "https://www.thecondoshops.com/listing/1717-spring-garden-street/",
    sourceClass: "local-public-history-narrative",
    capabilities: [
      {
        claimType: "identity",
        strength: "low",
        notes:
          "confirms 'originally built for the famous Stetson Hat family' — real-estate copy, not a historical source, but independently corroborates a specific fact",
      },
    ],
  },
  "loopnet-listing-1701": {
    id: "loopnet-listing-1701",
    title: "LoopNet commercial listing, 1701-1707 Spring Garden Street",
    url: "https://www.loopnet.com/Listing/1701-1707-Spring-Garden-St-Philadelphia-PA/32308415/",
    sourceClass: "inadmissible-generic-web",
    capabilities: [
      {
        claimType: "use-history",
        strength: "none",
        notes:
          "generic commercial real-estate listing; not an approved source class regardless of what it asserts",
      },
    ],
  },
  "search-summary-ephemeral": {
    id: "search-summary-ephemeral",
    title: "AI-generated web-search summary (not a source; discovery aid only)",
    sourceClass: "inadmissible-generic-web",
    isSynthesizedSearchOutput: true,
    capabilities: [],
  },
  "baldwinparkphilly-1822-casket-claim": {
    id: "baldwinparkphilly-1822-casket-claim",
    title:
      "Matthias Baldwin Park — F.H. Hill Co. casket-showroom claim (1822 Spring Garden)",
    url: "https://www.baldwinparkphilly.org/pennsylvania-state-college-of-optom",
    sourceClass: "local-public-history-narrative",
    capabilities: [{ claimType: "use-history", strength: "low" }],
    // This is the known 1822 Spring Garden failure shape: the claim repeats
    // across two pages of the SAME site (same underlying provenance chain),
    // and when the underlying citation was actually traced (in the real
    // Streetlit curated-registry research), it resolved to an unrelated
    // Chestnut Street building — i.e. the citation does not support the
    // claim at all.
    underlyingProvenanceOf: [],
    provenanceVerified: false,
    provenanceVerificationNote:
      "Underlying citation for this specific claim was traced and found to resolve to an unrelated Chestnut Street building, not 1822 Spring Garden Street. Do not treat as evidence even though it appears on two baldwinparkphilly.org pages.",
  },
  // --- Added for the Stage 1 fresh-extraction pass (22nd->17th corridor) ---
  "phillyhistory-blog-girls-high": {
    id: "phillyhistory-blog-girls-high",
    title:
      "PhillyHistory Blog — Public Education in Philadelphia: Philadelphia High School for Girls",
    url: "https://blog.phillyhistory.org/index.php/2011/02/public-education-in-philadelphia-philadelphia-high-school-for-girls/",
    sourceClass: "institutional-history-archive",
    publicationDate: "2011-02-01",
    capabilities: [
      { claimType: "institutional-founding", strength: "high" },
      { claimType: "event", strength: "high" },
      { claimType: "use-history", strength: "medium" },
      { claimType: "statistic", strength: "medium" },
    ],
  },
  "wikipedia-masterman-nrhp": {
    id: "wikipedia-masterman-nrhp",
    title: "Wikipedia — Julia R. Masterman School",
    url: "https://en.wikipedia.org/wiki/Julia_R._Masterman_School",
    sourceClass: "wikipedia-wikidata",
    capabilities: [
      { claimType: "register-status", strength: "high" },
      { claimType: "construction-date", strength: "high" },
      { claimType: "architect", strength: "high" },
      { claimType: "identity", strength: "high" },
    ],
  },
  "baldwinparkphilly-hoopes-mansion": {
    id: "baldwinparkphilly-hoopes-mansion",
    title: "Matthias Baldwin Park — The Hoopes Mansion",
    url: "https://www.baldwinparkphilly.org/the-hoopes-mansion",
    sourceClass: "local-public-history-narrative",
    capabilities: [
      { claimType: "construction-date", strength: "medium" },
      { claimType: "biographical", strength: "high" },
      { claimType: "use-history", strength: "high" },
      { claimType: "event", strength: "medium" },
      {
        claimType: "legend-tradition",
        strength: "high",
        notes: "explicitly states the Filbert Street naming rumor is incorrect",
      },
      { claimType: "relationship", strength: "medium" },
    ],
  },
  "baldwinparkphilly-1901-spring-garden-fresh": {
    id: "baldwinparkphilly-1901-spring-garden-fresh",
    title: "Matthias Baldwin Park — 1901 Spring Garden Street",
    url: "https://www.baldwinparkphilly.org/1901-spring-garden-street",
    sourceClass: "local-public-history-narrative",
    capabilities: [
      { claimType: "construction-date", strength: "high" },
      { claimType: "architect", strength: "high" },
      { claimType: "biographical", strength: "high" },
      { claimType: "event", strength: "high" },
      { claimType: "use-history", strength: "high" },
    ],
    // Fetched directly for the Stage 1 fresh-extraction pass. Confirms the
    // real 1875/Edwin Randolph facts and contains NO mention of an 1837
    // construction date, Matthew Newkirk, or Thomas U. Walter — corroborating
    // the earlier finding that those details were a search-summary conflation.
  },
  "baldwinparkphilly-spring-garden-towers": {
    id: "baldwinparkphilly-spring-garden-towers",
    title: "Matthias Baldwin Park — Spring Garden Towers / PCOM",
    url: "https://www.baldwinparkphilly.org/spring-garden-towers",
    sourceClass: "local-public-history-narrative",
    capabilities: [
      { claimType: "construction-date", strength: "high" },
      { claimType: "use-history", strength: "high" },
      { claimType: "demolition", strength: "high" },
      { claimType: "identity", strength: "medium" },
      { claimType: "statistic", strength: "medium" },
      { claimType: "event", strength: "medium" },
    ],
  },
  // --- Added for the PAB structured-source enumeration experiment ---
  // Retrieved via PAB's own guest-accessible street-only address search
  // (search_location.cfm -> search_address_results.cfm), not generic web
  // search. Each source below is one individual PAB project/building record.
  "pab-osteopathic-hospital-1822": {
    id: "pab-osteopathic-hospital-1822",
    title:
      "Philadelphia Architects and Buildings — Osteopathic Hospital of Philadelphia (1822 Spring Garden St)",
    url: "https://www.philadelphiabuildings.org/pab/app/pj_display.cfm/143269",
    sourceClass: "built-environment-cultural-database",
    capabilities: [
      { claimType: "identity", strength: "high" },
      { claimType: "use-history", strength: "medium" },
      {
        claimType: "architect",
        strength: "high",
        notes:
          "names a specific firm and a dated archival drawing set (Hutton-Savery, Scheetz & Savery Collection)",
      },
      {
        claimType: "event",
        strength: "medium",
        notes:
          "the dated record is an architectural-drawing episode (plans/elevations/section), not confirmed as the building's original construction",
      },
    ],
  },
  "pab-fifth-baptist-church-1801": {
    id: "pab-fifth-baptist-church-1801",
    title:
      "Philadelphia Architects and Buildings — Fifth Baptist Church (1801-1803 Spring Garden St)",
    url: "https://www.philadelphiabuildings.org/pab/app/pj_display.cfm/9108",
    sourceClass: "built-environment-cultural-database",
    capabilities: [
      {
        claimType: "identity",
        strength: "high",
        notes:
          "cites a real 1875 published guidebook (Westcott, The Official Guide Book to Philadelphia)",
      },
      { claimType: "register-status", strength: "high" },
      { claimType: "use-history", strength: "medium" },
    ],
  },
  "pab-graham-residence-1818": {
    id: "pab-graham-residence-1818",
    title:
      "Philadelphia Architects and Buildings — Graham Residence (1818 Spring Garden St)",
    url: "https://www.philadelphiabuildings.org/pab/app/pj_display.cfm/4953",
    sourceClass: "built-environment-cultural-database",
    capabilities: [
      {
        claimType: "identity",
        strength: "high",
        notes:
          "cites a real 1901 published source (King, Philadelphia and Notable Philadelphians, p.73); flags an addressing question against an existing Streetlit claim for the adjoining 1818-1820 range, see claim epistemic marker",
      },
      { claimType: "biographical", strength: "medium" },
    ],
  },
  // --- Disclosed synthetic-illustrative sources ---
  // Not real Spring Garden research. Used only to exercise the
  // temporal-consistency and self-corrected-primary-source check paths,
  // which no real claim in this corridor's dataset happens to trigger.
  // See data/springGardenClaims.ts and the final report for disclosure.
  "synthetic-illustrative-source-a": {
    id: "synthetic-illustrative-source-a",
    title:
      "SYNTHETIC — illustrative source A (temporal-consistency check demo, not real research)",
    sourceClass: "institutional-history-archive",
    capabilities: [{ claimType: "construction-date", strength: "high" }],
  },
  "synthetic-illustrative-source-b": {
    id: "synthetic-illustrative-source-b",
    title:
      "SYNTHETIC — illustrative source B (temporal-consistency check demo, not real research)",
    sourceClass: "government-preservation-record",
    capabilities: [{ claimType: "construction-date", strength: "high" }],
  },
  "synthetic-illustrative-source-c": {
    id: "synthetic-illustrative-source-c",
    title:
      "SYNTHETIC — illustrative source C (self-corrected-primary-source check demo, not real research)",
    sourceClass: "local-public-history-narrative",
    capabilities: [{ claimType: "use-history", strength: "medium" }],
  },
};
