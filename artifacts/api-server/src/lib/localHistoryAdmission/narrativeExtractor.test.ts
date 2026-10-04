/**
 * Regression tests for extractIdentityAnchors' phrase-grouping fix — see its
 * doc comment in narrativeExtractor.ts for the full misattribution bug this
 * fixes (found in the NYC Forgotten New York source-native discovery proof).
 *
 * Promoted (faithful port) from
 * experiments/hybrid-discovery-v0.1/narrative/narrativeExtractor.test.ts for
 * production offline batch-tool use — now covered by the committed CI
 * `pnpm --filter @workspace/api-server run test` path.
 */
import { describe, expect, it } from "vitest";
import { extractNarrativeClaims } from "./narrativeExtractor";

const ROBERT_MORRIS_ARTICLE = `ROBERT MORRIS APARTMENTS, Jackson Heights

The Queensborough Corporation, beginning in the 1910s and continuing on to the 1930s, built a magnificent series of apartment buildings between 74th and 90th Street and from Roosevelt Avenue north to Jackson Avenue, now Northern Boulevard. The buildings boast vast inner courtyards (invisible from the street) and the complex once had its own golf course and tennis club. Though occasional redesigns have altered the buildings, they remain a NYC treasure and own well-deserved places as NYC landmarks.
The Robert Morris Apartments, built in 1929 on the south side of 37th Avenue between 79th and 80th Street, still preserves what are probably its original molded doorways and cut glass facades.
Stop inside the  Jackson Heights Post Office  — a Georgian-style brick building at 78-02 37th Avenue — for a look at Peppino Mangravite's 1940 mural, "Development of Jackson Heights," depicting the farms of Jackson Heights before its early-20th Century development.
There are also extraordinary murals commissioned by the Depression-era Works Progress Administration to be found in the  Woodhaven post office  on Forest Parkway just off Jamaica Avenue, and murals depicting several Queens neighborhoods adorn the walls of the Flushing Post Office on Main Street at Sanford Avenue.
12/30/15`;

describe("extractIdentityAnchors phrase-grouping — Jackson Heights Post Office / Robert Morris Apartments misattribution", () => {
  it("does not attach Robert Morris Apartments' construction-date claim to the Jackson Heights Post Office candidate", () => {
    const claims = extractNarrativeClaims(
      ROBERT_MORRIS_ARTICLE,
      { streetName: "37th Avenue" },
      {
        placeKey: "fny-jh-post-office",
        address: "78-02 37th Avenue",
        title: "Jackson Heights Post Office",
        proposedIdentityType: "current-osm-entity",
        sourceId: "fny-52283",
        claimIdPrefix: "fny-52283-fny-jh-post-office",
        buildClaimText: (sentence) => sentence,
      },
    );
    const claimTexts = claims.map((c) => c.supportingSpan);
    expect(claimTexts.some((s) => s.includes("Robert Morris Apartments"))).toBe(
      false,
    );
  });

  it("attaches Robert Morris Apartments' own construction-date claim to its own candidate", () => {
    const claims = extractNarrativeClaims(
      ROBERT_MORRIS_ARTICLE,
      { streetName: "37th Avenue" },
      {
        placeKey: "fny-robert-morris-apts",
        address: "",
        title: "Robert Morris Apartments",
        proposedIdentityType: "current-osm-entity",
        sourceId: "fny-52283",
        claimIdPrefix: "fny-52283-fny-robert-morris-apts",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some(
        (c) =>
          c.claimType === "construction-date" &&
          c.supportingSpan.includes("Robert Morris Apartments"),
      ),
    ).toBe(true);
  });

  it("does not false-trigger the Jackson Heights Post Office candidate on an unrelated 'Jackson Avenue' mention alone", () => {
    const claims = extractNarrativeClaims(
      ROBERT_MORRIS_ARTICLE,
      { streetName: "37th Avenue" },
      {
        placeKey: "fny-jh-post-office",
        address: "78-02 37th Avenue",
        title: "Jackson Heights Post Office",
        proposedIdentityType: "current-osm-entity",
        sourceId: "fny-52283",
        claimIdPrefix: "fny-52283-fny-jh-post-office",
        buildClaimText: (sentence) => sentence,
      },
    );
    for (const claim of claims) {
      expect(claim.supportingSpan).not.toContain("Queensborough Corporation");
    }
  });
});

describe("splitSentencesInParagraph — middle-initial sentence-boundary fix (Stephen B. Jacobs live defect)", () => {
  it("keeps a 'Firstname M. Lastname' middle initial intact across the sentence split (John F. Kennedy)", () => {
    const claims = extractNarrativeClaims(
      "The Synthetic Lodge was renovated by architect John F. Kennedy in 1962. The firm relocated its offices shortly after.",
      { streetName: "Main Street" },
      {
        placeKey: "synthetic-middle-initial-kennedy",
        address: "",
        title: "Synthetic Lodge",
        proposedIdentityType: "current-osm-entity",
        sourceId: "synthetic-middle-initial-kennedy",
        claimIdPrefix: "synthetic-middle-initial-kennedy",
        buildClaimText: (sentence) => sentence,
      },
    );
    const architectClaim = claims.find((c) => c.claimType === "architect");
    expect(architectClaim?.supportingSpan).toBe(
      "The Synthetic Lodge was renovated by architect John F. Kennedy in 1962.",
    );
    expect(architectClaim?.relatedEntities).toContain("John F. Kennedy");
  });

  it("still splits a genuine sentence boundary that happens to follow a capitalized single-letter token (Dorm B. / The Dormitory)", () => {
    const claims = extractNarrativeClaims(
      "Students lived in Dorm B. The Dormitory was established in 1950.",
      { streetName: "Main Street" },
      {
        placeKey: "synthetic-dorm-b-boundary",
        address: "",
        title: "Dormitory",
        proposedIdentityType: "current-osm-entity",
        sourceId: "synthetic-dorm-b-boundary",
        claimIdPrefix: "synthetic-dorm-b-boundary",
        buildClaimText: (sentence) => sentence,
      },
    );
    const foundingClaim = claims.find(
      (c) => c.claimType === "institutional-founding",
    );
    expect(foundingClaim?.supportingSpan).toBe(
      "The Dormitory was established in 1950.",
    );
    expect(foundingClaim?.supportingSpan).not.toContain("Dorm B.");
  });
});

describe("classifySentence — place-name-origin/naming-myth correction (legend-tradition reuse)", () => {
  it("classifies a naming-myth-correction sentence as legend-tradition", () => {
    const claims = extractNarrativeClaims(
      `The Riverside Arch, Testville

The Riverside Arch stands at 100 Main Street. It is a popular misnomer that the arch is named for the river; it has nothing to do with any river. Instead, the arch was named for its original builder, Thomas Rivers.`,
      { streetName: "Main Street" },
      {
        placeKey: "test-riverside-arch",
        address: "100 Main Street",
        title: "Riverside Arch",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test",
        claimIdPrefix: "test-riverside-arch",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some(
        (c) =>
          c.claimType === "legend-tradition" &&
          c.supportingSpan.includes("misnomer"),
      ),
    ).toBe(true);
  });
});

describe("extractIdentityAnchors phrase-grouping — no regression on single-non-generic-word titles", () => {
  it("still extracts a claim for a single-word-anchor title (Stetson Residence-style)", () => {
    const claims = extractNarrativeClaims(
      "The Stetson Residence was built in 1875 by architect John Notman.",
      { streetName: "Spring Garden" },
      {
        placeKey: "test-stetson",
        address: "",
        title: "Stetson Residence",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-stetson",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(claims.length).toBeGreaterThan(0);
  });
});

/**
 * Regression tests for the ownContextNames fix to pivotsAwayFromTarget — see
 * its doc comment in narrativeExtractor.ts for the false-positive this fixes
 * (found on the real Andrew Jackson Apts / "Jackson Heights" naming-myth
 * story during the FNY source-native hardening pass).
 */
const ANDREW_JACKSON_ARTICLE = `THE ANDREW JACKSON, Jackson Heights

The Andrew Jackson apartment building stands at 35-20 Leverich Street. Many long assumed the building was named for President Andrew Jackson. However, Andrew Jackson has nothing to do with Jackson Heights. Instead, the neighborhood was named for John C. Jackson, a turnpike developer.`;

describe("pivotsAwayFromTarget ownContextNames — Andrew Jackson Apts / Jackson Heights naming-myth false positive", () => {
  it("extracts the naming-myth-correction claim when the target's own neighborhood is supplied as ownContextNames", () => {
    const claims = extractNarrativeClaims(
      ANDREW_JACKSON_ARTICLE,
      { streetName: "Leverich Street" },
      {
        placeKey: "test-andrew-jackson",
        address: "35-20 Leverich Street",
        title: "Andrew Jackson",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-andrew-jackson",
        buildClaimText: (sentence) => sentence,
        ownContextNames: ["Jackson Heights"],
      },
    );
    expect(
      claims.some(
        (c) =>
          c.claimType === "legend-tradition" &&
          c.supportingSpan.includes("has nothing to do with"),
      ),
    ).toBe(true);
  });

  it("documents the fix's necessity: without ownContextNames, the same sentence is still wrongly treated as pivoting away", () => {
    const claims = extractNarrativeClaims(
      ANDREW_JACKSON_ARTICLE,
      { streetName: "Leverich Street" },
      {
        placeKey: "test-andrew-jackson-unfixed",
        address: "35-20 Leverich Street",
        title: "Andrew Jackson",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-andrew-jackson-unfixed",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some((c) => c.supportingSpan.includes("has nothing to do with")),
    ).toBe(false);
  });
});

/**
 * Regression tests for the `urban-remnant` claim type — a present-day
 * physical characteristic (present form) that is evidence of a specific
 * vanished urban-scale pattern (a demolished street, removed rail line,
 * filled stream/canal, or earlier parcel/street-grid boundary). See
 * REMNANT_PRESENT_FORM_RE/VANISHED_URBAN_OBJECT_RE/VANISHED_URBAN_FATE_RE's
 * doc comments in narrativeExtractor.ts for the exact invariant. General,
 * source-agnostic classifier logic — not specific to Forgotten New York or
 * any named place/street, even though the first fixture below is inspired by
 * (not a verbatim copy of) Forgotten New York's real Crooked House article,
 * which describes the same shape (a diagonal building orientation caused by
 * a vanished road) using a proper-noun street name ("Trains Meadow Road").
 * Such a named street/road no longer automatically trips OTHER_STREET_RE's
 * pivot-detection when it is the explanatory object of the target's own
 * vanished-urban-pattern backstory (same-sentence object+fate co-occurrence
 * — see hasVanishedUrbanPatternInText's doc comment in narrativeExtractor.ts)
 * — see the "Crooked House-style delayed explanation" describe block below
 * for the relevance-scoping regression coverage this required.
 */
describe("classifySentence — urban-remnant claim type", () => {
  it("classifies a same-sentence diagonal orientation caused by a vanished road as urban-remnant (Crooked-House-style)", () => {
    const claims = extractNarrativeClaims(
      `CROOKED HOUSE, Jackson Heights

The Crooked House stands at 80-19 31st Avenue. Unlike its neighbors, the house sits at an angle to the surrounding grid, its unusual footprint tracing the route of a country road that was closed and paved over when the neighborhood was developed in the 1920s.`,
      { streetName: "31st Avenue" },
      {
        placeKey: "test-crooked-house",
        address: "80-19 31st Avenue",
        title: "Crooked House",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-crooked-house",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some(
        (c) =>
          c.claimType === "urban-remnant" &&
          c.supportingSpan.includes("sits at an angle"),
      ),
    ).toBe(true);
  });

  it("classifies a same-sentence lot-line angle explicitly caused by a demolished street as urban-remnant", () => {
    const claims = extractNarrativeClaims(
      `ODD LOT BUILDING, Testville

The building stands at 100 Main Street. Its lot line angles sharply because it follows the path of a street that was demolished decades ago.`,
      { streetName: "Main Street" },
      {
        placeKey: "test-odd-lot",
        address: "100 Main Street",
        title: "Odd Lot Building",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-odd-lot",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some(
        (c) =>
          c.claimType === "urban-remnant" &&
          c.supportingSpan.includes("lot line angles sharply"),
      ),
    ).toBe(true);
  });

  it("classifies a curb/paving trace explicitly tied to a removed rail line as urban-remnant", () => {
    const claims = extractNarrativeClaims(
      `TRACE STREET, Testville

The building stands at 200 Trace Street. A curving line of paving in the sidewalk still traces the path of a trolley line that was removed decades ago.`,
      { streetName: "Trace Street" },
      {
        placeKey: "test-trace-street",
        address: "200 Trace Street",
        title: "Trace Street Building",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-trace-street",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some(
        (c) =>
          c.claimType === "urban-remnant" &&
          c.supportingSpan.includes("curving line of paving"),
      ),
    ).toBe(true);
  });

  it("does not classify an unexplained crooked building (present form, no vanished cause anywhere) as urban-remnant", () => {
    const claims = extractNarrativeClaims(
      `MYSTERY HOUSE, Testville

The Mystery House stands at 300 Odd Street. The house sits at an angle to the street, mysteriously crooked, and no one knows why.`,
      { streetName: "Odd Street" },
      {
        placeKey: "test-mystery-house",
        address: "300 Odd Street",
        title: "Mystery House",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-mystery-house",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(claims.some((c) => c.claimType === "urban-remnant")).toBe(false);
  });

  it("does not classify Tudor Revival stylistic evocation of an older streetscape as urban-remnant", () => {
    const claims = extractNarrativeClaims(
      `TUDOR HOUSE, Testville

The Tudor House stands at 400 Style Street. Its Tudor Revival facade evokes an older era of the neighborhood's streetscape.`,
      { streetName: "Style Street" },
      {
        placeKey: "test-tudor-house",
        address: "400 Style Street",
        title: "Tudor House",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-tudor-house",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(claims.some((c) => c.claimType === "urban-remnant")).toBe(false);
  });

  it("classifies exposed original brick from a former stable use as use-history, not urban-remnant", () => {
    const claims = extractNarrativeClaims(
      `STABLE HOUSE, Testville

The Stable House stands at 500 Barn Street. Exposed original brick walls reveal that the building was once a stable.`,
      { streetName: "Barn Street" },
      {
        placeKey: "test-stable-house",
        address: "500 Barn Street",
        title: "Stable House",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-stable-house",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some(
        (c) =>
          c.claimType === "use-history" &&
          c.supportingSpan.includes("once a stable"),
      ),
    ).toBe(true);
    expect(claims.some((c) => c.claimType === "urban-remnant")).toBe(false);
  });
});

/**
 * Regression tests for the delayed-explanation relevance-scoping fix — see
 * computeParagraphRelevance/pivotsAwayFromTarget/hasVanishedUrbanPatternInText's
 * doc comments in narrativeExtractor.ts. Before this fix, a target-place
 * narrative's explanatory vanished-feature paragraph, several paragraphs past
 * the initial anchor, was out of relevance scope entirely, and even when in
 * scope, a named street/road inside it (the explanatory object itself) was
 * treated as a pivot to a different place. Found blocking Forgotten New
 * York's real Crooked House article, whose explanatory paragraph about a
 * vanished road ("Trains Meadow Road") sits 3+ paragraphs after the anchor.
 */
describe("computeParagraphRelevance — Crooked House-style delayed explanation", () => {
  const DELAYED_EXPLANATION_ARTICLE = `SKEWED HOUSE, Testville

The Skewed House stands at 300 Grid Avenue. Unlike its neighbors, it sits at an angle to the surrounding blocks.

The unusual positioning gives the house an oddly shaped side yard. There is a story behind why it looks this way.

Here is an old map of the area from before it was developed. It shows the neighborhood back when the land was still farmland.

But the old Prescott Turnpike that once crossed the area has left little trace today. The area was mostly farmland then, crossed by only a couple of roads.

The settlement it once served was abandoned when the surrounding blocks were built up in the 1920s.

Of the properties built near the old settlement, few survive — one of them is the house at 300 Grid Avenue, whose lot line still angles along the original path.`;

  it("classifies a diagonal orientation as urban-remnant when the vanished-road explanation appears several paragraphs later", () => {
    const claims = extractNarrativeClaims(
      DELAYED_EXPLANATION_ARTICLE,
      { streetName: "Grid Avenue" },
      {
        placeKey: "test-skewed-house",
        address: "300 Grid Avenue",
        title: "Skewed House",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-skewed-house",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some(
        (c) =>
          c.claimType === "urban-remnant" &&
          c.supportingSpan.includes("sits at an angle"),
      ),
    ).toBe(true);
  });

  it("still rejects a genuine pivot to an unrelated street/place appearing in the same delayed position", () => {
    const genuinePivotArticle = `CORNER HOUSE, Testville

The Corner House stands at 400 Maple Avenue. It sits close to the sidewalk, unlike most houses on the block.

The unusual positioning gives the house a small stoop out front. There is a story behind why it looks this way.

The Baxter Theatre reopened last year under new ownership. It became a popular venue for local plays in 1975.

Down the street, the house at 400 Maple Avenue remains one of the oldest structures still standing on the block.`;
    const claims = extractNarrativeClaims(
      genuinePivotArticle,
      { streetName: "Maple Avenue" },
      {
        placeKey: "test-corner-house",
        address: "400 Maple Avenue",
        title: "Corner House",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-corner-house",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some((c) => /Baxter|reopened|1975/.test(c.supportingSpan)),
    ).toBe(false);
  });
});

describe("pivotsAwayFromTarget ownContextNames — genuine cross-place pivot is still rejected", () => {
  it("does not extract a claim past a sentence introducing a genuinely different named place, even with ownContextNames set", () => {
    const claims = extractNarrativeClaims(
      `THE ANDREW JACKSON, Jackson Heights

The Andrew Jackson apartment building stands at 35-20 Leverich Street. Sunnyside Gardens Park, a separate planned community built the same decade, has no connection to this building. The complex was demolished in 1960.`,
      { streetName: "Leverich Street" },
      {
        placeKey: "test-andrew-jackson-cross-pivot",
        address: "35-20 Leverich Street",
        title: "Andrew Jackson",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-andrew-jackson-cross-pivot",
        buildClaimText: (sentence) => sentence,
        ownContextNames: ["Jackson Heights"],
      },
    );
    expect(
      claims.some((c) => c.supportingSpan.includes("demolished in 1960")),
    ).toBe(false);
  });
});

describe("classifySentence — construction-purpose (built/constructed/completed + to house/to serve as/to accommodate) -> use-history", () => {
  it("Film Center Building: 'completed in 1929 to house businesses involved in film, theater, music and audio production' yields exactly one use-history claim with the year preserved, not a separate construction-date claim", () => {
    const claims = extractNarrativeClaims(
      `FILM CENTER BUILDING, Hell's Kitchen

The Film Center Building stands at 630 Ninth Avenue. It was completed in 1929 to house businesses involved in film, theater, music and audio production.`,
      { streetName: "Ninth Avenue" },
      {
        placeKey: "test-film-center",
        address: "630 Ninth Avenue",
        title: "Film Center Building",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-film-center",
        buildClaimText: (sentence) =>
          `Test source states about Film Center Building: "${sentence}"`,
      },
    );
    const matching = claims.filter((c) =>
      c.supportingSpan.includes("completed in 1929 to house"),
    );
    expect(matching).toHaveLength(1);
    const claim = matching[0];
    expect(claim.claimType).toBe("use-history");
    expect(claim.dateRange).toEqual({ start: "1929-01-01", precise: true });
    expect(claim.claimText).toBe(
      'Test source states about Film Center Building: "It was completed in 1929 to house businesses involved in film, theater, music and audio production."',
    );
  });

  it("'built ... to house ...' is classified as use-history", () => {
    const claims = extractNarrativeClaims(
      `PRINTERS ROW BUILDING, Testville

The Printers Row Building stands at 200 Main Street. It was built in 1910 to house a printing company and its workers.`,
      { streetName: "Main Street" },
      {
        placeKey: "test-printers-row",
        address: "200 Main Street",
        title: "Printers Row Building",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-printers-row",
        buildClaimText: (sentence) => sentence,
      },
    );
    const matching = claims.filter((c) =>
      c.supportingSpan.includes("built in 1910 to house"),
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].claimType).toBe("use-history");
    expect(matching[0].dateRange).toEqual({
      start: "1910-01-01",
      precise: true,
    });
  });

  it("'constructed ... to serve as ...' is classified as use-history", () => {
    const claims = extractNarrativeClaims(
      `OLD ENGINE HOUSE, Testville

The Old Engine House stands at 50 River Road. It was constructed in 1925 to serve as a firehouse for the growing neighborhood.`,
      { streetName: "River Road" },
      {
        placeKey: "test-engine-house",
        address: "50 River Road",
        title: "Old Engine House",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-engine-house",
        buildClaimText: (sentence) => sentence,
      },
    );
    const matching = claims.filter((c) =>
      c.supportingSpan.includes("constructed in 1925 to serve as"),
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].claimType).toBe("use-history");
  });

  it("'The building was completed in 1929.' (no purpose clause) still falls back to an ordinary construction-date claim", () => {
    const claims = extractNarrativeClaims(
      `SOME BUILDING, Testville

Some Building stands at 10 Elm Street. The building was completed in 1929.`,
      { streetName: "Elm Street" },
      {
        placeKey: "test-some-building",
        address: "10 Elm Street",
        title: "Some Building",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-some-building",
        buildClaimText: (sentence) => sentence,
      },
    );
    const matching = claims.filter((c) =>
      c.supportingSpan.includes("completed in 1929"),
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].claimType).toBe("construction-date");
    expect(matching[0].dateRange).toEqual({
      start: "1929-01-01",
      precise: true,
    });
  });

  it("existing 'built in YEAR' construction-date behavior (no purpose clause) is unchanged", () => {
    const claims = extractNarrativeClaims(
      `ANOTHER BUILDING, Testville

Another Building stands at 20 Oak Street. The building was built in 1931.`,
      { streetName: "Oak Street" },
      {
        placeKey: "test-another-building",
        address: "20 Oak Street",
        title: "Another Building",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-another-building",
        buildClaimText: (sentence) => sentence,
      },
    );
    const matching = claims.filter((c) =>
      c.supportingSpan.includes("built in 1931"),
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].claimType).toBe("construction-date");
  });

  it("'to house'/'to serve as' alone, with no construction verb in the same sentence, does not trigger the construction-purpose rule", () => {
    const claims = extractNarrativeClaims(
      `COMMUNITY CENTER, Testville

The Community Center stands at 30 Pine Street. The nonprofit's mission is to house homeless families in the neighborhood.`,
      { streetName: "Pine Street" },
      {
        placeKey: "test-community-center",
        address: "30 Pine Street",
        title: "Community Center",
        proposedIdentityType: "current-osm-entity",
        sourceId: "test-source",
        claimIdPrefix: "test-community-center",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(
      claims.some((c) => c.supportingSpan.includes("mission is to house")),
    ).toBe(false);
  });
});
