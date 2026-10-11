/**
 * Shared, city-agnostic scope-eligibility projection for
 * `DocumentEvidencePacket` blocks.
 *
 * Deliberately contains no Philadelphia-specific (or any city-specific)
 * logic — an adapter reports a block's source-native scope only; this
 * module alone decides whether that block may be projected toward a
 * specific property. Ineligible blocks are never silently discarded — they
 * are returned as scope-excluded context for auditability.
 *
 * Offline/non-production, experimental.
 */
import type {
  DocumentBlock,
  DocumentEvidencePacket,
} from "./documentEvidencePacket";

export interface ScopeEligibilityResult {
  eligible: boolean;
  reason: string;
  /** The resource this block is attributed to, when eligible. */
  resourceId?: string;
}

/**
 * Eligibility rules (deterministic, no city-specific logic):
 * - "resource-entry": eligible only for the specific resource its
 *   `resourceRef` identifies. In a multi-resource packet, a missing or
 *   unmatched `resourceRef` is ineligible. In a single-resource packet, a
 *   missing `resourceRef` is unambiguous and implicitly attributed to the
 *   packet's sole resource.
 * - "district-narrative": never eligible at property level, regardless of
 *   cardinality or `resourceRef`.
 * - "document-level": eligible only when the packet is `single-resource`
 *   (attributed to that sole resource) — never eligible in a multi-resource
 *   packet, since "the property" is ambiguous there.
 * - "undeterminable": always ineligible.
 */
export function evaluateBlockScopeEligibility(
  block: DocumentBlock,
  packet: DocumentEvidencePacket,
): ScopeEligibilityResult {
  switch (block.scope) {
    case "district-narrative":
      return {
        eligible: false,
        reason:
          "district-narrative scope never auto-attaches to an individual property.",
      };

    case "undeterminable":
      return {
        eligible: false,
        reason: "undeterminable scope cannot be attributed to any resource.",
      };

    case "document-level": {
      if (packet.cardinality !== "single-resource") {
        return {
          eligible: false,
          reason:
            "document-level scope is property-eligible only for a single-resource packet.",
        };
      }
      const soleResource = packet.resources[0];
      if (!soleResource) {
        return {
          eligible: false,
          reason: "single-resource packet has no declared resource.",
        };
      }
      return {
        eligible: true,
        reason:
          "document-level scope attributed to the packet's sole resource.",
        resourceId: soleResource.resourceId,
      };
    }

    case "resource-entry": {
      if (block.resourceRef) {
        const matched = packet.resources.find(
          (r) => r.resourceId === block.resourceRef,
        );
        if (matched) {
          return {
            eligible: true,
            reason: `resource-entry scope attributed to its own resourceRef "${block.resourceRef}".`,
            resourceId: matched.resourceId,
          };
        }
        return {
          eligible: false,
          reason: `resourceRef "${block.resourceRef}" does not match any resource declared on this packet.`,
        };
      }
      if (
        packet.cardinality === "single-resource" &&
        packet.resources.length === 1
      ) {
        return {
          eligible: true,
          reason:
            "resource-entry scope with no explicit resourceRef implicitly attributed to the packet's sole resource (unambiguous in a single-resource packet).",
          resourceId: packet.resources[0].resourceId,
        };
      }
      return {
        eligible: false,
        reason:
          "resource-entry scope with no valid resourceRef in a multi-resource packet is ineligible.",
      };
    }

    default:
      return { eligible: false, reason: "Unrecognized scope state." };
  }
}

export interface ScopeExcludedBlock {
  block: DocumentBlock;
  reason: string;
}

export interface PacketProjectionResult {
  eligibleBlocks: Array<{ block: DocumentBlock; resourceId: string }>;
  /** Retained as scope-excluded context, never silently discarded or counted as evidence loss. */
  scopeExcluded: ScopeExcludedBlock[];
}

export function projectPacketBlocks(
  packet: DocumentEvidencePacket,
): PacketProjectionResult {
  const eligibleBlocks: PacketProjectionResult["eligibleBlocks"] = [];
  const scopeExcluded: ScopeExcludedBlock[] = [];

  for (const block of packet.blocks) {
    const result = evaluateBlockScopeEligibility(block, packet);
    if (result.eligible && result.resourceId) {
      eligibleBlocks.push({ block, resourceId: result.resourceId });
    } else {
      scopeExcluded.push({ block, reason: result.reason });
    }
  }

  return { eligibleBlocks, scopeExcluded };
}
