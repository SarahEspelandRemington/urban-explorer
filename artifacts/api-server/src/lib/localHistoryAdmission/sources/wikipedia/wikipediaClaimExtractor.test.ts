/**
 * Regression tests for the Wikipedia narrative claim extractor.
 *
 * Fixture text for Library Hotel and The Actors' Temple is a trimmed, exact
 * copy of the real plaintext extract returned by
 * en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1
 * (fetched live 2026-10-02, same endpoint/params production's
 * fetchWikipediaSummary in routes/explore/index.ts uses) — not hand-authored
 * or invented. See experiments/wikipedia-claim-extraction-v0/ for the live
 * end-to-end proof run (including the full shared admission/worthiness
 * pipeline) against this same real content.
 */
import { describe, expect, it } from "vitest";
import {
  extractWikipediaClaims,
  buildWikipediaSource,
  type WikipediaArticleSummary,
} from "./wikipediaClaimExtractor";
import { generateArtifact } from "../../artifact";
import { projectRuntimeCompat } from "../../projector";
import { applyDiscoveryWorthinessGate } from "../../worthiness";
import { extractNarrativeClaims } from "../../narrativeExtractor";
import type { Claim, Source } from "../../types";

const LIBRARY_HOTEL_ARTICLE: WikipediaArticleSummary = {
  title: "Library Hotel",
  lang: "en",
  articleUrl: "https://en.wikipedia.org/wiki/Library_Hotel",
  extract: `Library Hotel is a 60-room boutique hotel in Midtown Manhattan, New York City. It is located at 299 Madison Avenue (at 41st Street), near Bryant Park, the New York Public Library Main Branch, and Grand Central Terminal. The hotel was designed by architect Stephen B. Jacobs.
Each of the Library Hotel's ten guest floors is themed after a major category of the Dewey Decimal Classification. The 5th floor, for example, is the 500s (the Sciences). Each room is a subcategory or genre, such as Mathematics (Room 500.001) or Botany (Room 500.004). Dewey categories 000, 100, and 200 are placed on the 10th, 11th, and 12th floors, respectively. There are 50-100 books and decorations in each room that accompany the theme, for a total of 6,000 books throughout the hotel.
Due to this classification scheme, the hotel owners were sued in 2003 by OCLC (owners of the Dewey Decimal Classification system). OCLC subsequently reached an agreement with the hotel owners, thus enabling the hotel to continue using the Dewey system.


== References ==


== External links ==
Official website`,
};

const ACTORS_TEMPLE_ARTICLE: WikipediaArticleSummary = {
  title: "The Actors' Temple",
  lang: "en",
  articleUrl: "https://en.wikipedia.org/wiki/The_Actors%27_Temple",
  extract: `The Actors' Temple, officially named Congregation Ezrath Israel, is a non-denominational Jewish synagogue located at 339 West 47th Street, in the Hell's Kitchen neighborhood of Manhattan, New York City, New York, United States.


== History ==
The congregation was founded in 1917 as the West Side Hebrew Relief Association, an Orthodox congregation for the shopkeepers in the area. The synagogue has been located at its current site since 1923, being the synagogue of choice for Jews in the entertainment industry nearby. Rabbi Bernard Birstein, an aspiring actor himself, was the synagogue's first rabbi; he died in 1959.


== Building ==


== References ==


== External links ==
Official website`,
};

describe("extractWikipediaClaims", () => {
  it("Library Hotel: extracts an architect claim with Wikipedia provenance, scoped to the real address", () => {
    const claims = extractWikipediaClaims({
      article: LIBRARY_HOTEL_ARTICLE,
      placeKey: "wiki-library-hotel",
      address: "299 Madison Avenue",
      streetName: "Madison Avenue",
      title: "Library Hotel",
      proposedIdentityType: "current-osm-entity",
    });

    const architectClaim = claims.find((c) => c.claimType === "architect");
    expect(architectClaim).toBeDefined();
    expect(architectClaim!.sourceIds).toEqual(["wiki-en-library-hotel"]);
    expect(architectClaim!.claimText).toContain(
      'Wikipedia\'s article "Library Hotel" states about 299 Madison Avenue:',
    );
    expect(architectClaim!.extractionMethod).toBe("direct-source-text");
  });

  it("Library Hotel: the 2003 OCLC lawsuit sentence now produces an event claim (legal-dispute classifier addition), but the Dewey Decimal floor-theming sentences remain unclassified — a thematic/organizing-concept description is not an 'event', per the bounded-inspection findings", () => {
    const claims = extractWikipediaClaims({
      article: LIBRARY_HOTEL_ARTICLE,
      placeKey: "wiki-library-hotel",
      address: "299 Madison Avenue",
      streetName: "Madison Avenue",
      title: "Library Hotel",
      proposedIdentityType: "current-osm-entity",
    });

    expect(claims.length).toBe(2);
    const lawsuitClaim = claims.find((c) => c.claimType === "event");
    expect(lawsuitClaim).toBeDefined();
    expect(lawsuitClaim!.claimText).toContain("sued in 2003 by OCLC");
    expect(lawsuitClaim!.dateRange?.start).toBe("2003-01-01");

    // The floor-theming sentences (organizing concept, no dated event, no
    // lawsuit/relocation language) still produce no claim at all.
    const allText = claims.map((c) => c.claimText).join(" ");
    expect(allText).not.toContain("themed after");
    expect(allText).not.toContain("500s");
    expect(allText).not.toContain("Room 500.001");

    // The second OCLC sentence ("reached an agreement") has no year in the
    // same sentence, so it correctly produces no second event claim — the
    // trigger phrase alone, without a date, is not sufficient.
    expect(allText).not.toContain("subsequently reached an agreement");
  });

  it("Actors' Temple: extracts the real 1917 founding and 1959 rabbi-death facts with correct claim types", () => {
    const claims = extractWikipediaClaims({
      article: ACTORS_TEMPLE_ARTICLE,
      placeKey: "wiki-actors-temple",
      address: "339 West 47th Street",
      streetName: "West 47th Street",
      title: "Actors' Temple",
      proposedIdentityType: "current-osm-entity",
    });

    const founding = claims.find(
      (c) => c.claimType === "institutional-founding",
    );
    expect(founding?.claimText).toContain("founded in 1917");
    expect(founding?.dateRange?.start).toBe("1917-01-01");

    const biographical = claims.find((c) => c.claimType === "biographical");
    expect(biographical?.claimText).toContain("he died in 1959");

    const relocation = claims.find((c) => c.claimType === "event");
    expect(relocation?.claimText).toContain(
      "located at its current site since 1923",
    );
    expect(relocation?.dateRange?.start).toBe("1923-01-01");
  });

  it("strips MediaWiki section-heading lines (== History ==, == References ==, etc.) so they never leak into claim text or get misclassified", () => {
    const claims = extractWikipediaClaims({
      article: ACTORS_TEMPLE_ARTICLE,
      placeKey: "wiki-actors-temple",
      address: "339 West 47th Street",
      streetName: "West 47th Street",
      title: "Actors' Temple",
      proposedIdentityType: "current-osm-entity",
    });
    for (const claim of claims) {
      expect(claim.claimText).not.toContain("==");
      expect(claim.claimText).not.toContain("External links");
    }
  });

  it("empty address relies on identity-anchor-only relevance, same contract as ForgottenNyExtractionInput.address", () => {
    const claims = extractWikipediaClaims({
      article: ACTORS_TEMPLE_ARTICLE,
      placeKey: "wiki-actors-temple",
      address: "",
      streetName: "West 47th Street",
      title: "Actors' Temple",
      proposedIdentityType: "current-osm-entity",
    });
    expect(claims.some((c) => c.claimType === "institutional-founding")).toBe(
      true,
    );
  });

  it("false-positive boundary: bare 'settlement' with no sued/lawsuit/reached-an-agreement language does not classify as event — deliberately not a trigger, per the legal-dispute addition's ambiguity guardrail", () => {
    // Synthetic fixture, isolating this one boundary — not part of the
    // real-subject verification set.
    const claims = extractNarrativeClaims(
      "The Synthetic Temple's settlement with neighbors over the shared wall was never finalized.",
      { streetName: "West 47th Street" },
      {
        placeKey: "wiki-synthetic-settlement-check",
        address: "",
        title: "Synthetic Temple",
        proposedIdentityType: "current-osm-entity",
        sourceId: "wiki-en-synthetic-settlement-check",
        claimIdPrefix: "wiki-en-synthetic-settlement-check",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(claims.some((c) => c.claimType === "event")).toBe(false);
  });

  it("false-positive boundary: a bare 'since YYYY' sentence with no current-site/building/location anchor does not classify as a relocation event — deliberately not generalized to 'since' alone", () => {
    // Synthetic fixture, isolating this one boundary — not part of the
    // real-subject verification set.
    const claims = extractNarrativeClaims(
      "The Synthetic Temple has operated as a theater since 1980.",
      { streetName: "West 47th Street" },
      {
        placeKey: "wiki-synthetic-since-check",
        address: "",
        title: "Synthetic Temple",
        proposedIdentityType: "current-osm-entity",
        sourceId: "wiki-en-synthetic-since-check",
        claimIdPrefix: "wiki-en-synthetic-since-check",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(claims.some((c) => c.claimType === "event")).toBe(false);
  });
});

describe("buildWikipediaSource", () => {
  it("derives capabilities from the claim types actually extracted, at medium strength, sourceClass wikipedia-wikidata", () => {
    const claims = extractWikipediaClaims({
      article: ACTORS_TEMPLE_ARTICLE,
      placeKey: "wiki-actors-temple",
      address: "339 West 47th Street",
      streetName: "West 47th Street",
      title: "Actors' Temple",
      proposedIdentityType: "current-osm-entity",
    });
    const source = buildWikipediaSource(ACTORS_TEMPLE_ARTICLE, claims);

    expect(source.sourceClass).toBe("wikipedia-wikidata");
    expect(source.id).toBe("wiki-en-the-actors-temple");
    expect(source.url).toBe(ACTORS_TEMPLE_ARTICLE.articleUrl);
    const claimTypesWithCapability = source.capabilities.map(
      (c) => c.claimType,
    );
    expect(new Set(claimTypesWithCapability)).toEqual(
      new Set(["institutional-founding", "biographical", "event"]),
    );
    expect(source.capabilities.every((c) => c.strength === "medium")).toBe(
      true,
    );
  });
});

describe("end-to-end offline path: extractWikipediaClaims -> generateArtifact -> projectRuntimeCompat -> applyDiscoveryWorthinessGate", () => {
  it("Actors' Temple's real claims reach AUTO-ADMIT, ground at tier 5/high, and pass the discovery-worthiness gate (story-bearing claim types present)", () => {
    const claims = extractWikipediaClaims({
      article: ACTORS_TEMPLE_ARTICLE,
      placeKey: "wiki-actors-temple",
      address: "339 West 47th Street",
      streetName: "West 47th Street",
      title: "Actors' Temple",
      proposedIdentityType: "current-osm-entity",
    });
    const source = buildWikipediaSource(ACTORS_TEMPLE_ARTICLE, claims);
    const subjectId = "way/265322610";
    for (const claim of claims) claim.productionSubjectId = subjectId;

    const artifact = generateArtifact(
      claims,
      { [source.id]: source },
      { generatedAt: "2026-10-02T00:00:00.000Z" },
    );
    expect(artifact.summary.integrityViolations).toEqual([]);
    expect(artifact.summary.byDecision["AUTO-ADMIT"]).toBe(claims.length);
    for (const record of artifact.claims) {
      expect(record.grounding.tier).toBe(5);
      expect(record.grounding.confidence).toBe("high");
    }

    const projection = projectRuntimeCompat(artifact);
    const gated = applyDiscoveryWorthinessGate(projection, artifact);
    expect(gated.worthinessBySubject[subjectId]?.projectableForDiscovery).toBe(
      true,
    );
    expect(gated.entries[subjectId]).toBeDefined();
    expect(gated.entries[subjectId].evidence.text).toContain("founded in 1917");
  });

  it("Library Hotel's architect + 2003 OCLC-lawsuit event claims are both AUTO-ADMIT and now pass the worthiness gate — the lawsuit event claim is the story-bearing fact that was previously missing, not a new gate added for this extractor", () => {
    const claims = extractWikipediaClaims({
      article: LIBRARY_HOTEL_ARTICLE,
      placeKey: "wiki-library-hotel",
      address: "299 Madison Avenue",
      streetName: "Madison Avenue",
      title: "Library Hotel",
      proposedIdentityType: "current-osm-entity",
    });
    const source = buildWikipediaSource(LIBRARY_HOTEL_ARTICLE, claims);
    const subjectId = "way/265875639";
    for (const claim of claims) claim.productionSubjectId = subjectId;

    const artifact = generateArtifact(
      claims,
      { [source.id]: source },
      { generatedAt: "2026-10-02T00:00:00.000Z" },
    );
    expect(artifact.summary.byDecision["AUTO-ADMIT"]).toBe(claims.length);

    const projection = projectRuntimeCompat(artifact);
    const gated = applyDiscoveryWorthinessGate(projection, artifact);
    expect(gated.worthinessBySubject[subjectId]?.projectableForDiscovery).toBe(
      true,
    );
    expect(gated.entries[subjectId]).toBeDefined();
    expect(gated.entries[subjectId].evidence.text).toContain(
      "sued in 2003 by OCLC",
    );
  });

  it("preserves fail-closed behavior: a legend/hedge-marked sentence extracted via the shared core still HOLDs rather than being forced to AUTO-ADMIT (admission rules unchanged by this extractor)", () => {
    // Synthetic fixture, used only to exercise the existing hedge/legend
    // epistemic-marker path already proven in narrativeExtractor.test.ts —
    // not part of the real-subject verification set.
    const claims: Claim[] = extractNarrativeClaims(
      "According to legend, the Synthetic Temple was founded in 1900 by a famous actor.",
      { streetName: "West 47th Street" },
      {
        placeKey: "wiki-synthetic-legend-check",
        address: "",
        title: "Synthetic Temple",
        proposedIdentityType: "current-osm-entity",
        sourceId: "wiki-en-synthetic-legend-check",
        claimIdPrefix: "wiki-en-synthetic-legend-check",
        buildClaimText: (sentence) => sentence,
      },
    );
    expect(claims.length).toBeGreaterThan(0);
    const source: Source = buildWikipediaSource(
      { title: "Synthetic Temple", lang: "en", extract: "" },
      claims,
    );
    const artifact = generateArtifact(
      claims,
      { [source.id]: source },
      { generatedAt: "2026-10-02T00:00:00.000Z" },
    );
    expect(artifact.summary.byDecision["AUTO-ADMIT"]).toBe(0);
    expect(artifact.summary.byDecision.HOLD).toBe(claims.length);
  });
});
