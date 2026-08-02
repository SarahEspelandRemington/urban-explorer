/**
 * Diagnostic-only helpers for the osm-anchor discover funnel log.
 *
 * Pure, side-effect-free. Used to summarize candidate-attrition counts and
 * discoveryTier distribution at various pipeline boundaries so a thin/empty
 * discover response can be diagnosed from logs alone. Does not filter,
 * rank, or otherwise change any place data.
 */

export interface TierDistribution {
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  unclassified: number;
}

/**
 * Counts places by `discoveryTier` (1-4, or unclassified when absent).
 */
export function computeTierDistribution(
  places: Array<{ discoveryTier?: number }>,
): TierDistribution {
  const dist: TierDistribution = {
    tier1: 0,
    tier2: 0,
    tier3: 0,
    tier4: 0,
    unclassified: 0,
  };
  for (const p of places) {
    switch (p.discoveryTier) {
      case 1:
        dist.tier1++;
        break;
      case 2:
        dist.tier2++;
        break;
      case 3:
        dist.tier3++;
        break;
      case 4:
        dist.tier4++;
        break;
      default:
        dist.unclassified++;
        break;
    }
  }
  return dist;
}

export interface FunnelStage {
  name: string;
  count: number;
}

/**
 * Identifies the earliest stage, in pipeline order, where a nonzero count
 * dropped to zero. Once a count reaches zero it cannot decrease further, so
 * the *first* zero-crossing is the actual cause — later stages are never
 * returned even if also zero. Returns undefined when no stage reduced a
 * nonzero count to zero (e.g. the final count is nonzero, or the pool was
 * already zero at the first stage — see terminalReason for that case).
 */
export function findLastEliminatingStage(
  stages: FunnelStage[],
): string | undefined {
  for (let i = 1; i < stages.length; i++) {
    if (stages[i - 1].count > 0 && stages[i].count === 0) {
      return stages[i].name;
    }
  }
  return undefined;
}
