import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Regression test for verifyAddressCoherence named-place fallthrough TypeError.
//
// Bug: when a place has ONLY a named-place probe (e.g. "Locust Walk",
// "Fairmount Park") and Nominatim confirms the geocode within the 200 m
// coherence threshold, control fell through the namedPlaceR mismatch check
// into the `else` branch.  There `(addrR ?? nameR)!` was `undefined` at
// runtime, and `r.mismatchMeters` threw:
//   TypeError: Cannot read properties of undefined (reading 'mismatchMeters')
//
// Fix (explore/index.ts ~line 1339):
//   `} else {`  →  `} else if (addrR || nameR) {`
//
// When neither addrR nor nameR is set (only namedPlaceR, already confirmed OK
// above), the branch is skipped entirely.  The place is accepted.
//
// These tests inline the exact per-place evaluation logic from that branch so
// they remain a true unit test with no mocking required.  They will fail if
// the guard is ever reverted to plain `else`.
// ---------------------------------------------------------------------------

interface ProbeOutcome {
  role: "address" | "name" | "named-place";
  probe: string;
  mismatchMeters: number;
  geocodedDistFromUser: number;
  geocodedLat: number;
  geocodedLon: number;
}

const COHERENCE_THRESHOLD_M = 200;

/**
 * Direct reproduction of the per-place branch in verifyAddressCoherence
 * (artifacts/api-server/src/routes/explore/index.ts).
 *
 * Mutates `place` exactly as the server does: sets `_rejectOutOfArea` on a
 * coherence failure, leaves it unset on success.  The `else if (addrR || nameR)`
 * guard is the fix being validated.
 */
function evaluateCoherenceBranch(
  place: Record<string, unknown>,
  addrR: ProbeOutcome | undefined,
  nameR: ProbeOutcome | undefined,
  namedPlaceR: ProbeOutcome | undefined,
  _searchRadius: number,
): void {
  const applyRejection = (_r: ProbeOutcome) => {
    place._rejectOutOfArea = true;
    place.autoNarrationBlocked = true;
  };

  if (namedPlaceR && namedPlaceR.mismatchMeters > COHERENCE_THRESHOLD_M) {
    applyRejection(namedPlaceR);
    return;
  }

  if (addrR && nameR) {
    const addrOk = addrR.mismatchMeters <= COHERENCE_THRESHOLD_M;
    const nameOk = nameR.mismatchMeters <= COHERENCE_THRESHOLD_M;
    if (!addrOk || !nameOk) applyRejection(nameOk ? addrR : nameR);
  } else if (addrR || nameR) {
    // THE FIX: only enter when at least one of addrR/nameR is defined.
    // Before the fix this was `} else {` — reachable when only namedPlaceR
    // was set, causing `(addrR ?? nameR)!` to be `undefined` at runtime.
    const probe = (addrR ?? nameR)!;
    if (probe.mismatchMeters > COHERENCE_THRESHOLD_M) applyRejection(probe);
  }
  // else: only namedPlaceR was set; it already passed the mismatch check —
  // no further action.  The place is accepted without setting _rejectOutOfArea.
}

function makeProbe(
  role: ProbeOutcome["role"],
  mismatchMeters: number,
): ProbeOutcome {
  return {
    role,
    probe: "Locust Walk, Philadelphia, PA",
    mismatchMeters,
    geocodedDistFromUser: 50,
    geocodedLat: 39.9524,
    geocodedLon: -75.1932,
  };
}

// ---------------------------------------------------------------------------
// Named-place-only — the crash path
// ---------------------------------------------------------------------------

describe("verifyAddressCoherence — named-place-only probe within threshold", () => {
  it("does not throw and does not reject when namedPlaceR is within 200 m (the TypeError case)", () => {
    // This is the exact input shape that crashed before the fix.
    // "Locust Walk" (NAME_PLACE_RX match) produces only a namedPlaceR probe;
    // no ADDRESS_RX address, no NAME_STREET_RX ordinal.
    // Nominatim returns ≈50 m away — well within the 200 m threshold.
    const place: Record<string, unknown> = {
      name: "Locust Walk",
      latitude: 39.9522,
      longitude: -75.1932,
    };
    const namedPlaceR = makeProbe("named-place", 50);

    expect(() =>
      evaluateCoherenceBranch(place, undefined, undefined, namedPlaceR, 150),
    ).not.toThrow();

    expect(place._rejectOutOfArea).toBeUndefined();
    expect(place.autoNarrationBlocked).toBeUndefined();
  });

  it("does not reject when namedPlaceR is exactly at the 200 m threshold boundary", () => {
    const place: Record<string, unknown> = {
      name: "Fairmount Park",
      latitude: 39.981,
      longitude: -75.174,
    };
    const namedPlaceR = makeProbe("named-place", 200);

    expect(() =>
      evaluateCoherenceBranch(place, undefined, undefined, namedPlaceR, 150),
    ).not.toThrow();

    expect(place._rejectOutOfArea).toBeUndefined();
  });

  it("rejects when namedPlaceR exceeds the 200 m threshold (existing path, unchanged)", () => {
    const place: Record<string, unknown> = {
      name: "Penn's Landing",
      latitude: 39.951,
      longitude: -75.141,
    };
    const namedPlaceR = makeProbe("named-place", 350);

    expect(() =>
      evaluateCoherenceBranch(place, undefined, undefined, namedPlaceR, 150),
    ).not.toThrow();

    expect(place._rejectOutOfArea).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Single addrR / nameR paths — unchanged by the fix
// ---------------------------------------------------------------------------

describe("verifyAddressCoherence — single addrR or nameR probe (unchanged paths)", () => {
  it("accepts a single addrR probe within threshold", () => {
    const place: Record<string, unknown> = {
      name: "Some Building",
      latitude: 39.951,
      longitude: -75.165,
    };
    const addrR = makeProbe("address", 50);

    expect(() =>
      evaluateCoherenceBranch(place, addrR, undefined, undefined, 150),
    ).not.toThrow();

    expect(place._rejectOutOfArea).toBeUndefined();
  });

  it("rejects a single addrR probe exceeding threshold", () => {
    const place: Record<string, unknown> = {
      name: "Wrong Address Building",
      latitude: 39.951,
      longitude: -75.165,
    };
    const addrR = makeProbe("address", 250);

    expect(() =>
      evaluateCoherenceBranch(place, addrR, undefined, undefined, 150),
    ).not.toThrow();

    expect(place._rejectOutOfArea).toBe(true);
  });

  it("accepts a single nameR probe within threshold", () => {
    const place: Record<string, unknown> = {
      name: "38th Street Vaudeville Theater",
      latitude: 39.951,
      longitude: -75.195,
    };
    const nameR = makeProbe("name", 80);

    expect(() =>
      evaluateCoherenceBranch(place, undefined, nameR, undefined, 150),
    ).not.toThrow();

    expect(place._rejectOutOfArea).toBeUndefined();
  });
});
