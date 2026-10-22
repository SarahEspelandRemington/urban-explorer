/**
 * Loads a saved request-level fixture (read-only input) and converts it
 * into the exact CopyGenRequestParams shape buildCopyGenRequest expects.
 * No network/DB access, no live OSM/Wikipedia selection — fixtures are
 * frozen inputs only.
 */
import { readFileSync } from "node:fs";
import type { CopyGenRequestParams } from "../../artifacts/api-server/src/lib/copyGenRequestBuilder";
import type { EvalFixture } from "./fixtureTypes";

export function loadFixture(path: string): EvalFixture {
  const raw = JSON.parse(readFileSync(path, "utf8")) as EvalFixture;
  if (!raw.name || typeof raw.name !== "string") {
    throw new Error(`Fixture at ${path} is missing a string "name" field.`);
  }
  if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) {
    throw new Error(
      `Fixture at ${path} must have a non-empty "candidates" array.`,
    );
  }
  return raw;
}

export function fixtureToRequestParams(
  fixture: EvalFixture,
): CopyGenRequestParams {
  return {
    candidates: fixture.candidates,
    wikiMap: new Map(Object.entries(fixture.wiki ?? {})),
    selectorEnhancedWikiContent: new Map(
      Object.entries(fixture.selectorEnhancedWikiContent ?? {}),
    ),
    selectorSingleUnitOsmIds: new Set(fixture.selectorSingleUnitOsmIds ?? []),
    locationHint: fixture.locationHint,
  };
}
