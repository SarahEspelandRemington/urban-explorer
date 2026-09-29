// Isolated experiment only. Deterministic hard validator for the blind
// angle-grouping producer's raw output. Only checks that can be proven
// mechanically — no semantic-entailment subsystem, no second model call.
import type { ProducerInput } from "./types";

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

const NUMBER_RE = /\d[\d,./-]*\d|\d/g;

function extractCapitalizedTokens(text: string): string[] {
  // Multi-word or single-word capitalized sequences, e.g. "Dewey Decimal
  // System", "OCLC", "Ninth Avenue".
  const re = /\b[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*)*\b/g;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const token = match[0];
    const isSingleWord = !token.includes(" ");
    // Position-based (not word-list-based) sentence-initial detection: a
    // single-word capitalized token is treated as an ordinary sentence-
    // initial framing word (e.g. "Rather", "Why", "The"), not a proper noun,
    // only when nothing but whitespace precedes it back to the start of the
    // text or the preceding sentence-ending punctuation. Multi-word
    // capitalized sequences are still flagged even at sentence-initial
    // position, since a genuine multi-word proper noun opening a sentence
    // (e.g. "Ezrath Israel became...") is not a generic framing word.
    if (isSingleWord) {
      const before = text.slice(0, match.index);
      const precedingNonSpace = before.trimEnd();
      const isSentenceInitial =
        precedingNonSpace.length === 0 || /[.!?]$/.test(precedingNonSpace);
      if (isSentenceInitial) continue;
    }
    results.push(token);
  }
  return results;
}

function isSchemaValid(output: unknown): output is {
  subjectId: string;
  angleGroups: Array<{
    subjectId: string;
    angleId: string;
    centralQuestion: string;
    perspectiveShift: string;
    claimIds: string[];
  }>;
  ungroupedClaimIds: string[];
} {
  if (typeof output !== "object" || output === null) return false;
  const o = output as Record<string, unknown>;
  if (typeof o.subjectId !== "string") return false;
  if (!Array.isArray(o.angleGroups)) return false;
  if (!Array.isArray(o.ungroupedClaimIds)) return false;
  if (!o.ungroupedClaimIds.every((id) => typeof id === "string")) return false;
  for (const group of o.angleGroups) {
    if (typeof group !== "object" || group === null) return false;
    const g = group as Record<string, unknown>;
    if (typeof g.subjectId !== "string") return false;
    if (typeof g.angleId !== "string" || g.angleId.length === 0) return false;
    if (typeof g.centralQuestion !== "string" || g.centralQuestion.length === 0)
      return false;
    if (
      typeof g.perspectiveShift !== "string" ||
      g.perspectiveShift.length === 0
    )
      return false;
    if (!Array.isArray(g.claimIds)) return false;
    if (!g.claimIds.every((id) => typeof id === "string")) return false;
  }
  return true;
}

export function validateSubjectAngleGrouping(
  input: ProducerInput,
  rawOutput: unknown,
): ValidationResult {
  const reasons: string[] = [];

  if (!isSchemaValid(rawOutput)) {
    return {
      valid: false,
      reasons: [
        "Output does not match the required SubjectAngleGrouping schema.",
      ],
    };
  }

  const admittedClaimIds = new Set(input.claims.map((c) => c.claimId));
  const claimTextById = new Map(
    input.claims.map((c) => [c.claimId, c.claimText]),
  );

  if (rawOutput.subjectId !== input.subjectId) {
    reasons.push(
      `Output subjectId ("${rawOutput.subjectId}") does not match input subjectId ("${input.subjectId}").`,
    );
  }

  const seenAngleIds = new Set<string>();
  const referencedClaimIds = new Set<string>();

  for (const group of rawOutput.angleGroups) {
    if (!group.angleId) {
      reasons.push("An angleGroup is missing angleId.");
    } else if (seenAngleIds.has(group.angleId)) {
      reasons.push(`Duplicate angleId within subject: "${group.angleId}".`);
    } else {
      seenAngleIds.add(group.angleId);
    }

    if (group.claimIds.length === 0) {
      reasons.push(`AngleGroup "${group.angleId}" has zero claims.`);
    }

    const assignedTexts: string[] = [];
    for (const claimId of group.claimIds) {
      referencedClaimIds.add(claimId);
      if (!admittedClaimIds.has(claimId)) {
        reasons.push(
          `AngleGroup "${group.angleId}" references claimId "${claimId}", which is outside the admitted claim set.`,
        );
      } else {
        assignedTexts.push(claimTextById.get(claimId)!);
      }
    }
    const assignedText = assignedTexts.join(" ");
    const groundingText = `${input.subjectName} ${assignedText}`;

    // Date/number check.
    for (const field of ["centralQuestion", "perspectiveShift"] as const) {
      const text = group[field];
      const numbers = text.match(NUMBER_RE) ?? [];
      for (const num of numbers) {
        if (!groundingText.includes(num)) {
          reasons.push(
            `AngleGroup "${group.angleId}" field "${field}" contains a number/date ("${num}") not present in its assigned claim text or subject name.`,
          );
        }
      }
      // Proper-noun/entity check.
      const entities = extractCapitalizedTokens(text);
      for (const entity of entities) {
        // A trailing possessive ('s) is a grammatical variant, not a new
        // entity — check the bare form too before flagging (e.g. "Spring
        // Garden Street's" is grounded when "Spring Garden Street" is).
        const bareForm = entity.replace(/'s$/, "");
        if (
          !groundingText.includes(entity) &&
          !groundingText.includes(bareForm)
        ) {
          reasons.push(
            `AngleGroup "${group.angleId}" field "${field}" contains an entity/proper noun ("${entity}") not present in its assigned claim text or subject name.`,
          );
        }
      }
    }
  }

  for (const claimId of rawOutput.ungroupedClaimIds) {
    if (!admittedClaimIds.has(claimId)) {
      reasons.push(
        `ungroupedClaimIds references claimId "${claimId}", which is outside the admitted claim set.`,
      );
    }
  }

  const accountedFor = new Set([
    ...referencedClaimIds,
    ...rawOutput.ungroupedClaimIds,
  ]);
  for (const claimId of admittedClaimIds) {
    if (!accountedFor.has(claimId)) {
      reasons.push(
        `Admitted claimId "${claimId}" disappears — it appears in neither any angleGroup nor ungroupedClaimIds.`,
      );
    }
  }

  return { valid: reasons.length === 0, reasons };
}
