/**
 * Experiments-only conversion from a `DocumentEvidencePacket`'s blocks to
 * production-shaped synthetic `Source` objects, split one per distinct
 * authorship role actually represented in the packet.
 *
 * All role Sources from one physical document share a single document-level
 * root provenance Source (via production `underlyingProvenanceOf`), so the
 * real production corroboration machinery in checks.ts does not treat
 * authorship-role-split Sources as independent corroboration of each other
 * (see sourceCorroboration.production.test.ts). Capability strength is
 * assigned entirely by the shared authorshipCapability table — never
 * hard-coded here or in a city adapter. Every role Source keeps
 * `sourceClass: "government-preservation-record"` — no new SourceClass.
 *
 * Offline/non-production, experimental.
 */
import type { Source } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/types";
import type {
  AuthorshipRole,
  DocumentEvidencePacket,
} from "./documentEvidencePacket";
import { capabilitiesForAuthorshipRole } from "./authorshipCapability";

export interface SyntheticSourceSplitResult {
  rootSource: Source;
  roleSources: Partial<Record<AuthorshipRole, Source>>;
}

export function buildSyntheticSourcesForPacket(
  packet: DocumentEvidencePacket,
): SyntheticSourceSplitResult {
  const rootSource: Source = {
    id: packet.rootProvenanceId,
    title: packet.documentTitle,
    url: packet.documentUrl,
    sourceClass: "government-preservation-record",
    publicationDate: packet.publicationDate,
    capabilities: [],
  };

  const rolesPresent = new Set<AuthorshipRole>(
    packet.blocks.map((block) => block.authorshipRole),
  );

  const roleSources: Partial<Record<AuthorshipRole, Source>> = {};
  for (const role of rolesPresent) {
    roleSources[role] = {
      id: `${packet.packetId}-role-${role}`,
      title: `${packet.documentTitle} (${role} content)`,
      url: packet.documentUrl,
      sourceClass: "government-preservation-record",
      publicationDate: packet.publicationDate,
      capabilities: capabilitiesForAuthorshipRole(role),
      // The load-bearing link: every role Source from this one physical
      // document points to the same root, so production's
      // resolveRootProvenance/claimProvenanceProfile collapse them to one
      // provenance chain rather than treating them as independent sources.
      underlyingProvenanceOf: [rootSource.id],
    };
  }

  return { rootSource, roleSources };
}
