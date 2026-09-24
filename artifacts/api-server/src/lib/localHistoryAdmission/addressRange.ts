/**
 * Numeric address-range overlap utility for the Streetlit local-history
 * admission engine.
 *
 * Promoted (faithful port) from the generic AddressRange/rangesOverlap pair
 * in experiments/hybrid-discovery-v0.1/baldwinpark/baldwinParkMatcher.ts —
 * that file's remaining contents (Spring Garden corridor mention-scanning,
 * page-dominance matching) are Baldwin-Park-specific and stay experimental.
 * AddressRange/rangesOverlap themselves are street-name-agnostic and are
 * shared production-side by narrativeExtractor.ts for cross-source address
 * disambiguation (deciding whether a mentioned house-number range plausibly
 * refers to the same target address, including same-side-of-street parity).
 */

export interface AddressRange {
  low: number;
  high: number;
}

function rangeParity(low: number, high: number): "odd" | "even" | "mixed" {
  const lowOdd = low % 2 === 1;
  const highOdd = high % 2 === 1;
  if (lowOdd !== highOdd) return "mixed";
  return lowOdd ? "odd" : "even";
}

/** Don't invent a parity assumption for a mixed range — just allow the overlap. */
export function rangesOverlap(a: AddressRange, b: AddressRange): boolean {
  if (a.high < b.low || a.low > b.high) return false;
  const aParity = rangeParity(a.low, a.high);
  const bParity = rangeParity(b.low, b.high);
  if (aParity === "mixed" || bParity === "mixed") return true;
  return aParity === bParity;
}
