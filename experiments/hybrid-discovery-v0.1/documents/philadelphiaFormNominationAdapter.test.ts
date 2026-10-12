/**
 * Unit tests for the Philadelphia preservation-document adapter v1
 * (implementation step 3).
 *
 * Mixes real verbatim excerpts from the actual 2301 Fairmount Avenue
 * Philadelphia Historical Commission nomination (confirming the frozen
 * heading-detection/hyphenation rules against real document structure) with
 * small synthetic two-page fixtures where no real excerpt in the one
 * document processed here happens to exercise a given mechanic (e.g. a
 * paragraph split across a page boundary WITHOUT a blank line — the real
 * document, as extracted, never actually breaks a sentence across a page
 * this way; see the implementation-step-3 final report). Synthetic fixtures
 * are clearly labeled as such below.
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  buildPhiladelphiaFormNominationPacket,
  type PhiladelphiaAdapterInput,
} from "./philadelphiaFormNominationAdapter";
import { FROZEN_BORN_DIGITAL_PDF_ACQUISITION } from "./acquisitionMetadata";

function baseInput(rawExtractedText: string): PhiladelphiaAdapterInput {
  return {
    packetId: "pkt-test",
    documentTitle: "Test Nomination",
    jurisdiction: "Philadelphia Historical Commission",
    resourceId: "res-a",
    resourceLabel: "Test Resource",
    rootProvenanceId: "pkt-test-root",
    acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
    rawExtractedText,
  };
}

describe("buildPhiladelphiaFormNominationPacket — real-document heading/scope structure", () => {
  // Real verbatim excerpt (single page) from the real 2301 Fairmount Avenue
  // nomination's blank application-form page.
  const REAL_FORM_PAGE_EXCERPT = `1. ADDRESS OF HISTORIC RESOURCE (must comply with an Office of Property Assessment address)
       Street address:__________________________________________________________________



2. NAME OF HISTORIC RESOURCE
       Historic Name:__________________________________________________________________



6. DESCRIPTION
       Please attach a narrative description and photographs of the resource.`;

  it("detects numbered section headings and groups subsequent paragraphs under them", () => {
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(REAL_FORM_PAGE_EXCERPT),
    );
    const headings = packet.blocks.map((b) => b.sourceNativeHeading);
    expect(headings).toEqual([
      "1. ADDRESS OF HISTORIC RESOURCE (must comply with an Office of Property Assessment address)",
      "2. NAME OF HISTORIC RESOURCE",
      "6. DESCRIPTION",
    ]);
  });

  it("maps identification/description heading roles to document-level scope for a single-resource packet — EXCEPT the real heading-1 line, whose trailing parenthetical qualifier text means it does not exact-match the shared mapper's table and fails closed to undeterminable (a real, discovered limitation — see final report item 7, not a test bug)", () => {
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(REAL_FORM_PAGE_EXCERPT),
    );
    expect(packet.blocks[0]!.sourceNativeHeading).toBe(
      "1. ADDRESS OF HISTORIC RESOURCE (must comply with an Office of Property Assessment address)",
    );
    expect(packet.blocks[0]!.scope).toBe("undeterminable");
    expect(packet.blocks[1]!.scope).toBe("document-level");
    expect(packet.blocks[2]!.scope).toBe("document-level");
  });

  it("never assigns resourceRef and always fails closed to authorshipRole unknown with a recorded basis", () => {
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(REAL_FORM_PAGE_EXCERPT),
    );
    for (const block of packet.blocks) {
      expect(block.resourceRef).toBeUndefined();
      expect(block.authorshipRole).toBe("unknown");
      const authorshipEvidence = block.assignmentEvidence?.find(
        (e) => e.assigns === "authorshipRole",
      );
      expect(authorshipEvidence?.structuralCueType).toBe(
        "no-attribution-found",
      );
    }
  });

  it("does NOT false-positive on the real document's footnote-marker lines (bare digit, no period) as headings", () => {
    // Real verbatim excerpt: a footnote block exactly as it appears on page
    // 9 of the real document — footnote numbers are bare digits on their
    // own line, never "N. " (digit-period-space), so must never be treated
    // as a section heading.
    const REAL_FOOTNOTE_EXCERPT = `6. Description
Some narrative text ends here.

14
   Wagner and Dochter.
15
   Hexamer General Survey, Surveys 275-278 (1866).`;
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(REAL_FOOTNOTE_EXCERPT),
    );
    for (const block of packet.blocks) {
      expect(block.sourceNativeHeading).toBe("6. Description");
    }
  });

  it("administrative/bibliography heading roles fail closed to undeterminable scope, not document-level", () => {
    const REAL_BIBLIOGRAPHY_EXCERPT = `8. Major Bibliographic References

Kazal, Russell A. Becoming Old Stock: The Paradox of German-American Identity. Princeton, NJ:
Princeton University Press, 2004.`;
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(REAL_BIBLIOGRAPHY_EXCERPT),
    );
    expect(packet.blocks).toHaveLength(1);
    expect(packet.blocks[0]!.scope).toBe("undeterminable");
  });

  it("falls back to heading-unknown, scope-undeterminable when no heading precedes content", () => {
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput("Some stray content with no heading above it at all."),
    );
    expect(packet.blocks).toHaveLength(1);
    expect(packet.blocks[0]!.sourceNativeHeading).toBeUndefined();
    expect(packet.blocks[0]!.scope).toBe("undeterminable");
    const scopeEvidence = packet.blocks[0]!.assignmentEvidence?.find(
      (e) => e.assigns === "scope",
    );
    expect(scopeEvidence?.structuralCueType).toBe("no-heading-page-fallback");
  });
});

describe("buildPhiladelphiaFormNominationPacket — reflow and hyphenation (real excerpt)", () => {
  it("reflows hard-wrapped lines with a single space and preserves rawText pre-reflow", () => {
    // Real verbatim excerpt (reformatted to a single page/paragraph) from
    // the real document's Description section.
    const REAL_DESCRIPTION_EXCERPT = `6. Description
2301 Fairmount Avenue is a three-story, late Federal-style building at the northwest
corner of North 23rd Street and Fairmount Avenue in the Fairmount neighborhood of
Philadelphia.`;
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(REAL_DESCRIPTION_EXCERPT),
    );
    const block = packet.blocks[0]!;
    expect(block.text).toBe(
      "2301 Fairmount Avenue is a three-story, late Federal-style building at the northwest corner of North 23rd Street and Fairmount Avenue in the Fairmount neighborhood of Philadelphia.",
    );
    expect(block.rawText).toBe(
      "2301 Fairmount Avenue is a three-story, late Federal-style building at the northwest\ncorner of North 23rd Street and Fairmount Avenue in the Fairmount neighborhood of\nPhiladelphia.",
    );
  });

  it("never repairs a real line-end hyphenation and records it as an ambiguity, never silently", () => {
    // Real verbatim excerpt from page 15 of the real document: "mid-" is
    // wrapped from "1880s" across a line break.
    const REAL_HYPHENATION_EXCERPT = `7. Significance
property. Or                                   at 33rd and Master until the early to mid-
1880s, when it was acquired by Burg & Pfaender, which itself appears to have been
acquired by the Bergdoll Brewing Company, also a Brewerytown staple, around 1910.`;
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(REAL_HYPHENATION_EXCERPT),
    );
    const block = packet.blocks[0]!;
    // Neither "mid-1880s" (hyphen removed/joined) nor "mid1880s" — the
    // hyphen and the line break are both preserved untouched.
    expect(block.text).toContain("early to mid- 1880s, when it was acquired");
    expect(block.text).not.toContain("mid1880s");
    expect(block.text).not.toContain("mid-1880s,");
    expect(block.ambiguityNote).toMatch(/Line-end hyphenation/);
    expect(block.ambiguityNote).toMatch(/not repaired/);
  });
});

describe("buildPhiladelphiaFormNominationPacket — page boundaries (synthetic fixture)", () => {
  it("never allows one block to span a page boundary; a paragraph continued across pages becomes two blocks, each with its own page, flagging the mid-sentence break", () => {
    // SYNTHETIC fixture: the real 2301 Fairmount extraction never happens
    // to break a sentence across a page without an intervening blank line
    // (confirmed: zero such cases in the real document). This fixture
    // proves the mechanic exists and is exercised correctly, should a real
    // document the adapter later encounters actually do this.
    const SYNTHETIC_TWO_PAGE_FIXTURE =
      "6. Description\nThe building was constructed using a technique that was\x0ccommon in the period.";
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(SYNTHETIC_TWO_PAGE_FIXTURE),
    );
    expect(packet.blocks).toHaveLength(2);
    expect(packet.blocks[0]!.page).toBe(1);
    expect(packet.blocks[1]!.page).toBe(2);
    // Both blocks carry forward the same heading (document-wide state).
    expect(packet.blocks[0]!.sourceNativeHeading).toBe("6. Description");
    expect(packet.blocks[1]!.sourceNativeHeading).toBe("6. Description");
    // The first block was cut off mid-sentence by the page boundary.
    expect(packet.blocks[0]!.text).toBe(
      "The building was constructed using a technique that was",
    );
    expect(packet.blocks[0]!.ambiguityNote).toMatch(
      /page boundary without sentence-ending punctuation/,
    );
    expect(packet.blocks[1]!.text).toBe("common in the period.");
  });

  it("confirms the \\f page-split rule drops a trailing empty page but never drops real page content", () => {
    const SYNTHETIC_TRAILING_FORM_FEED =
      "6. Description\nPage one text.\x0c7. Significance\nPage two text.\x0c";
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(SYNTHETIC_TRAILING_FORM_FEED),
    );
    expect(packet.blocks.map((b) => b.page)).toEqual([1, 2]);
  });
});

describe("buildPhiladelphiaFormNominationPacket — stated status (real excerpt)", () => {
  it("detects the real document's checkbox-marked designation status verbatim, with structural basis, and leaves statedDate unguessed", () => {
    // Real verbatim excerpt from page 2 of the real document.
    const REAL_CHECKBOX_EXCERPT = `9. NOMINATOR
        Date of Final Action:__________________________________________________________________
        X Designated              Rejected                                                                     12/7/18
See court decision re: contributing vs. con-contributing portions of property, included after boundary description.`;
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput(REAL_CHECKBOX_EXCERPT),
    );
    expect(packet.statedStatus).toBeDefined();
    expect(packet.statedStatus!.text).toBe("Designated");
    expect(packet.statedStatus!.structuralCueType).toBe("checkbox-x-mark");
    expect(packet.statedStatus!.statedDate).toBeUndefined();
    expect(packet.ambiguityFlags).toBeDefined();
    expect(
      packet.ambiguityFlags!.some((f) => f.includes("no single date")),
    ).toBe(true);
  });

  it("leaves statedStatus undefined, and flags it, when no checkbox cue is present", () => {
    const packet = buildPhiladelphiaFormNominationPacket(
      baseInput("6. Description\nSome text with no status checkbox at all."),
    );
    expect(packet.statedStatus).toBeUndefined();
    expect(packet.ambiguityFlags).toBeDefined();
    expect(
      packet.ambiguityFlags!.some((f) =>
        f.includes("No stated designation status"),
      ),
    ).toBe(true);
  });
});
