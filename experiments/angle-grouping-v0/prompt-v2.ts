// Isolated experiment only. Second blind pass — identical to prompt.ts
// EXCEPT for exactly one added paragraph (EDITORIAL THRESHOLD), inserted
// verbatim between RULES and OUTPUT. No other wording changed. No
// place-specific cues added.
import type { ProducerInput } from "./types";

export function buildProducerPromptV2(input: ProducerInput): string {
  const claimsBlock = input.claims
    .map(
      (c, i) =>
        `${i + 1}. claimId: ${c.claimId}\n   claimType: ${c.claimType}\n   claimText: ${JSON.stringify(c.claimText)}`,
    )
    .join("\n\n");

  return `You are drafting "angle groups" for a local-history discovery pipeline. This is a blind experiment: you have not seen and must not guess any "expected" or "calibrated" answer for this subject. Do not search the filesystem, the web, or any tool for information about this subject — reason ONLY from the input given below.

SUBJECT
subjectId: ${input.subjectId}
subjectName: ${input.subjectName}

ADMITTED CLAIMS (this is the complete, exhaustive set of facts that exist for this subject — do not add, invent, or assume any fact beyond these)
${claimsBlock}

DEFINITION
An angle is the smallest coherent cluster of admitted claims that answers one meaningful question about the subject and produces an independently worthwhile perspective shift — a materially different way of understanding the subject, not merely a different topic, date, person, or event label.

RULES
- Zero, one, or several groups are all valid outcomes. Zero groups is an expected, first-class result, not a failure.
- Do not create separate groups merely because claims differ by person, date, era, source, or topic/event label.
- Two groups should exist only when their centralQuestion and perspectiveShift are materially different from each other, independently worthwhile, and non-redundant.
- The same claimId may be referenced by more than one group if it genuinely supports more than one angle.
- Claims may remain ungrouped if they don't rise to their own angle and don't fit any other angle.
- A purely metadata or merely-supporting claim (e.g. bare identity or register-status) should not become its own angle merely because it is present.
- Do not invent historical facts, motives, causes, intentions, dates, entities, or events beyond what is stated in the admitted claims above.
- Do not rewrite, paraphrase-as-new-fact, or alter the claim text itself. You may reference its content in your own centralQuestion/perspectiveShift framing, but every factual assertion in your framing text (including any date, number, name, or entity) must be traceable to the admitted claims for that group or to the subject name above.

A coherent cluster of claims is not automatically a worthwhile angle. Before forming a group, ask: would learning this change how someone understands or experiences the place, or does it mainly confirm what is already visible or expected about it? A cluster that only restates, dates, or formally documents the place's known/visible identity — without revealing something surprising, hidden, causally explanatory, or otherwise perspective-shifting — should not become a standalone angle, even if the claims are well-grounded and internally coherent.

OUTPUT
Return ONLY a single JSON object — no prose, no markdown code fences, no explanation before or after — matching exactly this shape:
{
  "subjectId": string,
  "angleGroups": [
    {
      "subjectId": string,
      "angleId": string,
      "centralQuestion": string,
      "perspectiveShift": string,
      "claimIds": string[]
    }
  ],
  "ungroupedClaimIds": string[]
}

Every claimId listed above must appear in exactly one of: at least one angleGroup's claimIds, or ungroupedClaimIds (or both, if it genuinely supports a group but you still want to leave it enumerated — but at minimum it must appear somewhere). Do not drop any claimId. If you conclude zero angles are warranted, return "angleGroups": [] and list every claimId in "ungroupedClaimIds".`;
}
