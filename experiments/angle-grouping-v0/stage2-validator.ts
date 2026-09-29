// Isolated experiment only. Deterministic hard validator for Stage 2
// (editorial acceptance) raw output. Deliberately minimal — schema check,
// boolean/non-empty checks, and a mechanical date/number/proper-noun
// grounding check on `reason` only. No semantic-entailment subsystem, no
// second model call. Kept fully separate from validator.ts (Stage 1) so
// Stage 1's file is not touched by this task.
import type { Stage2CandidateInput } from "./stage2-types";

export interface Stage2ValidationResult {
  valid: boolean;
  reasons: string[];
}

const NUMBER_RE = /\d[\d,./-]*\d|\d/g;

function extractCapitalizedTokens(text: string): string[] {
  const re = /\b[A-Z][a-zA-Z'’-]*(?:\s+[A-Z][a-zA-Z'’-]*)*\b/g;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const token = match[0];
    const isSingleWord = !token.includes(" ");
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

function isStage2SchemaValid(
  output: unknown,
): output is { accepted: boolean; reason: string } {
  if (typeof output !== "object" || output === null) return false;
  const o = output as Record<string, unknown>;
  if (typeof o.accepted !== "boolean") return false;
  if (typeof o.reason !== "string" || o.reason.length === 0) return false;
  return true;
}

export function validateStage2Output(
  input: Stage2CandidateInput,
  rawOutput: unknown,
): Stage2ValidationResult {
  if (!isStage2SchemaValid(rawOutput)) {
    return {
      valid: false,
      reasons: [
        "Output does not match the required { accepted: boolean; reason: string } schema.",
      ],
    };
  }

  const reasons: string[] = [];
  const groundingText = [
    input.subjectName,
    input.centralQuestion,
    input.perspectiveShift,
    ...input.claims.map((c) => c.claimText),
  ].join(" ");

  const numbers = rawOutput.reason.match(NUMBER_RE) ?? [];
  for (const num of numbers) {
    if (!groundingText.includes(num)) {
      reasons.push(
        `Field "reason" contains a number/date ("${num}") not present in the candidate or assigned claim text.`,
      );
    }
  }

  const entities = extractCapitalizedTokens(rawOutput.reason);
  for (const entity of entities) {
    // A trailing possessive ('s or 's) is a grammatical variant, not a new
    // entity — check the bare form too before flagging (e.g. "Spring
    // Garden Street's" is grounded when "Spring Garden Street" is).
    const bareForm = entity.replace(/['’]s$/, "");
    if (!groundingText.includes(entity) && !groundingText.includes(bareForm)) {
      reasons.push(
        `Field "reason" contains an entity/proper noun ("${entity}") not present in the candidate or assigned claim text.`,
      );
    }
  }

  return { valid: reasons.length === 0, reasons };
}
