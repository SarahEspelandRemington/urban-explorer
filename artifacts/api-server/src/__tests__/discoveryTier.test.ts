import { describe, it, expect } from "vitest";
import {
  classifyDiscoveryTier,
  applyDiscoveryTier,
} from "../lib/discoveryTier";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function place(
  summary: string,
  facts: string[] = [],
  extras: { name?: string; category?: string } = {},
) {
  return { name: extras.name ?? "Test Place", summary, facts, ...extras };
}

// ---------------------------------------------------------------------------
// Tier 4 — metadata only (suppressed from auto-narration)
// ---------------------------------------------------------------------------

describe("classifyDiscoveryTier — Tier 4", () => {
  it("T4-A: very short text with no year or history → metadataOnly", () => {
    const result = classifyDiscoveryTier(
      place("A bank located at the corner of Main and First."),
    );
    expect(result.tier).toBe(4);
    expect(result.rejectionReason).toBe("metadataOnly");
  });

  it("T4-A: short current-function description → metadataOnly", () => {
    const result = classifyDiscoveryTier(
      place("This office building houses local government services.", [
        "Open Monday through Friday.",
        "Parking available on the street.",
      ]),
    );
    expect(result.tier).toBe(4);
    expect(result.rejectionReason).toBe("metadataOnly");
  });

  it("T4-B: summary opens with 'This is a [category]' in a longer text → genericBusinessDescription", () => {
    // Corpus >60 words to bypass T4-A, no historical signals.
    const facts = [
      "Staff are available weekdays for permit applications and general inquiries.",
      "The facility is open to the public during standard office hours.",
      "Visitors should bring appropriate identification for all transactions.",
      "Parking is available in the adjacent lot on weekday mornings.",
      "The building is wheelchair accessible via the rear entrance.",
      "Multiple departments are housed across several floors of the building.",
    ];
    const result = classifyDiscoveryTier(
      place(
        "This is a federal government building providing administrative services to the area.",
        facts,
      ),
    );
    expect(result.tier).toBe(4);
    expect(result.rejectionReason).toBe("genericBusinessDescription");
  });

  it("T4-B: 'provides financial services' function language in a longer text → genericBusinessDescription", () => {
    // Corpus >60 words to bypass T4-A, no historical signals.
    const facts = [
      "The branch offers personal and business accounts for all customer types.",
      "ATM machines are available outside the main entrance around the clock.",
      "Loan officers are available by appointment on weekday afternoons.",
      "The institution provides financial banking services to regional customers.",
      "Customer service lines operate extended hours for account inquiries.",
      "Online banking is available through the institution's secure portal.",
    ];
    const result = classifyDiscoveryTier(
      place(
        "Provides financial banking services to local customers and businesses in the downtown core.",
        facts,
      ),
    );
    expect(result.tier).toBe(4);
    expect(result.rejectionReason).toBe("genericBusinessDescription");
  });

  it("T4-C: long text with no year, transformation, or civic vocab → noHistoricalDepth", () => {
    // Corpus must be >60 words (bypasses T4-A) with no history signals.
    const facts = [
      "The building is located in the commercial district near the main avenue.",
      "It serves as office space for several local professional businesses.",
      "The facility has modern amenities and is accessible by public transit.",
      "Several retail shops occupy the ground floor of the structure.",
      "The surrounding area is a busy commercial zone with heavy foot traffic.",
      "Building management maintains strict standards for all tenant operations.",
      "Security staff are present during all normal business hours.",
    ];
    const result = classifyDiscoveryTier(
      place(
        "A commercial office building in the central business district.",
        facts,
      ),
    );
    expect(result.tier).toBe(4);
    expect(result.rejectionReason).toBe("noHistoricalDepth");
  });

  it("T4-A: empty summary and no facts → metadataOnly", () => {
    const result = classifyDiscoveryTier(place(""));
    expect(result.tier).toBe(4);
    expect(result.rejectionReason).toBe("metadataOnly");
  });
});

// ---------------------------------------------------------------------------
// Tier 4 cancellation — civic vocabulary prevents suppression
// ---------------------------------------------------------------------------

describe("classifyDiscoveryTier — civic vocabulary cancels Tier 4", () => {
  it("single civic term cancels T4-C even without a year", () => {
    const facts = [
      "Workers organized here during the labor disputes of the early twentieth century.",
      "The building was a gathering point for union members and their families.",
      "It sat at the centre of the neighbourhood's working-class community.",
      "The site remained a symbol of community solidarity for many decades.",
      "Many local families had ties to the labour movement that met here.",
      "Organisers from across the city gathered in the main hall regularly.",
      "The building hosted meetings, rallies, and community dinners through the years.",
    ];
    const result = classifyDiscoveryTier(
      place("A significant meeting point in the city's labour history.", facts),
    );
    // Has civic terms → should NOT be Tier 4
    expect(result.tier).not.toBe(4);
  });

  it("civic terms cancel T4-A on a short text", () => {
    const result = classifyDiscoveryTier(
      place("A site of civil rights activism in the neighbourhood."),
    );
    expect(result.tier).not.toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Tier 1 — hidden story / social movement
// ---------------------------------------------------------------------------

describe("classifyDiscoveryTier — Tier 1", () => {
  it("T1-A: transformation word + year → hiddenPast", () => {
    const result = classifyDiscoveryTier(
      place(
        "Originally built as a brewery in 1887, the building was later converted into loft apartments.",
      ),
    );
    expect(result.tier).toBe(1);
    expect(result.reason).toBe("hiddenPast");
  });

  it("T1-A: 'formerly' + decade → hiddenPast", () => {
    const result = classifyDiscoveryTier(
      place(
        "Formerly a theatre for vaudeville acts in the nineteen twenties, it later served as a cinema.",
      ),
    );
    expect(result.tier).toBe(1);
    expect(result.reason).toBe("hiddenPast");
  });

  it("T1-A: 'once served as' + year → hiddenPast", () => {
    const result = classifyDiscoveryTier(
      place(
        "This building once served as the city's main post office from 1912 until 1964.",
      ),
    );
    expect(result.tier).toBe(1);
    expect(result.reason).toBe("hiddenPast");
  });

  it("T1-A: conversion + year overrides adaptive-reuse pattern → hiddenPast", () => {
    // This text has both T1-A signals (transformation + year) and T2-B signals
    // (converted + warehouse). T1 is evaluated first and wins.
    const result = classifyDiscoveryTier(
      place(
        "The old warehouse was converted into condominiums in the 1990s, preserving the original brick façade.",
      ),
    );
    expect(result.tier).toBe(1);
    expect(result.reason).toBe("hiddenPast");
  });

  it("T1-B: two civic terms → socialMovement", () => {
    const result = classifyDiscoveryTier(
      place(
        "A gathering place for labor organizers and immigrant workers throughout the early twentieth century.",
        [
          "Union meetings were held here regularly.",
          "The site hosted suffrage rallies in the 1910s.",
        ],
      ),
    );
    expect(result.tier).toBe(1);
    expect(result.reason).toBe("socialMovement");
  });

  it("T1-B: strike and workers → socialMovement", () => {
    const result = classifyDiscoveryTier(
      place(
        "Workers went on strike here in the early 1900s. The building became a symbol of solidarity.",
        [
          "Strike organizers assembled on these steps.",
          "Workers demanded better conditions.",
        ],
      ),
    );
    expect(result.tier).toBe(1);
    expect(result.reason).toBe("socialMovement");
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — architectural detail / adaptive reuse
// ---------------------------------------------------------------------------

describe("classifyDiscoveryTier — Tier 2", () => {
  it("T2-A: architectural style + year + explanatory context → architecturalDetail", () => {
    const result = classifyDiscoveryTier(
      place(
        "Built in 1924, this building is a fine example of Art Deco style, emblematic of the prosperity of the era.",
      ),
    );
    expect(result.tier).toBe(2);
    expect(result.reason).toBe("architecturalDetail");
  });

  it("T2-A: Beaux-Arts + year + 'reflects' → architecturalDetail", () => {
    const result = classifyDiscoveryTier(
      place(
        "Completed in 1898, the façade reflects the Beaux-Arts tradition popular in civic architecture of the period.",
      ),
    );
    expect(result.tier).toBe(2);
    expect(result.reason).toBe("architecturalDetail");
  });

  it("T2-B: 'converted' + named prior use without year → adaptiveReuse", () => {
    // No year → T1-A cannot fire. T2-B fires on adaptive-reuse + prior-use.
    const result = classifyDiscoveryTier(
      place(
        "The old warehouse was converted into condominiums, with the original brick façade carefully preserved.",
      ),
    );
    expect(result.tier).toBe(2);
    expect(result.reason).toBe("adaptiveReuse");
  });

  it("T2-B: repurposed factory into brewery → adaptiveReuse", () => {
    const result = classifyDiscoveryTier(
      place(
        "Repurposed into a craft brewery, this former factory retains its industrial character.",
      ),
    );
    expect(result.tier).toBe(2);
    expect(result.reason).toBe("adaptiveReuse");
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — neighbourhood / infrastructure context
// ---------------------------------------------------------------------------

describe("classifyDiscoveryTier — Tier 3", () => {
  it("T3-A: streetcar suburb language → neighborhoodContext", () => {
    const result = classifyDiscoveryTier(
      place(
        "This area developed as a streetcar suburb in the late nineteenth century, platted to serve commuters.",
      ),
    );
    expect(result.tier).toBe(3);
    expect(result.reason).toBe("neighborhoodContext");
  });

  it("T3-A: postwar development → neighborhoodContext", () => {
    const result = classifyDiscoveryTier(
      place(
        "The neighbourhood saw rapid postwar development as returning veterans sought affordable housing.",
      ),
    );
    expect(result.tier).toBe(3);
    expect(result.reason).toBe("neighborhoodContext");
  });

  it("T3-B: industrial corridor + year → infrastructureContext", () => {
    const result = classifyDiscoveryTier(
      place(
        "This property sits within the historic industrial corridor established in 1878 along the canal route.",
      ),
    );
    expect(result.tier).toBe(3);
    expect(result.reason).toBe("infrastructureContext");
  });

  it("T3 takes priority over T4 when both signals are present", () => {
    // A bank in a streetcar suburb — T3-A fires before Tier 4 checks.
    const result = classifyDiscoveryTier(
      place(
        "A bank that grew alongside the streetcar suburb in the late nineteenth century.",
      ),
    );
    expect(result.tier).toBe(3);
    expect(result.reason).toBe("neighborhoodContext");
  });
});

// ---------------------------------------------------------------------------
// Unclassified — confident tier not assigned
// ---------------------------------------------------------------------------

describe("classifyDiscoveryTier — unclassified", () => {
  it("text with a year but no specific positive rule match → unclassified", () => {
    const result = classifyDiscoveryTier(
      place(
        "This building was constructed in 1955 and has served the neighbourhood for decades.",
        [
          "The structure is of mid-century design.",
          "It stands six storeys tall.",
          "Notable for its large windows.",
        ],
      ),
    );
    // Has a year but no transformation, no civic≥2, no arch style+context, no adaptive reuse
    expect(result.tier).toBeUndefined();
    expect(result.reason).toBe("unclassified");
  });

  it("one civic term without a year → not Tier 4 but also not Tier 1-B", () => {
    const result = classifyDiscoveryTier(
      place(
        "A building associated with the local union during its founding years.",
        [
          "The group met here regularly in the early days.",
          "The structure dates to the turn of the century.",
          "Members would gather in the main hall for meetings.",
          "It played a central role in the community of the period.",
        ],
      ),
    );
    // hasCivic cancels T4; only 1 civic term → not T1-B
    expect(result.tier).not.toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Bergdoll-Kemble Mansion — Wikipedia enrichment classification fixture
//
// These tests verify two things:
//  1. Without Wikipedia content the thin OSM-only summary classifies as T4
//     (the pre-enrichment baseline that the Architecture B change fixes).
//  2. After Wikipedia enrichment the copy LLM produces a summary with a year
//     and transformation language, which the classifier correctly scores T1.
//  3. A failed/null Wikipedia fetch leaves classifier behaviour unchanged.
//
// The "enriched" summary below is representative of what gpt-4.1-mini
// produces when given the real en:Bergdoll_Mansion Wikipedia extract (1882
// construction date, brewer Louis Bergdoll, National Register listing) as the
// `wikipediaContent` field — it contains both a year AND transformation
// language, satisfying T1-A.
// ---------------------------------------------------------------------------

describe("classifyDiscoveryTier — Bergdoll-Kemble Mansion enrichment", () => {
  it("thin OSM-only summary (no Wikipedia) → T4 metadataOnly", () => {
    const result = classifyDiscoveryTier(
      place(
        "Bergdoll-Kemble Mansion is noted for its architectural prominence in the Fairmount neighborhood.",
        [],
        { name: "Bergdoll-Kemble Mansion" },
      ),
    );
    expect(result.tier).toBe(4);
    expect(result.rejectionReason).toBe("metadataOnly");
  });

  it("Wikipedia-enriched summary → T1 hiddenPast (year + transformation)", () => {
    // Mirrors a realistic copy LLM output when the wikipedia= extract for
    // en:Bergdoll_Mansion is injected as `wikipediaContent`.
    const result = classifyDiscoveryTier(
      place(
        "Built in 1882 for Philadelphia brewer Louis Bergdoll, the mansion later passed through multiple owners and is now listed on the National Register of Historic Places.",
        [
          "Originally constructed for Louis Bergdoll, a wealthy German-American brewer.",
          "After Bergdoll's death the property changed hands several times before receiving historic designation.",
        ],
        { name: "Bergdoll-Kemble Mansion" },
      ),
    );
    expect(result.tier).toBe(1);
    expect(result.reason).toBe("hiddenPast");
  });

  it("null Wikipedia fetch (timeout/404) preserves T4 — thin-copy path unchanged", () => {
    // When fetchWikipediaSummary returns null, formatForCopy omits the
    // wikipediaContent field and the copy LLM generates the same thin summary
    // as before the change. The classifier must return T4 as before.
    const result = classifyDiscoveryTier(
      place(
        "A historic building at 2305 North 22nd Street in Philadelphia, Pennsylvania.",
        [],
        { name: "Bergdoll-Kemble Mansion" },
      ),
    );
    expect(result.tier).toBe(4);
    expect(result.rejectionReason).toBe("metadataOnly");
  });

  it("Wikipedia stub with no historical signals does not auto-promote → T4", () => {
    // Guard: even if a wikipedia= tag is present, an article that only
    // describes current function (no year, no transformation) keeps its T4.
    const result = classifyDiscoveryTier(
      place(
        "A commercial office building providing administrative services to local businesses.",
        ["Opened in recent years.", "Houses several professional tenants."],
        { name: "Some Office Building" },
      ),
    );
    expect(result.tier).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// applyDiscoveryTier — in-place mutation
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier", () => {
  it("sets discoveryTier and discoveryRejectionReason on Tier-4 places", () => {
    const places: any[] = [
      { name: "Corner Bank", summary: "A bank on the corner.", facts: [] },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("metadataOnly");
  });

  it("sets discoveryTier without rejectionReason on Tier-1 places", () => {
    const places: any[] = [
      {
        name: "Old Brewery",
        summary:
          "Originally built as a brewery in 1887, later converted into apartments.",
        facts: [],
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(1);
    expect(places[0].discoveryRejectionReason).toBeUndefined();
  });

  it("removes stale discoveryTier when the classifier returns undefined", () => {
    const places: any[] = [
      {
        name: "Building",
        summary:
          "Built in 1955 and serving the area for many years, it remains notable.",
        facts: [
          "The structure is of mid-century design.",
          "It stands six storeys tall and is notable for its large windows.",
        ],
        discoveryTier: 4, // stale tier from a previous classification pass
        discoveryRejectionReason: "metadataOnly",
      },
    ];
    applyDiscoveryTier(places);
    // Unclassified text → stale tier fields must be cleared
    expect(places[0].discoveryTier).toBeUndefined();
    expect(places[0].discoveryRejectionReason).toBeUndefined();
  });

  it("handles an empty array without error", () => {
    expect(() => applyDiscoveryTier([])).not.toThrow();
  });

  it("classifies multiple places in one call", () => {
    const places: any[] = [
      { name: "Bank", summary: "A small bank on the high street.", facts: [] },
      {
        name: "Old Mill",
        summary:
          "Originally a grist mill from 1842, later repurposed as a museum.",
        facts: [],
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[1].discoveryTier).toBe(1);
  });
});
