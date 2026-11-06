// Wraps curatedLocalHistory.ts's getApprovedOsmSubjectIds() — the list of
// OSM-ref subjectIds with an approved curated entry, which
// fetchApprovedOsmSubjects (production) uses to rescue tag-sparse elements
// that fail every normal selector clause. Cross-package relative import
// into artifacts/api-server/src/lib is an established pattern in this repo
// (see tools/prompt-eval's imports of copyGenRequestBuilder.ts/
// claimWorthiness.ts). getApprovedOsmSubjectIds has no DB/env/runtime
// dependency — confirmed by reading curatedLocalHistory.ts's own imports.
import { getApprovedOsmSubjectIds } from "../../artifacts/api-server/src/lib/curatedLocalHistory";

// Approved-rescue subjectIds look like "way/123456789" / "node/987" /
// "relation/42" — the same join-key shape as OSMPlace's osmId. This parses
// one into the (osmType, osmId) pair the importer needs to match against
// parsed OPL elements.
const SUBJECT_ID_RE = /^(node|way|relation)\/(\d+)$/;

export interface ApprovedRescueTarget {
  osmType: "node" | "way" | "relation";
  osmId: string;
}

export function getApprovedRescueTargets(): ApprovedRescueTarget[] {
  const ids = getApprovedOsmSubjectIds();
  const targets: ApprovedRescueTarget[] = [];
  for (const id of ids) {
    const m = SUBJECT_ID_RE.exec(id);
    if (!m) continue; // getApprovedOsmSubjectIds already filters by this shape, but stay defensive
    targets.push({
      osmType: m[1] as ApprovedRescueTarget["osmType"],
      osmId: m[2],
    });
  }
  return targets;
}
