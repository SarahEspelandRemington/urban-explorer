import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Deterministic, source-text-based regression protection for the
// spatial-relation guard added to all three narration prompts
// (/walk-narration, /walk-narration-audio, /deep-narration). Reads the raw
// route source instead of invoking the LLM, per the project rule that
// stochastic LLM-output tests must not be the primary regression
// protection for this kind of prompt-copy constraint.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(__dirname, "../routes/explore/index.ts");
const source = readFileSync(SOURCE_PATH, "utf8");

const ROUTE_BOUNDARY_RE = /router\.(?:post|get)\(/g;

/**
 * Slice out a single route's handler section: from its exact
 * `router.post("<path>"` declaration to the start of the next
 * router.post/get boundary (or EOF). Mirrors the route-splitting logic in
 * scripts/src/lib/promptManifestLib.ts closely enough for test purposes,
 * without depending on that package.
 */
function extractRouteSection(routePath: string): string {
  const marker = `router.post("${routePath}"`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`route marker not found in source: ${marker}`);
  }
  const tail = source.slice(start + marker.length);
  const boundaries = [...tail.matchAll(ROUTE_BOUNDARY_RE)];
  const end =
    boundaries.length > 0
      ? start + marker.length + boundaries[0]!.index!
      : source.length;
  return source.slice(start, end);
}

// Must match the literal text inserted into all three narration prompts.
// Kept as one shared constant here (rather than three copies) so a typo in
// any one prompt causes a test failure instead of three near-identical
// constants silently drifting apart.
const SPATIAL_RELATION_CONSTRAINT_TEXT =
  'SPATIAL-RELATION CONSTRAINT: Do not say the subject is "at the corner of," "across from," "across the street from," "next to," or "adjacent to" anything unless that exact relationship is given to you above as verified anchor data. Never infer a corner, across-from, next-to, or adjacent-to relationship from an address alone, a neighborhood name, "between X and Y" phrasing, nearby-place context, or general knowledge of the area. A neighborhood name may only describe area membership — "in Hell\'s Kitchen," "here in Chelsea" — never a point relation to it, such as "across from Hell\'s Kitchen." A "between X and Y" fact may only describe a between or block relation — "on the block between Broadway and Eighth Avenue" — never a corner claim, such as "at the corner of Broadway and Eighth."';

// Ungated example phrases the guard replaced — none of the three prompts
// should contain any of these again.
const BANNED_PHRASES = [
  "Right at this corner —",
  "Across from the park —",
  "corner of Fifth and Fifty-third",
  "The building across the street —",
];

const ROUTES: Record<string, string> = {
  "walk-narration": "/explore/walk-narration",
  "walk-narration-audio": "/explore/walk-narration-audio",
  "deep-narration": "/explore/deep-narration",
};

describe("narration spatial-relation guard", () => {
  for (const [label, routePath] of Object.entries(ROUTES)) {
    it(`${label} contains the spatial-relation constraint verbatim`, () => {
      const section = extractRouteSection(routePath);
      expect(section).toContain(SPATIAL_RELATION_CONSTRAINT_TEXT);
    });

    it(`${label} does not contain an ungated corner/across-from example`, () => {
      const section = extractRouteSection(routePath);
      for (const phrase of BANNED_PHRASES) {
        expect(section).not.toContain(phrase);
      }
    });
  }

  it("the constraint locks neighborhood and between-X-and-Y context to their weaker forms", () => {
    expect(SPATIAL_RELATION_CONSTRAINT_TEXT).toContain(
      "A neighborhood name may only describe area membership",
    );
    expect(SPATIAL_RELATION_CONSTRAINT_TEXT).toContain(
      'A "between X and Y" fact may only describe a between or block relation',
    );
    // Both weaker forms must explicitly forbid promotion to a corner/across
    // claim, not just describe the allowed form.
    expect(SPATIAL_RELATION_CONSTRAINT_TEXT).toContain(
      "never a point relation to it",
    );
    expect(SPATIAL_RELATION_CONSTRAINT_TEXT).toContain("never a corner claim");
  });
});
