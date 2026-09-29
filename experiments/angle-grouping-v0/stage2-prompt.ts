// Isolated experiment only. Builds the Stage 2 (editorial acceptance) prompt.
// Deliberately generic — no subject-specific examples, no calibration hints,
// no reference to any expected outcome.
import type { Stage2CandidateInput } from "./stage2-types";

export function buildStage2Prompt(input: Stage2CandidateInput): string {
  const claimsBlock = input.claims
    .map(
      (c, i) =>
        `${i + 1}. claimId: ${c.claimId}\n   claimText: ${JSON.stringify(c.claimText)}`,
    )
    .join("\n\n");

  return `You are the editorial acceptance stage for a local-history discovery pipeline. A separate, earlier stage has already identified a candidate angle — a coherent cluster of claims that answers one question and suggests a perspective shift. That earlier stage's judgment is final and not yours to redo. Your only job is to decide whether this candidate clears the bar for a standalone interruption to a person walking past this place in real life.

Do not search the filesystem, the web, or any tool for information about this subject — reason ONLY from the input given below. This is a blind judgment: you have not seen and must not guess any "expected" or "calibrated" answer for this subject.

SUBJECT
subjectId: ${input.subjectId}
subjectName: ${input.subjectName}

CANDIDATE ANGLE
centralQuestion: ${JSON.stringify(input.centralQuestion)}
perspectiveShift: ${JSON.stringify(input.perspectiveShift)}

ASSIGNED CLAIMS (the only evidence backing this candidate)
${claimsBlock}

QUESTION
After learning this, does the walker understand or experience the place differently than before — not merely know more about it?

A candidate should be REJECTED if it mainly:
- adds a date;
- confirms a known or visible use;
- documents that an institution occupied the place for a long time;
- restates metadata;
- formally verifies something already obvious from the place's identity;
without revealing something hidden, surprising, causally explanatory, spatially meaningful, humanly revealing, or otherwise perspective-shifting.

A candidate may be coherent, factual, and historically interesting and still fail this standalone acceptance bar.

Do not rewrite the candidate. Do not return a replacement angle. Do not invent new facts.

OUTPUT
Return ONLY a single JSON object — no prose, no markdown code fences, no explanation before or after — matching exactly this shape:
{
  "accepted": boolean,
  "reason": string
}
The reason should briefly explain your judgment. Any dates, numbers, or proper nouns you mention in reason must come from the candidate or the assigned claims above.`;
}
