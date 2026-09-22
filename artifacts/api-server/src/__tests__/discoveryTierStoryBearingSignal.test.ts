import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/curatedLocalHistory", () => ({
  getApprovedCuratedEntry: vi.fn(),
}));

import { getApprovedCuratedEntry } from "../lib/curatedLocalHistory";
import {
  classifyDiscoveryTier,
  applyDiscoveryTier,
} from "../lib/discoveryTier";
import type { CuratedEntry } from "../lib/curatedLocalHistory";

const mockedGetApprovedCuratedEntry = vi.mocked(getApprovedCuratedEntry);

function curatedEntry(
  overrides: Partial<CuratedEntry["evidence"]> = {},
): CuratedEntry {
  return {
    source: {
      title: "Test Source",
      sourceType: "local public-history narrative source",
      usageNote: "test",
    },
    evidence: {
      subjectId: "way/000000001",
      text: "test evidence text",
      claimScope: "test claim scope",
      verificationStatus: "approved",
      verificationConfidence: "high",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-01-01",
      admissionMethod: "automated",
      ...overrides,
    },
  };
}

beforeEach(() => {
  mockedGetApprovedCuratedEntry.mockReset();
});

// ---------------------------------------------------------------------------
// Requirement 1 (real-data regression): Actors' Temple's admitted
// use-history evidence no longer becomes Tier 4 solely because its prose is
// short and lacks a literal year/civic keyword.
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — story-bearing-claim signal rescues a real short/undated narrative entry", () => {
  it("Actors' Temple-style short use-history evidence: without the signal it is T4 metadataOnly; with it, unclassified (not suppressed)", () => {
    // Real admitted evidence text for way/265322610 (Ephemeral New York,
    // use-history claim) — short, no explicit year, no civic vocabulary —
    // exactly the T4-A false-negative pattern this fix targets.
    const summary =
      "Performers like Sophie Tucker, Milton Berle, and Jack Benny came to services, and Ezrath Israel became known as the Actors' Temple.";
    const place = {
      name: "Actors' Temple",
      summary,
      facts: [],
      osmId: "way/265322610",
    };

    // Baseline: confirm this text is in fact the T4-A false negative absent
    // any curated signal at all.
    const baseline = classifyDiscoveryTier({
      name: place.name,
      summary,
      facts: [],
    });
    expect(baseline.tier).toBe(4);
    expect(baseline.rejectionReason).toBe("metadataOnly");

    // Without hasStoryBearingClaim: the false negative persists.
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ subjectId: "way/265322610" }),
    );
    const withoutSignal: any[] = [{ ...place }];
    applyDiscoveryTier(withoutSignal);
    expect(withoutSignal[0].discoveryTier).toBe(4);
    expect(withoutSignal[0].discoveryRejectionReason).toBe("metadataOnly");

    // With hasStoryBearingClaim: T4-A is cancelled, falls through to
    // unclassified — never promoted to Tier 1/2/3 by this signal.
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({
        subjectId: "way/265322610",
        hasStoryBearingClaim: true,
      }),
    );
    const withSignal: any[] = [{ ...place }];
    applyDiscoveryTier(withSignal);
    expect(withSignal[0].discoveryTier).toBeUndefined();
    expect(withSignal[0].discoveryRejectionReason).toBeUndefined();
  });

  it("also rescues the T4-C (noHistoricalDepth) long-but-undated variant", () => {
    const facts = [
      "The building is located in the commercial district near the main avenue.",
      "It serves as office space for several local professional businesses.",
      "The facility has modern amenities and is accessible by public transit.",
      "Several retail shops occupy the ground floor of the structure.",
      "The surrounding area is a busy commercial zone with heavy foot traffic.",
      "Building management maintains strict standards for all tenant operations.",
      "Security staff are present during all normal business hours.",
    ];
    const summary =
      "A commercial office building in the central business district.";
    const baseline = classifyDiscoveryTier({ name: "Test", summary, facts });
    expect(baseline.tier).toBe(4);
    expect(baseline.rejectionReason).toBe("noHistoricalDepth");

    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const places: any[] = [{ name: "Test", summary, facts, osmId: "way/1" }];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBeUndefined();
    expect(places[0].discoveryRejectionReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Requirement 2: a genuinely metadata-only generated entry (identity/
// construction metadata, hasStoryBearingClaim false/absent because it never
// cleared the worthiness gate) remains suppressible as Tier 4.
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — genuinely metadata-only entries remain suppressible", () => {
  it("curated entry with hasStoryBearingClaim: false stays Tier 4 metadataOnly", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: false }),
    );
    const places: any[] = [
      {
        name: "Test Building",
        summary: "A building at the corner of Main and First streets.",
        facts: [],
        osmId: "way/2",
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("metadataOnly");
  });

  it("curated entry with hasStoryBearingClaim omitted (undefined) stays Tier 4 metadataOnly", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(curatedEntry());
    const places: any[] = [
      {
        name: "Test Building",
        summary: "A building at the corner of Main and First streets.",
        facts: [],
        osmId: "way/3",
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("metadataOnly");
  });

  it("non-curated place (no osmId/streetlitId) is entirely unaffected and still suppresses to Tier 4", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(undefined);
    const places: any[] = [
      { name: "Corner Bank", summary: "A bank on the corner.", facts: [] },
    ];
    applyDiscoveryTier(places);
    expect(mockedGetApprovedCuratedEntry).not.toHaveBeenCalled();
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("metadataOnly");
  });

  it("the signal only cancels metadataOnly/noHistoricalDepth — other T4 sub-cases are unaffected", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );

    // T4-B: genericBusinessDescription.
    const facts = [
      "Staff are available weekdays for permit applications and general inquiries.",
      "The facility is open to the public during standard office hours.",
      "Visitors should bring appropriate identification for all transactions.",
      "Parking is available in the adjacent lot on weekday mornings.",
      "The building is wheelchair accessible via the rear entrance.",
      "Multiple departments are housed across several floors of the building.",
    ];
    const places: any[] = [
      {
        name: "Test",
        summary:
          "This is a federal government building providing administrative services to the area.",
        facts,
        osmId: "way/4",
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe(
      "genericBusinessDescription",
    );
  });

  it("the signal never fires on the exact placeholder-fallback shape", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const places: any[] = [
      {
        name: "Test",
        summary: "A notable place in this area.",
        facts: [],
        osmId: "way/5",
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("placeholderFallback");
  });
});

// ---------------------------------------------------------------------------
// Requirement 3: existing Tier-1/2/3 classifications are unchanged — the
// signal never assigns or interferes with a positive tier.
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — positive-tier classifications are unaffected by the signal", () => {
  it("a curated entry with hasStoryBearingClaim: true whose text independently earns Tier 1 keeps Tier 1 unchanged", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const places: any[] = [
      {
        name: "Old Brewery",
        summary:
          "Originally built as a brewery in 1887, later converted into apartments.",
        facts: [],
        osmId: "way/6",
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(1);
    expect(places[0].discoveryRejectionReason).toBeUndefined();
  });

  it("explicitDiscoveryTier still takes priority over the story-bearing signal (existing override unaffected)", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true, explicitDiscoveryTier: 2 }),
    );
    const places: any[] = [
      {
        name: "Test",
        summary: "A short generic description with no history at all here.",
        facts: [],
        osmId: "way/7",
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(2);
    expect(places[0].discoveryRejectionReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Requirement 5: no source-, city-, subject-, named-person-, or
// phrase-specific exception — the mechanism is generic and reacts only to
// the curated entry's structured hasStoryBearingClaim field, never to any
// text content.
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — story-bearing signal is generic, not content-specific", () => {
  it("rescues an entirely unrelated short/undated T4-A place carrying the signal, with no reference to any specific subject/city/person", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const places: any[] = [
      {
        name: "Generic Place",
        summary: "A small structure near the edge of the block.",
        facts: [],
        osmId: "way/999999999",
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBeUndefined();
  });
});
