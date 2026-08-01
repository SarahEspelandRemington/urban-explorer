/**
 * Integrity gate for OSM-anchor copy-generation results.
 *
 * The LLM copy-generation call is expected to return exactly one result per
 * candidate, with the result's `id` matching the candidate's `osmId`. When
 * the model drops a candidate, it can still return a syntactically valid
 * result whose prose was generated for the dropped candidate but whose
 * remaining entries are otherwise well-formed — there is no reliable way to
 * detect this from prose content alone. Instead, this validates that the
 * set of returned result IDs forms an exact bijection with the set of
 * candidate IDs supplied to the call. If it does not, the caller should
 * reject the entire batch rather than merge any individual result.
 */

export interface CopyResultIntegrity {
  valid: boolean;
  expectedCount: number;
  returnedCount: number;
  missingCount: number;
  duplicateCount: number;
  unexpectedCount: number;
}

export function validateCopyResultIds(
  candidateIds: string[],
  resultIds: string[],
): CopyResultIntegrity {
  const expectedCount = candidateIds.length;
  const returnedCount = resultIds.length;
  const candidateSet = new Set(candidateIds);

  const seen = new Set<string>();
  let duplicateCount = 0;
  let unexpectedCount = 0;
  for (const id of resultIds) {
    if (seen.has(id)) duplicateCount++;
    else seen.add(id);
    if (!candidateSet.has(id)) unexpectedCount++;
  }

  let missingCount = 0;
  for (const id of candidateSet) {
    if (!seen.has(id)) missingCount++;
  }

  const valid =
    expectedCount === returnedCount &&
    missingCount === 0 &&
    duplicateCount === 0 &&
    unexpectedCount === 0;

  return {
    valid,
    expectedCount,
    returnedCount,
    missingCount,
    duplicateCount,
    unexpectedCount,
  };
}
