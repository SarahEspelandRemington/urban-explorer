import { describe, it, expect } from "vitest";
import { validateNarrationAngle } from "../routes/explore/index";

// Behavioral regression tests for the angle validator's subject-identity
// grounding exemption (maskNarrationAngleSubjectIdentity, wired into
// checkNarrationAngleGrounding/validateNarrationAngle in
// routes/explore/index.ts). validateNarrationAngle is pure/synchronous (no
// network or LLM call), so these call the real exported function directly
// -- no mocking required, unlike the OpenAI-call-based angle generator
// tests elsewhere.

function units(pairs: [string, string][]): Map<string, string> {
  return new Map(pairs);
}

describe("narration angle validator — subject-identity grounding exemption", () => {
  // Shared fixture for the Film Center Building cases: real-shaped evidence
  // units that never restate the subject's own full name verbatim --
  // exactly the production failure condition.
  const filmCenterUnits = units([
    [
      "u1",
      "It was completed in 1929 and designed by Ely Jacques Kahn in the Art Deco style.",
    ],
    [
      "u2",
      "The lobby features a dramatic polychrome tile and marble design meant to impress visiting film executives.",
    ],
  ]);
  const filmCenterPerspectiveShift =
    "The ornate entrance was not mere decoration -- it was a sales pitch aimed at the film executives Film Center Building depended on as tenants.";

  it("1. exact canonical placeName passes without needing citation", () => {
    const result = validateNarrationAngle(
      {
        central_question:
          "Why would Film Center Building need such a theatrical lobby just to house office tenants?",
        perspective_shift: filmCenterPerspectiveShift,
        source_unit_ids: ["u1", "u2"],
      },
      filmCenterUnits,
      "Film Center Building",
    );
    expect(result.ok).toBe(true);
  });

  it("2. leading 'The' before the canonical name passes", () => {
    const result = validateNarrationAngle(
      {
        central_question:
          "Why would The Film Center Building need such a theatrical lobby?",
        perspective_shift: filmCenterPerspectiveShift,
        source_unit_ids: ["u1", "u2"],
      },
      filmCenterUnits,
      "Film Center Building",
    );
    expect(result.ok).toBe(true);
  });

  it("3. possessive form of the canonical name passes", () => {
    const result = validateNarrationAngle(
      {
        central_question:
          "What does Film Center Building's ornate lobby reveal about its original tenants?",
        perspective_shift: filmCenterPerspectiveShift,
        source_unit_ids: ["u1", "u2"],
      },
      filmCenterUnits,
      "Film Center Building",
    );
    expect(result.ok).toBe(true);
  });

  it("4. an unrelated, uncited proper noun still fails", () => {
    const result = validateNarrationAngle(
      {
        central_question:
          "Why does the Orthodox community still gather near here?",
        perspective_shift: filmCenterPerspectiveShift,
        source_unit_ids: ["u1", "u2"],
      },
      filmCenterUnits,
      "Film Center Building",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("ungrounded_token:Orthodox");
  });

  it("5. a fragment of the subject's own name alone does not become exempt", () => {
    const stMalachyUnits = units([
      [
        "u1",
        "It has served the Broadway theater community since the early 20th century.",
      ],
      ["u2", "It has hosted funerals and memorials for numerous performers."],
    ]);
    const result = validateNarrationAngle(
      {
        central_question:
          "Why would a Roman Catholic parish become a backstage tradition?",
        perspective_shift:
          "Decades of memorials for performers turned this sanctuary into an unlikely backstage tradition.",
        source_unit_ids: ["u1", "u2"],
      },
      stMalachyUnits,
      "St. Malachy Roman Catholic Church",
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe("ungrounded_token:Roman Catholic");
  });

  it("6. a different, uncited landmark name still fails", () => {
    const result = validateNarrationAngle(
      {
        central_question:
          "What does the nearby Actors' Temple reveal about this block?",
        perspective_shift: filmCenterPerspectiveShift,
        source_unit_ids: ["u1", "u2"],
      },
      filmCenterUnits,
      "Film Center Building",
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe("ungrounded_token:Actors' Temple");
  });

  it("7. an ordinary proper noun that IS present in the cited units still passes via normal grounding", () => {
    const result = validateNarrationAngle(
      {
        central_question:
          "Why did Ely Jacques Kahn choose such a theatrical lobby?",
        perspective_shift: filmCenterPerspectiveShift,
        source_unit_ids: ["u1", "u2"],
      },
      filmCenterUnits,
      "Film Center Building",
    );
    expect(result.ok).toBe(true);
  });

  it("8. lowercase-connector robustness: a canonical name containing 'of'/'the' masks correctly (token-equality would miss this)", () => {
    const goodShepherdUnits = units([
      [
        "u1",
        "It was built in 1888 to serve longshoremen and their families in the neighborhood.",
      ],
      [
        "u2",
        "Dock workers and their families attended services there for decades.",
      ],
    ]);
    const result = validateNarrationAngle(
      {
        central_question:
          "Why would Church of the Good Shepherd be built so close to the docks?",
        perspective_shift:
          "Its location by the waterfront reflects the needs of dock workers and their families who worshipped there.",
        source_unit_ids: ["u1", "u2"],
      },
      goodShepherdUnits,
      "Church of the Good Shepherd",
    );
    expect(result.ok).toBe(true);
  });
});
