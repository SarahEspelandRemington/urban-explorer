/**
 * Curated local-history evidence registry — Pilot A.
 *
 * A small, manually curated, subjectId-keyed registry of human-vetted
 * local-history material that did not come through the Wikipedia/A3
 * evidence path. Pure, synchronous, zero external calls — same pattern as
 * historicalForceMap.ts, but keyed on the candidate's own identity (an OSM
 * element id, e.g. "way/250863827", or a Streetlit-owned streetlitId, e.g.
 * "streetlit/557-8th-ave" — see streetlitPlaces.ts) rather than a
 * Wikidata/Wikipedia identifier, and read directly by the osm-anchor
 * discover route (unlike historicalForceMap.ts, which is not wired into
 * any prompt/ranking/filtering/narration logic today). subjectId is opaque
 * to this module — it does not parse or validate either identity's format.
 *
 * `source` (identity/provenance of the material) and `evidence` (the
 * specific claim, its scope, and its trust/verification signals) are kept
 * as separate nested objects deliberately — see CuratedEntry below.
 *
 * `curatedTrust` and `verificationConfidence` are independent signals and
 * must not be conflated:
 *   - `curatedTrust` reflects Streetlit's own editorial confidence in the
 *     material as a discovery-worthy story (was this vetted and selected
 *     through Streetlit's editorial process?).
 *   - `verificationConfidence` reflects evidentiary/citation strength (how
 *     strongly is this backed by an externally checkable source?).
 * A story can be editorially trusted while still lacking a linked external
 * citation, and vice versa — that is exactly the distinction these two
 * fields exist to preserve. Neither field derives from, overrides, or is
 * written back to OSM-derived `trustLevel` (see osmTrustLevel.ts, which
 * this module does not import or modify).
 *
 * `explicitDiscoveryTier` (optional) is a separate, deliberately narrow
 * mechanism: an editorial call on the STORY's quality tier (Streetlit
 * Discovery Acceptance Model v1, see discoveryTier.ts), set manually per
 * entry, independent of `curatedTrust`/`verificationConfidence`. It exists
 * because `classifyDiscoveryTier()` scores the LLM's freshly regenerated
 * narration prose for a candidate on every non-cached request — for a
 * curated entry the underlying evidence is fixed, but Walk Mode's snap-grid
 * cache key forces frequent re-generation, so the same approved story could
 * otherwise flip between tiers (or unclassified) purely from incidental
 * wording differences across requests. Set this field only when the
 * curated story's tier is genuinely clear-cut; leave it unset for anything
 * ambiguous — an unset entry falls through to the ordinary classifier
 * unchanged. See applyDiscoveryTier() in discoveryTier.ts for how this is
 * consumed; it never applies over the exact placeholder-fallback shape.
 */

import type { DiscoveryTier } from "./discoveryTier";

export interface CuratedSource {
  /** Title/identity of the source material. */
  title: string;
  /** URL or other reference, when one exists. Omit if none is linked yet. */
  url?: string;
  /** What kind of source this is (e.g. "internal editorial reference"). */
  sourceType: string;
  /** Usage/rights note — what this material may currently be used for. */
  usageNote: string;
  /** Publication/date information, when available. */
  publicationDate?: string;
}

export type VerificationStatus = "approved" | "pending" | "rejected";
export type TrustSignal = "high" | "medium" | "low";

export interface CuratedEvidence {
  /** The candidate's own identity — an OSM element id (e.g.
   *  "way/250863827") or a Streetlit-owned streetlitId (e.g.
   *  "streetlit/557-8th-ave"). Opaque; not parsed or validated here. */
  subjectId: string;
  /** Human-selected evidence text — not LLM-selected, not A3 output. */
  text: string;
  /** What factual claim(s) this evidence governs, in the copy-gen prompt. */
  claimScope: string;
  verificationStatus: VerificationStatus;
  verificationConfidence: TrustSignal;
  /** Independent of OSM trustLevel — see module doc comment above. */
  curatedTrust: TrustSignal;
  /** Date of the last editorial verification pass over this entry. */
  lastVerifiedDate: string;
  /** Editorial discovery-tier override — see module doc comment above.
   *  Optional; omit when the entry's tier is genuinely ambiguous. */
  explicitDiscoveryTier?: DiscoveryTier;
}

export interface CuratedEntry {
  source: CuratedSource;
  evidence: CuratedEvidence;
}

/**
 * Per-`curatedTrust`-tier claim-strength guidance for copy generation.
 * Analogous in pattern to OSM_COPY_RULES (osmTrustLevel.ts), but this
 * table governs a curated entry's own claim, inside its declared
 * `curatedClaimScope` only — it does not touch OSM `trustLevel` or
 * OSM_COPY_RULES, and it does not grant any license to make claims
 * outside curatedClaimScope.
 */
export const CURATED_COPY_RULES: Record<TrustSignal, string> = {
  high: "curatedTrust: high — state the claim directly and plainly within curatedClaimScope. No hedging language is needed for this specific claim.",
  medium:
    'curatedTrust: medium — state the claim within curatedClaimScope, but use light attribution/hedging language (e.g. "according to," "remembered as") rather than flat assertion.',
  low: 'curatedTrust: low — only make a soft, clearly-hedged reference to the claim within curatedClaimScope (e.g. "local accounts describe...") — do not state it as settled fact.',
};

/** subjectId (an OSM "type/id" ref or a Streetlit streetlitId) -> curated entry. */
export const CURATED_LOCAL_HISTORY: Record<string, CuratedEntry> = {
  "way/250863827": {
    source: {
      title: "Green Room Philadelphia — About",
      url: "https://www.greenroomphiladelphia.com/about",
      sourceType: "first-party institutional/business history source",
      usageNote:
        "Accepted for the Green Room's own institutional history (the Pop Plumer / Cadillac Delicatessen material) — not blanket authority for broader neighborhood claims. See claimScope below for the exact boundary of what this source supports.",
    },
    evidence: {
      subjectId: "way/250863827",
      text: 'During the Depression, the corner store at 1940 Green Street was run by a local grocer remembered as "Pop" Plumer — the shop later known as the Cadillac Delicatessen. Plumer fed neighbors who couldn\'t pay and extended grocery credit through hard times, and the corner became known in the neighborhood as a place of community support, not just a place of business.',
      claimScope:
        "The Depression-era community-support role of the grocer known as Pop Plumer at this corner (1940 Green Street) — feeding neighbors and extending credit — and the site's identity as the later Cadillac Delicatessen.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "high",
      lastVerifiedDate: "2026-08-22",
      explicitDiscoveryTier: 1,
    },
  },
  "streetlit/475-10th-ave-hill-publishing": {
    source: {
      title:
        "Streetscapes / The Old McGraw-Hill Building; A Color-Filled Restoration of a Colorful Skyscraper",
      url: "https://www.nytimes.com/1999/03/14/realestate/streetscapes-old-mcgraw-hill-building-color-filled-restoration-colorful.html",
      sourceType:
        "newspaper architecture/history column (Christopher Gray, The New York Times)",
      usageNote:
        "Accepted for the 1916 Hill Publishing Building's identity and its role as McGraw-Hill Publishing Company's home after the 1917 merger — not for facts about the later 330 West 42nd Street McGraw-Hill Building. See claimScope below for the exact boundary of what this source supports.",
      publicationDate: "1999-03-14",
    },
    evidence: {
      subjectId: "streetlit/475-10th-ave-hill-publishing",
      text: "James McGraw began publishing in 1885, and James A. Hill began publishing in 1901. In 1917 they joined to form the McGraw-Hill Publishing Company, whose offices and presses occupied the Hill Publishing Building at 475 10th Avenue at 36th Street — a spare, white terra-cotta building completed in 1916. By 1929 McGraw-Hill published more than 30 trade journals, including Coal Age, Radio Retailing, Engineering News-Record, and Electric Railway Journal. As the company outgrew the building, James McGraw wanted to move nearer the concentration of engineers and architects in Midtown; the 1916 Zoning Resolution had restricted new factories — explicitly including printing plants — to an outer manufacturing ring beginning at Eighth Avenue. McGraw-Hill eventually built its new headquarters at 330 West 42nd Street, which combined offices with substantial printing operations.",
      claimScope:
        "The Hill Publishing Building at 475 10th Avenue as the 1916 building occupied by the newly formed McGraw-Hill Publishing Company's offices and presses after the 1917 merger; McGraw-Hill's growth as a trade-journal publisher; and the source-supported fact that publishing at this time involved physical printing operations significant enough to be treated as factory activity under New York zoning. Do not transfer architectural details, dates, printing-floor arrangements, Raymond Hood material, or other facts about the later 330 West 42nd Street McGraw-Hill Building onto 475 10th Avenue.",
      verificationStatus: "approved",
      verificationConfidence: "high",
      curatedTrust: "high",
      lastVerifiedDate: "2026-08-23",
    },
  },
  "streetlit/557-8th-ave": {
    source: {
      title: "Emery Roth's Art Nouveau 557 Eighth Avenue",
      sourceType: "local-history blog (Tom Miller, Daytonian in Manhattan)",
      usageNote:
        "Accepted for the 1903 building's design, Art Nouveau architectural character, and documented historic uses — not for unverified current-tenant claims or broader Emery Roth biography. See claimScope below for the exact boundary of what this source supports.",
      publicationDate: "2011-07-25",
    },
    evidence: {
      subjectId: "streetlit/557-8th-ave",
      text: "557 Eighth Avenue was completed in 1903, after plans were filed for a three-story dwelling-and-office building designed by Stein, Cohen & Roth, with Emery Roth responsible for its distinctive treatment. The building's Art Nouveau character includes cream-colored brick, carved brownstone, pressed-metal ornament, undulating window surrounds, carved female heads beneath shell forms, and an ambitious cornice. Its upper floors operated as a residential hotel popular with actors, and it later appeared as the fictional Actors Hotel. The ground floor has held a succession of documented uses over time, including a jewelry store, a saloon, and a tobacco shop. Much of the original upper-story ornament survives today despite major alteration at street level.",
      claimScope:
        "1903 construction and design by Stein, Cohen & Roth with Emery Roth's distinctive treatment; the building's Art Nouveau architectural character and surviving visible upper-story details; its residential-hotel and theatrical associations, including its later use as the fictional Actors Hotel; documented historic ground-floor uses (jewelry store, saloon, tobacco shop); and the contrast between altered ground-floor storefronts and surviving ornament. Do not add unverified current-tenant claims or broader Emery Roth biography.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "high",
      lastVerifiedDate: "2026-08-23",
      explicitDiscoveryTier: 2,
    },
  },
  "streetlit/2301-fairmount-ave-rothacker-orth": {
    source: {
      title:
        "Rothacker-Orth Brewery and Lager Beer Saloon — Philadelphia Register of Historic Places Nomination",
      url: "https://www.phila.gov/media/20260518102954/2301-Fairmount-Ave-nomination-amended.pdf",
      sourceType:
        "formal historic-register nomination (Philadelphia Historical Commission)",
      usageNote:
        "Accepted as the controlling source for the building's construction date and the Rothacker/Orth brewery-saloon chronology. Direct PDF text extraction was not reliable in this session; nomination content and quoted language were cross-checked via Hidden City Philadelphia's contemporaneous reporting on the nomination (https://hiddencityphila.org/2022/09/south-philly-church-protected-while-saloon-hangs-in-the-balance/), which quotes the nomination directly and confirms no 1843 date appears anywhere in it. Not accepted for later journalistic shorthand describing the property as a bar since 1843 — see claimScope below.",
      publicationDate: "2021-10-12",
    },
    evidence: {
      subjectId: "streetlit/2301-fairmount-ave-rothacker-orth",
      text: "The building at 2301 Fairmount Avenue was constructed in 1845. Henry Rothacker later acquired the property and, in 1859, opened a small lager beer brewery and saloon on its ground floor, combining that business with his own residence above — a common arrangement for the era's small-scale German brewers. The site, later associated with Rothacker's cousin Francis Orth, represents an early stage in the development of Philadelphia's lager-brewing industry, before the large purpose-built breweries that would later define neighborhoods like Brewerytown came to dominate the trade.",
      claimScope:
        "The 1845 construction date of the building; Henry Rothacker's 1859 acquisition and operation of a small lager beer brewery and saloon on the ground floor combined with his residence above; and the property's documented role as an early, small-scale example of Philadelphia's lager-brewing industry. Do not state or imply that the property operated as a bar or saloon continuously since 1843, or any date earlier than the 1859 Rothacker brewery/saloon opening — that claim is not supported by the controlling nomination source and must not appear in generated copy.",
      verificationStatus: "approved",
      verificationConfidence: "high",
      curatedTrust: "high",
      lastVerifiedDate: "2026-08-24",
      explicitDiscoveryTier: 1,
    },
  },
  "streetlit/2133-spring-garden-polonia": {
    source: {
      title: "Polonia Federal Savings Bank",
      url: "https://www.philadelphiabuildings.org/pab/app/pj_display.cfm/75737",
      sourceType:
        "public historic-register database entry (Philadelphia Architects and Buildings), corroborated by the Philadelphia Historical Commission's official Register of Historic Places (2133-35 Spring Garden St / Polonia Federal Savings Bank / 1875)",
      usageNote:
        "The Philadelphia Register of Historic Places listing controls the 1875 construction date; a conflicting real-estate/tax-assessment listing for this address was not treated as authoritative. Institutional founding and Polish-American institutional role corroborated via McCarrick v. Polonia Federal S. & L. Ass'n, 502 F. Supp. 654 (E.D. Pa. 1980) and public branch-directory records. Not accepted for any labor-meeting or alley-entry claim — see claimScope below.",
      publicationDate: "2000-10-11",
    },
    evidence: {
      subjectId: "streetlit/2133-spring-garden-polonia",
      text: "The building at 2133–35 Spring Garden Street dates to approximately 1875. In 1923, Polish immigrants and Polish-American community members in Philadelphia founded Polonia Federal Savings and Loan Association, part of a network of Polish-American financial institutions — collectively part of what was known as Polonia, the broader Polish diaspora and its community institutions — that gave immigrant depositors and homebuyers an alternative to mainstream banks that often overlooked them. This Spring Garden Street branch remained part of that Polish-American institutional network for decades, continuing under Polonia's name and, later, successor institutions, into the modern era.",
      claimScope:
        "The building's approximate 1875 construction date; the 1923 founding of Polonia Federal Savings and Loan Association as a Polish-American financial institution; Polonia's role as part of the broader Polish-American community/institutional network in Philadelphia; and this branch's continuation as part of that institutional lineage into later decades. Do not include any claim about a labor-meeting history or an alley-entry story at this address — that material is unverified and is explicitly excluded from this claim scope.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "high",
      lastVerifiedDate: "2026-08-24",
      explicitDiscoveryTier: 1,
    },
  },
  "streetlit/2101-mount-vernon-st": {
    source: {
      title: "Matthias Baldwin Park — Neighborhood History",
      url: "https://www.baldwinparkphilly.org/history",
      sourceType: "local neighborhood-history organization site",
      usageNote:
        'Accepted for the 1858 Washington Street to Mount Vernon Street renaming and the identification of the surviving carved "Washington St." block at the northwest corner of 21st and Mount Vernon Streets (2101 Mt. Vernon). Do not assert a specific ordinance or act as the renaming\'s legal mechanism — see claimScope below.',
    },
    evidence: {
      subjectId: "streetlit/2101-mount-vernon-st",
      text: "The building at 2101 Mount Vernon Street still carries a carved stone sign reading \"Washington St.\" near its corner — a remnant of the street's earlier name. Mount Vernon Street was renamed as part of Philadelphia's 19th-century street-naming consolidation, which eliminated duplicate street names that had multiplied as the city absorbed surrounding districts and townships. The surviving carving preserves a trace of that earlier identity, visible today even though the street itself has been called Mount Vernon for well over a century.",
      claimScope:
        "The physical presence of a carved \"Washington St.\" sign on the building at 2101 Mount Vernon Street, and the fact that Mount Vernon Street formerly carried the Washington Street name prior to Philadelphia's 19th-century street-renaming consolidation. Do not assert a specific ordinance or act as the renaming's legal mechanism as settled fact — keep language general and hedged around the renaming's exact cause.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-08-24",
      explicitDiscoveryTier: 2,
    },
  },
  "way/338306649": {
    source: {
      title:
        "The Double Spire On The Church Of The Assumption? Why, Franklin, Of Course",
      url: "https://hiddencityphila.org/2012/12/the-double-spire-on-the-church-of-the-assumption-why-franklin-of-course/",
      sourceType:
        "local-history journalism (Hidden City Philadelphia), citing historian J. A. Leo Lemay and an 1896 primary account (Andrew Jackson Reilly)",
      usageNote:
        "Accepted for the church's architectural facts and for the Franklin kite-experiment local tradition, explicitly including the tradition's own acknowledged uncertainty about the exact spot — not for a claim that the location is historically confirmed. See claimScope below.",
      publicationDate: "2012-12-01",
    },
    evidence: {
      subjectId: "way/338306649",
      text: "The Church of the Assumption, at 1123 Spring Garden Street, was designed by architect Charles Patrick Keely with an unusual double-spire facade. According to a widely repeated local account first recorded in 1896, the church stands near the spot where Benjamin Franklin flew his kite in his famous 1752 electricity experiment — historian J. A. Leo Lemay's research places Franklin's pasture, purchased from brickmaker William Coats, in this same Northern Liberties area near Ridge Avenue and Buttonwood Street. The 1896 account itself acknowledged that \"no man can say positively the actual spot,\" and local tradition holds that the church's twin spires were designed in part to honor that uncertainty — marking, as one telling put it, that the experiment happened \"somewhere between these points.\" The church was also the site of Bishop John Neumann's consecration and Katharine Drexel's baptism in 1858; both were later canonized as saints.",
      claimScope:
        'The church\'s location at 1123 Spring Garden Street, its double-spire design by Charles Patrick Keely, and the locally documented — but explicitly not historically settled — tradition connecting the site to the general area of Benjamin Franklin\'s 1752 kite experiment, including the 1896 account\'s own acknowledgment of uncertainty about the exact spot. Also covers the church\'s consecration by Bishop John Neumann and Katharine Drexel\'s baptism there in 1858. Do not state or imply that the exact kite-experiment location is historically confirmed or settled — the source material explicitly does not establish this, and generated copy must preserve that uncertainty (e.g., "according to a local account," "local tradition holds," not "this is where Franklin flew his kite").',
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-08-24",
      explicitDiscoveryTier: 1,
    },
  },
  "streetlit/1700-spring-garden-carnegie-library": {
    source: {
      title:
        "An Architectural Census: Philadelphia's 25 Carnegie Branch Libraries",
      url: "https://blog.phillyhistory.org/index.php/2019/03/an-architectural-census-philadelphias-25-carnegie-branch-libraries/",
      sourceType:
        "local-history/institutional blog (PhillyHistory, City of Philadelphia Department of Records)",
      usageNote:
        "Controls the architect, 1907 opening date, Carnegie-branch number, Gothic Revival style, and the building's 'no longer extant' status. The branch's later reuse as the Free Library's Library for the Blind (c. 1957) and its demolition (reported elsewhere as 1975) to make way for the Community College of Philadelphia campus are corroborated across multiple search results referencing Free Library of Philadelphia digital collections and the Library for Accessible Media for Pennsylvanians' own institutional history, but a primary source page for that specific chronology could not be directly opened in this session (candidate pages returned a non-rendering script-only page or a 403 error) — treated as generally corroborated, not independently verified from a directly read primary source. Not accepted for any historic-register designation claim — this could not be independently verified and must not appear in generated copy.",
      publicationDate: "2019-03-01",
    },
    evidence: {
      subjectId: "streetlit/1700-spring-garden-carnegie-library",
      text: "The Spring Garden Branch of the Free Library of Philadelphia opened on November 18, 1907, at the southwest corner of 17th and Spring Garden Streets — the seventh library building in the city funded by Andrew Carnegie's 1903 gift to the Free Library. Designed by the architectural firm Field & Medary in the Gothic Revival style, it served the neighborhood as a branch library for nearly five decades. The branch closed around 1955, and the building was reused by around 1957 as the Free Library's Library for the Blind, before being demolished — reportedly in 1975 — to make way for the campus of the newly established Community College of Philadelphia, which occupies the site today. No trace of the historic library building remains.",
      claimScope:
        "The Spring Garden Branch's 1907 opening date, its status as the seventh Carnegie-funded Free Library branch in Philadelphia, its location at the southwest corner of 17th and Spring Garden Streets, its Field & Medary Gothic Revival design, and the fact that it is no longer standing today. Also covers, with hedged/attributed language rather than flat assertion, its closure as a branch library (c. 1955), its reuse as the Free Library's Library for the Blind (c. 1957), and its demolition (reported as 1975) to make way for the Community College of Philadelphia campus, which now occupies the site. Do not state or imply that the historic library building is still standing today, that any present-day Community College of Philadelphia building is or occupies the exact historic library structure, or that the building holds any current or former historic-register designation — register status could not be independently verified in this session and must not be asserted.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-09-10",
      explicitDiscoveryTier: 1,
    },
  },
  "way/1359685411": {
    source: {
      title: "Fishtown Adaptation",
      url: "https://hiddencityphila.org/2016/05/fishtown-adaptation/",
      sourceType:
        "local-history/preservation journalism (Hidden City Philadelphia)",
      usageNote:
        "Corroborated by a second Hidden City Philadelphia article, 'Historic Fishtown, Tier 2' (https://hiddencityphila.org/2016/05/historic-fishtown-tier-2/), which additionally documents the mill's 1886 opening and 1925 expansion and its listing on the National Register of Historic Places (not the Philadelphia Register). Accepted for the mill's labor-strike history, adaptive-reuse conversion, and construction chronology — not for a specific NRHP listing year, which was not stated in either reviewed source.",
      publicationDate: "2016-05-01",
    },
    evidence: {
      subjectId: "way/1359685411",
      text: "The building at 1421 East Columbia Avenue, at the corner of Columbia and Memphis Streets, was the Brownhill & Kramer Hosiery Mill — one of Philadelphia's full-fashioned silk hosiery manufacturers, opened in 1886 and expanded in 1925. In the 1920s and 1930s the mill was the site of numerous, innovative labor strikes — including disruptive sit-down strikes in the 1930s that drew national attention — that helped shape unionization and bargaining power for hosiery workers in Philadelphia and beyond. Though lacking local historic designation and legally demolishable, the mill complex is listed on the National Register of Historic Places, and developer Domani Developers chose to preserve and convert it rather than tear it down, rehabbing it into 57 apartments along Memphis Street with rebuilt townhomes on the Columbia Avenue side.",
      claimScope:
        "The building at 1421 East Columbia Avenue as the former Brownhill & Kramer Hosiery Mill, its 1886 opening and 1925 expansion, its role as the site of significant 1920s-30s hosiery-worker labor strikes (including 1930s sit-down strikes), its listing on the National Register of Historic Places (not the Philadelphia Register), and its adaptive-reuse conversion into 57 apartments plus rebuilt townhomes. Do not state a specific NRHP listing year — this was not confirmed in the reviewed source material. Do not describe the building as still operating as a hosiery mill or factory today.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-09-10",
      explicitDiscoveryTier: 1,
    },
  },
  "way/963718616": {
    source: {
      title: "Fishtown Adaptation",
      url: "https://hiddencityphila.org/2016/05/fishtown-adaptation/",
      sourceType:
        "local-history/preservation journalism (Hidden City Philadelphia)",
      usageNote:
        "Accepted for the building's original industrial uses, adaptive-reuse chronology, and physical description — single-source citation; no independent corroborating source was reviewed for this specific building.",
      publicationDate: "2016-05-01",
    },
    evidence: {
      subjectId: "way/963718616",
      text: "The four-story brick-and-concrete industrial building at 1714 Memphis Street, overlooking Palmer Cemetery, was built around 1920 to manufacture baseball equipment for A.J. Reach's sporting goods empire. It later served as a Pepsi-Cola bottling plant and, still later, a popcorn factory, before being converted into loft apartments in 2008 — one of the earliest buildings in this part of Fishtown to make that residential conversion.",
      claimScope:
        "The building at 1714 Memphis Street as a c.1920 industrial building originally built for A.J. Reach's sporting goods manufacturing, its later use as a Pepsi-Cola bottling plant and then a popcorn factory, and its 2008 conversion into loft apartments as an early example of residential adaptive reuse in this part of Fishtown. Do not describe the building as still operating as a factory or bottling plant today.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-09-10",
      explicitDiscoveryTier: 2,
    },
  },
  "streetlit/1818-spring-garden-reyburn-mansion": {
    source: {
      title: "History of Philadelphia College of Osteopathic Medicine",
      url: "https://www.pcom.edu/campuses/philadelphia-campus/history.html",
      sourceType:
        "institutional history page (Philadelphia College of Osteopathic Medicine)",
      usageNote:
        "Accepted as the primary institutional source for the Reyburn Mansion's location (19th and Spring Garden Streets), its identity as former Philadelphia Mayor John E. Reyburn's residence, and PCOM's (then Philadelphia College of Osteopathy) 1917-1929 occupancy, including the DeArmond, Ashmead & Bickley renovation and the rear hospital building. The present-day address (1818-1820 Spring Garden Street) and the fact that a modern apartment building ('Spring Garden Towers') now occupies the site were corroborated via OpenStreetMap data and a local-history site (matthiasbaldwinpark.org, whose page for this address is titled 'Spring Garden Towers/PCOM') — the latter could not be directly fetched in this session (Wix-framework client-rendered site, a known limitation) and was accepted only via WebSearch-returned excerpts. A separate WebSearch-derived claim citing a specific street number of 1822 Spring Garden and a post-PCOM chronology (casket showroom, present-day retail tenants) could not be corroborated — the cited source for that claim resolved to an unrelated Chestnut Street building — and is explicitly excluded from claimScope.",
    },
    evidence: {
      subjectId: "streetlit/1818-spring-garden-reyburn-mansion",
      text: "The mansion that once stood near 19th and Spring Garden Streets belonged to John Edgar Reyburn, who served as mayor of Philadelphia from 1907 to 1911. In 1917, the newly forming Philadelphia College of Osteopathy — known today as the Philadelphia College of Osteopathic Medicine (PCOM) — acquired the Reyburn mansion as its first campus. Architects DeArmond, Ashmead & Bickley converted the brick-and-terra-cotta mansion into classrooms and laboratories, and the college later built a three-story, 52-bed hospital building to its rear. PCOM operated from this site for about a dozen years before relocating in 1929. The historic mansion no longer stands; a modern apartment building occupies the site today.",
      claimScope:
        "This site was the Reyburn Mansion, associated with Philadelphia Mayor John E. Reyburn, and served as the first campus of the Philadelphia College of Osteopathy, now PCOM, from 1917 to 1929. Do not state or imply that the historic mansion is still standing today, or that the present-day apartment building at this site ('Spring Garden Towers') is, or occupies, the historic Reyburn Mansion structure — that building is a distinct, unrelated real OSM entity (see osmAlias in streetlitPlaces.ts) and must not be conflated with this historic identity. Do not include the casket-showroom claim, any post-1929 chronology, or any specific demolition date or architectural style for what replaced the mansion — none of this is directly supported by verified sources reviewed in this session.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-09-11",
      explicitDiscoveryTier: 1,
    },
  },
  "node/3499206770": {
    source: {
      title: "1500 Spring Garden Street",
      url: "https://www.baldwinparkphilly.org/1500-spring-garden-street",
      sourceType:
        "local neighborhood-history organization site (Matthias Baldwin Park), corroborated by the Encyclopedia of Greater Philadelphia's Baldwin Locomotive Works entry and Library Company of Philadelphia digital-collection material",
      usageNote:
        "Accepted, via WebSearch-returned excerpts, for: Baldwin Locomotive Works' sale of this site to Smith Kline & French in 1945 and SKF's 1948 headquarters move onto the former industrial land; and the Baldwin complex's footprint (bounded by Spring Garden Street, Broad Street, 18th Street, and the Reading Railroad) and its status as the world's largest steam-locomotive manufacturer at its peak. This baldwinparkphilly.org page could not be directly fetched in this session (Wix-framework client-rendered site, a known limitation also affecting the 2101 Mount Vernon Street entry's source) — accepted only via WebSearch-returned excerpts, cross-checked against the Encyclopedia of Greater Philadelphia's entry and Library Company of Philadelphia digital-collection captions referencing the same Spring Garden/Broad/18th Street/Reading Railroad footprint. Not accepted for a specific year of Baldwin's departure from the site for Eddystone, PA — sources conflict (1920 vs. 1928) — or for any claim of building-level continuity between the present-day library building and either the historic Baldwin or Smith Kline & French use.",
    },
    evidence: {
      subjectId: "node/3499206770",
      text: "This site, at 1500 Spring Garden Street, sits within the footprint of the former Baldwin Locomotive Works — a manufacturing complex that once occupied roughly eight square blocks bounded by Spring Garden Street, Broad Street, 18th Street, and the Reading Railroad. At its peak, Baldwin was the world's largest producer of steam locomotives. After Baldwin relocated its operations away from the site, the pharmaceutical firm Smith Kline & French acquired the vacated industrial land and built its new corporate headquarters here in 1948 — the company would go on to grow into one of the world's largest pharmaceutical firms.",
      claimScope:
        "This site was part of the vast Baldwin Locomotive Works complex, once the world's largest producer of steam locomotives. After Baldwin left the area, Smith Kline & French established its headquarters on the former industrial land, moving in during 1948. Do not state or imply that the current library building at this address is, or occupies the same physical structure as, the historic Baldwin Locomotive Works or the 1948 Smith Kline & French headquarters building — building-level continuity between the present-day structure and either historic use is not established by the reviewed sources. Do not assert a specific year for Baldwin's departure from the site — sources conflict between 1920 and 1928.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-09-11",
      explicitDiscoveryTier: 1,
    },
  },
  "streetlit/1903-spring-garden-la-milagrosa": {
    source: {
      title: "100 Years and Still Going Strong at La Milagrosa Chapel",
      url: "https://catholicphilly.com/2011/05/news/100-years-and-still-going-strong-at-la-milagrosa-chapel/",
      sourceType:
        "Archdiocese-affiliated news publication (CatholicPhilly), corroborated by two directly-fetched Philadelphia Inquirer articles",
      usageNote:
        "CatholicPhilly, directly fetched, is accepted as the primary source for the chapel's April 26, 1912 founding, Mother (later Saint) Katharine Drexel's $1,080 donation and its explicit anti-exclusion condition (the donation would be forfeited if Spanish-speaking people of African descent were excluded from the congregation), and its status as the first place in the Archdiocese of Philadelphia with a regular, exclusively Spanish-language Mass. The 2013 closure — the Vincentian order's decision to sell the property to help fund retirement costs for priests in Spain, with a final Mass on June 23, 2013 — is corroborated by a directly-fetched, contemporaneous Philadelphia Inquirer article (https://www.inquirer.com/philly/news/20130420_La_Milagrosa_chapel_to_close_in_June.html). The building's later conversion to residential use is corroborated by a directly-fetched 2023 Philadelphia Inquirer follow-up (https://www.inquirer.com/news/la-milagrosa-latino-community-using-parish-trust-oldest-spanish-speaking-church-scholarships-20230428.html), which describes the sold building as a renovated condo building ($750,000 sale) and documents a surviving scholarship fund but no active congregation anywhere. A separate, less-authoritative 2013-era account describes the conversion as seven apartments — sources are not reconciled on apartments vs. condos or on exact unit count, so neither is asserted in claimScope. Not accepted for any claim that the congregation still exists or holds services anywhere as an active parish today.",
      publicationDate: "2011-05-01",
    },
    evidence: {
      subjectId: "streetlit/1903-spring-garden-la-milagrosa",
      text: "The building at 1903 Spring Garden Street was, for over a century, La Milagrosa — formally the Capilla Católica Hispana de la Medalla Milagrosa — founded on April 26, 1912, with the help of a $1,080 donation from Mother Katharine Drexel, later canonized a saint. Drexel's donation came with a condition: it would be forfeited if Spanish-speaking people of African descent were excluded from the congregation. La Milagrosa became the first place in the Archdiocese of Philadelphia with a regular, exclusively Spanish-language Mass, and served generations of the city's Spanish-speaking Catholics, including Mexican, Colombian, Puerto Rican, Paraguayan, and Cuban communities. In 2013, the Vincentian order that ran the chapel decided to sell the property to help fund retirement costs for priests in Spain, and La Milagrosa held its final Mass on June 23 of that year. The building was later sold and converted to residential use.",
      claimScope:
        "The building at 1903 Spring Garden Street as the former home of La Milagrosa (Capilla Católica Hispana de la Medalla Milagrosa), founded April 26, 1912, with Katharine Drexel's $1,080 donation and its explicit anti-exclusion condition; its status as the first place in the Archdiocese of Philadelphia with a regular, exclusively Spanish-language Mass; its role serving Philadelphia's diverse Spanish-speaking Catholic communities; its 2013 closure (the Vincentian order's decision to sell to fund retiring priests in Spain, final Mass June 23, 2013); and its later conversion to residential use. Do not state or imply that La Milagrosa still holds services at this address, still exists as an active congregation anywhere, or that the building is still a place of worship today. Do not assert a specific number of residential units or whether the conversion is apartments or condos — sources are not reconciled on this point.",
      verificationStatus: "approved",
      verificationConfidence: "high",
      curatedTrust: "high",
      lastVerifiedDate: "2026-09-12",
      explicitDiscoveryTier: 1,
    },
  },
  "streetlit/1717-spring-garden-stetson-house": {
    source: {
      title: "Stetson Mansion",
      url: "https://www.baldwinparkphilly.org/stetson-mansion",
      sourceType:
        "local neighborhood-history organization site (Matthias Baldwin Park)",
      usageNote:
        "This baldwinparkphilly.org page could not be directly fetched in this session (Wix-framework client-rendered site, the same limitation previously noted for the 2101 Mount Vernon Street and 1500 Spring Garden Street entries) — accepted only via WebSearch-returned excerpts. Corroborated by a directly-fetched real-estate listing (https://www.thecondoshops.com/listing/1717-spring-garden-street/) confirming the building was 'originally built for the famous Stetson Hat family' and describing its current condition as 4 bi-level lofts retaining original mansion-era architectural detail. Important correction: an initial identification of this Philadelphia building with the Wikipedia article 'John B. Stetson House' (NRHP-listed November 21, 1978, reference 78000957) was incorrect — that NRHP-listed property is a distinct building, the Stetson family's winter mansion in DeLand, Florida, designed by architect George T. Pearson in 1886. No National Register or other historic-register listing for 1717 Spring Garden Street, Philadelphia was found in this session and must not be asserted. Not accepted for a specific loft/condo conversion year — an unconfirmed secondary WebSearch summary cited 2008, but this could not be corroborated against a primary source.",
    },
    evidence: {
      subjectId: "streetlit/1717-spring-garden-stetson-house",
      text: "The building at 1717 Spring Garden Street was, for about ten years beginning in 1878, the home of hat manufacturer John B. Stetson, during the early growth years of his hat-making company. Stetson sold the property in 1888 and moved to a larger suburban estate in Elkins Park, just north of the city. The Spring Garden Street building remained a single-family home until the 1970s, when it became office space, used mostly by lawyers. It was later converted into residential condominium/loft units, and today retains original mansion-era architectural detail, including mosaic tile work, stained glass, and marble and ceramic fireplaces.",
      claimScope:
        "This site was the Philadelphia residence of hat manufacturer John B. Stetson for approximately ten years beginning in 1878, before he sold the property in 1888 and relocated to a larger estate in Elkins Park. Also covers the building's later use as law-office space beginning in the 1970s, its eventual conversion into residential condominium/loft units, and the survival of original mansion-era architectural detail. Do not state or imply that this building holds any National Register of Historic Places listing or other formal historic-register designation — no such listing was found in this session; this building must not be conflated with the separate, NRHP-listed Stetson mansion in DeLand, Florida. Do not assert a specific year for the condominium/loft conversion — this is not confirmed by a primary source.",
      verificationStatus: "approved",
      verificationConfidence: "medium",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-09-12",
      explicitDiscoveryTier: 1,
    },
  },
};

/**
 * Returns the curated entry for this subjectId only if it exists AND is
 * approved. Used both as the gate for the narrow osm_bare copy-generation
 * exception and as the source of the curatedContent/curatedClaimScope
 * fields sent to copy generation.
 */
export function getApprovedCuratedEntry(
  subjectId: string,
): CuratedEntry | undefined {
  const entry = CURATED_LOCAL_HISTORY[subjectId];
  if (entry && entry.evidence.verificationStatus === "approved") {
    return entry;
  }
  return undefined;
}
