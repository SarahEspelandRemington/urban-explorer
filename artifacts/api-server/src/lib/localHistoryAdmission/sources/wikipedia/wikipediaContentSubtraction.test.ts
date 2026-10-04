/**
 * Regression tests for exact/deterministic Wikipedia-content subtraction.
 *
 * Library Hotel / Actors' Temple extract text reused from
 * wikipediaClaimExtractor.test.ts's fixtures — same trimmed, exact copy of
 * the real plaintext extract (fetched live 2026-10-02).
 */
import { describe, expect, it } from "vitest";
import { subtractAdmittedWikipediaSpans } from "./wikipediaContentSubtraction";
import type { Claim } from "../../types";

const LIBRARY_HOTEL_CONTENT = `Library Hotel is a 60-room boutique hotel in Midtown Manhattan, New York City. It is located at 299 Madison Avenue (at 41st Street), near Bryant Park, the New York Public Library Main Branch, and Grand Central Terminal. The hotel was designed by architect Stephen B. Jacobs.
Each of the Library Hotel's ten guest floors is themed after a major category of the Dewey Decimal Classification. The 5th floor, for example, is the 500s (the Sciences). Each room is a subcategory or genre, such as Mathematics (Room 500.001) or Botany (Room 500.004). Dewey categories 000, 100, and 200 are placed on the 10th, 11th, and 12th floors, respectively. There are 50-100 books and decorations in each room that accompany the theme, for a total of 6,000 books throughout the hotel.
Due to this classification scheme, the hotel owners were sued in 2003 by OCLC (owners of the Dewey Decimal Classification system). OCLC subsequently reached an agreement with the hotel owners, thus enabling the hotel to continue using the Dewey system.`;

const OCLC_SENTENCE =
  "Due to this classification scheme, the hotel owners were sued in 2003 by OCLC (owners of the Dewey Decimal Classification system).";

function claim(supportingSpan: string): Pick<Claim, "supportingSpan"> {
  return { supportingSpan };
}

describe("subtractAdmittedWikipediaSpans — Library Hotel", () => {
  it("removes the admitted OCLC lawsuit sentence", () => {
    const out = subtractAdmittedWikipediaSpans(LIBRARY_HOTEL_CONTENT, [
      claim(OCLC_SENTENCE),
    ]);
    expect(out).not.toContain(OCLC_SENTENCE);
    expect(out).not.toContain("sued in 2003");
  });

  it("preserves Dewey theming material", () => {
    const out = subtractAdmittedWikipediaSpans(LIBRARY_HOTEL_CONTENT, [
      claim(OCLC_SENTENCE),
    ]);
    expect(out).toContain(
      "Each of the Library Hotel's ten guest floors is themed after a major category of the Dewey Decimal Classification.",
    );
    expect(out).toContain("the 500s (the Sciences)");
  });

  it("preserves the unclaimed OCLC follow-up sentence", () => {
    const out = subtractAdmittedWikipediaSpans(LIBRARY_HOTEL_CONTENT, [
      claim(OCLC_SENTENCE),
    ]);
    expect(out).toContain(
      "OCLC subsequently reached an agreement with the hotel owners, thus enabling the hotel to continue using the Dewey system.",
    );
  });

  it("does not leave malformed whitespace/punctuation after removal", () => {
    const out = subtractAdmittedWikipediaSpans(LIBRARY_HOTEL_CONTENT, [
      claim(OCLC_SENTENCE),
    ]);
    expect(out).not.toMatch(/[ \t]{2,}/);
    expect(out).not.toMatch(/\n[ \t]/);
    expect(out).not.toMatch(/[ \t]\n/);
    expect(out).toContain(
      "throughout the hotel.\nOCLC subsequently reached an agreement",
    );
  });
});

const ACTORS_TEMPLE_HISTORY_PARAGRAPH = `The congregation was founded in 1917 as the West Side Hebrew Relief Association, an Orthodox congregation for the shopkeepers in the area. The synagogue has been located at its current site since 1923, being the synagogue of choice for Jews in the entertainment industry nearby. Many vaudeville, musical theater, television, and nightclub performers attended services there, including Sophie Tucker, Shelley Winters, Milton Berle, Al Jolson, Jack Benny, Joe E. Lewis, Edward G. Robinson, as well as two of the Three Stooges. Rabbi Bernard Birstein, an aspiring actor himself, was the synagogue's first rabbi; he died in 1959.`;

const FOUNDING_SENTENCE =
  "The congregation was founded in 1917 as the West Side Hebrew Relief Association, an Orthodox congregation for the shopkeepers in the area.";
const RELOCATION_SENTENCE =
  "The synagogue has been located at its current site since 1923, being the synagogue of choice for Jews in the entertainment industry nearby.";
const BIOGRAPHICAL_SENTENCE =
  "Rabbi Bernard Birstein, an aspiring actor himself, was the synagogue's first rabbi; he died in 1959.";

describe("subtractAdmittedWikipediaSpans — Actors' Temple", () => {
  it("removes all three admitted source sentences", () => {
    const out = subtractAdmittedWikipediaSpans(
      ACTORS_TEMPLE_HISTORY_PARAGRAPH,
      [
        claim(FOUNDING_SENTENCE),
        claim(RELOCATION_SENTENCE),
        claim(BIOGRAPHICAL_SENTENCE),
      ],
    );
    expect(out).not.toContain(FOUNDING_SENTENCE);
    expect(out).not.toContain(RELOCATION_SENTENCE);
    expect(out).not.toContain(BIOGRAPHICAL_SENTENCE);
  });

  it("preserves unclaimed worthwhile content in the same paragraph", () => {
    const out = subtractAdmittedWikipediaSpans(
      ACTORS_TEMPLE_HISTORY_PARAGRAPH,
      [
        claim(FOUNDING_SENTENCE),
        claim(RELOCATION_SENTENCE),
        claim(BIOGRAPHICAL_SENTENCE),
      ],
    );
    expect(out).toContain(
      "Many vaudeville, musical theater, television, and nightclub performers attended services there, including Sophie Tucker",
    );
  });
});

describe("subtractAdmittedWikipediaSpans — defensive cases", () => {
  it("does not subtract a truncated fragment span (Stephen B. case)", () => {
    const truncated = "The hotel was designed by architect Stephen B.";
    const out = subtractAdmittedWikipediaSpans(LIBRARY_HOTEL_CONTENT, [
      claim(truncated),
    ]);
    // Untouched: the full, correctly-bounded sentence remains intact.
    expect(out).toContain(
      "The hotel was designed by architect Stephen B. Jacobs.",
    );
  });

  it("is a no-op when the span does not appear exactly", () => {
    const out = subtractAdmittedWikipediaSpans(LIBRARY_HOTEL_CONTENT, [
      claim("This sentence does not exist in the article."),
    ]);
    expect(out).toBe(LIBRARY_HOTEL_CONTENT.trim());
  });

  it("removes every exact occurrence of a duplicated sentence, deterministically", () => {
    const withDuplicate = `${LIBRARY_HOTEL_CONTENT}\n${OCLC_SENTENCE}`;
    const out = subtractAdmittedWikipediaSpans(withDuplicate, [
      claim(OCLC_SENTENCE),
    ]);
    expect(out).not.toContain(OCLC_SENTENCE);
    expect(out.split("OCLC").length - 1).toBe(1); // only the unclaimed follow-up sentence's "OCLC" remains
  });

  it("skips a span with no sentence-final punctuation", () => {
    const fragment = "the hotel owners were sued in 2003 by OCLC";
    const out = subtractAdmittedWikipediaSpans(LIBRARY_HOTEL_CONTENT, [
      claim(fragment),
    ]);
    expect(out).toContain(OCLC_SENTENCE);
  });
});
