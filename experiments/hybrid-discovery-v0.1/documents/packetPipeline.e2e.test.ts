/**
 * End-to-end fixture (implementation step 2, item 6): proves the
 * DocumentEvidencePacket sidecar is not merely a set of independently-passing
 * modules, by running one synthetic packet through the ACTUAL shared path:
 *
 *   projectPacketBlocks (experiments, scope-eligibility only)
 *     -> real production extractNarrativeClaims (per eligible block)
 *     -> real production runPipeline (runChecks + groundClaim + decideClaim)
 *     -> real production evaluateDiscoveryWorthiness
 *
 * Fixture composition:
 * - 2 eligible resource-entry blocks for the same resource ("res-a"), from
 *   two different authorship roles (commission-staff, consultant-preparer),
 *   one of which repeats the OTHER block's sentence verbatim — proving
 *   provenance/back-mapping (packetClaimProvenance.ts) is block-local, not a
 *   whole-document substring search (see packetClaimProvenance.test.ts for
 *   the isolated proof; this file re-confirms it in the full pipeline
 *   context).
 * - 3 ineligible blocks (district-narrative scope; undeterminable scope;
 *   resource-entry with no resourceRef in a multi-resource packet) that must
 *   never reach extractNarrativeClaims at all.
 *
 * No shared production behavior is reimplemented here merely to make this
 * fixture pass — extractNarrativeClaims, runPipeline, and
 * evaluateDiscoveryWorthiness are the real, unmodified production functions.
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts.
 */
import { describe, expect, it } from "vitest";
import { projectPacketBlocks } from "./packetProjection";
import { buildSyntheticSourcesForPacket } from "./documentSourceSplit";
import { recordClaimProvenance } from "./packetClaimProvenance";
import type {
  DocumentBlock,
  DocumentEvidencePacket,
} from "./documentEvidencePacket";
import { FROZEN_BORN_DIGITAL_PDF_ACQUISITION } from "./acquisitionMetadata";
import { extractNarrativeClaims } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/narrativeExtractor";
import { runPipeline } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/pipeline";
import { evaluateDiscoveryWorthiness } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/worthiness";
import type {
  Claim,
  Source,
} from "../../../artifacts/api-server/src/lib/localHistoryAdmission/types";

const DUPLICATE_SENTENCE = "The Rothacker Brewery was built in 1859.";

const blockA: DocumentBlock = {
  blockId: "block-a",
  page: 4,
  scope: "resource-entry",
  resourceRef: "res-a",
  authorshipRole: "commission-staff",
  text: `${DUPLICATE_SENTENCE} Architect John Notman designed its facade.`,
  acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
};

const blockB: DocumentBlock = {
  blockId: "block-b",
  page: 9,
  scope: "resource-entry",
  resourceRef: "res-a",
  authorshipRole: "consultant-preparer",
  text: DUPLICATE_SENTENCE,
  acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
};

const districtBlock: DocumentBlock = {
  blockId: "block-district",
  scope: "district-narrative",
  resourceRef: "res-a",
  authorshipRole: "applicant",
  text: "The district as a whole grew rapidly as a brewing center after 1850.",
  acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
};

const undeterminableBlock: DocumentBlock = {
  blockId: "block-undeterminable",
  scope: "undeterminable",
  authorshipRole: "unknown",
  text: "An ambiguous passage of uncertain scope.",
  acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
};

const missingRefBlock: DocumentBlock = {
  blockId: "block-missing-ref",
  scope: "resource-entry",
  authorshipRole: "commission-staff",
  text: "This passage does not specify which resource it describes.",
  acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
};

function makePacket(): DocumentEvidencePacket {
  return {
    schemaVersion: 1,
    packetId: "pkt-e2e-1",
    documentTitle: "Rothacker Brewery Nomination",
    jurisdiction: "Test Jurisdiction",
    cardinality: "multi-resource",
    resources: [
      {
        resourceId: "res-a",
        resourceLabel: "Rothacker Brewery",
        locationEvidence: { address: "2301 Fairmount Avenue" },
      },
      { resourceId: "res-b", resourceLabel: "Other Building" },
    ],
    rootProvenanceId: "pkt-e2e-1-root",
    blocks: [
      blockA,
      blockB,
      districtBlock,
      undeterminableBlock,
      missingRefBlock,
    ],
  };
}

describe("packet end-to-end: projection -> real extractor -> real pipeline -> real worthiness", () => {
  const packet = makePacket();
  const { eligibleBlocks, scopeExcluded } = projectPacketBlocks(packet);

  it("projects exactly the 2 resource-entry blocks as eligible and excludes the other 3, never dropping either side", () => {
    expect(eligibleBlocks.map((e) => e.block.blockId).sort()).toEqual(
      ["block-a", "block-b"].sort(),
    );
    expect(scopeExcluded.map((e) => e.block.blockId).sort()).toEqual(
      ["block-district", "block-missing-ref", "block-undeterminable"].sort(),
    );
  });

  const { rootSource, roleSources } = buildSyntheticSourcesForPacket(packet);
  const staffSource = roleSources["commission-staff"]!;
  const preparerSource = roleSources["consultant-preparer"]!;
  const sources: Record<string, Source> = {
    [rootSource.id]: rootSource,
    [staffSource.id]: staffSource,
    [preparerSource.id]: preparerSource,
  };

  const roleSourceIdForBlock: Record<string, string> = {
    [blockA.blockId]: staffSource.id,
    [blockB.blockId]: preparerSource.id,
  };

  const allClaims: Claim[] = [];
  for (const { block } of eligibleBlocks) {
    const claims = extractNarrativeClaims(
      block.text,
      { streetName: "Fairmount Avenue" },
      {
        placeKey: "res-a",
        address: "2301 Fairmount Avenue",
        title: "Rothacker Brewery",
        proposedIdentityType: "current-osm-entity",
        sourceId: roleSourceIdForBlock[block.blockId],
        claimIdPrefix: `pkt-e2e-1-${block.blockId}`,
        buildClaimText: (sentence) => sentence,
      },
    );
    allClaims.push(...claims);
  }

  it("the real extractNarrativeClaims produces claims ONLY from the 2 eligible blocks (ineligible block text never reaches it)", () => {
    expect(allClaims.length).toBeGreaterThan(0);
    for (const claim of allClaims) {
      expect(districtBlock.text).not.toContain(claim.supportingSpan);
      expect(claim.supportingSpan).not.toBe(undeterminableBlock.text);
      expect(claim.supportingSpan).not.toBe(missingRefBlock.text);
    }
  });

  it("produces one construction-date claim per block for the duplicated sentence, correctly back-mapped to its own originating block (not a whole-document search)", () => {
    const duplicateClaims = allClaims.filter(
      (c) => c.supportingSpan === DUPLICATE_SENTENCE,
    );
    expect(duplicateClaims.length).toBe(2);

    const [claimFromA] = duplicateClaims.filter((c) =>
      c.sourceIds.includes(staffSource.id),
    );
    const [claimFromB] = duplicateClaims.filter((c) =>
      c.sourceIds.includes(preparerSource.id),
    );
    expect(claimFromA).toBeDefined();
    expect(claimFromB).toBeDefined();

    const provenanceA = recordClaimProvenance(claimFromA, blockA, packet);
    const provenanceB = recordClaimProvenance(claimFromB, blockB, packet);
    expect(provenanceA.blockId).toBe("block-a");
    expect(provenanceB.blockId).toBe("block-b");

    // Contrast: a naive whole-document search resolves the duplicate
    // sentence to only ONE location (block A's), which would misattribute
    // claimFromB if used instead of block-local back-mapping.
    const wholeDocument = blockA.text + "\n\n" + blockB.text;
    const naiveIndex = wholeDocument.indexOf(DUPLICATE_SENTENCE);
    expect(naiveIndex).toBeLessThan(blockA.text.length);
    expect(provenanceB.blockId).not.toBe("block-a");
  });

  it("the real runPipeline AUTO-ADMITs every claim from this packet", () => {
    const outcomes = runPipeline(allClaims, sources);
    expect(outcomes.length).toBe(allClaims.length);
    for (const outcome of outcomes) {
      expect(outcome.decision.decision).toBe("AUTO-ADMIT");
    }
  });

  it("the real evaluateDiscoveryWorthiness finds this resource projectable for discovery", () => {
    const outcomes = runPipeline(allClaims, sources);
    const claimTypes = outcomes.map((o) => o.claim.claimType);
    const worthiness = evaluateDiscoveryWorthiness(claimTypes);
    expect(worthiness.projectableForDiscovery).toBe(true);
  });
});
