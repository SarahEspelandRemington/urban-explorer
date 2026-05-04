/**
 * Walk session callback manager.
 *
 * The module-level `activeLocationCallback` bridges the OS background
 * location task (registered once at module scope) to whichever
 * WalkModeProvider instance is currently hosting an active walk.
 *
 * The critical invariant: a late-arriving stopWalk from session A must
 * never clear the callback that session B already installed.  This is
 * enforced by a compare-and-swap (CAS) — stopWalk only nulls the pointer
 * when it still equals the exact function reference that THIS session put
 * in place.  Extracting the management here makes the CAS testable without
 * spinning up a React component.
 */
import type * as Location from "expo-location";

type LocationCallback = (location: Location.LocationObject) => void;

let activeLocationCallback: LocationCallback | null = null;

/**
 * Install `cb` as the active GPS callback for a new walk session.
 *
 * Returns a `stop` function that removes the callback via CAS: it only
 * nulls `activeLocationCallback` when the pointer still equals the
 * callback THIS call installed.  Calling `stop` on an old session after
 * a new session has already called `install` is therefore safe and
 * idempotent.
 */
export function installSessionCallback(cb: LocationCallback): { stop: () => void } {
  const installed = cb;
  activeLocationCallback = cb;

  return {
    stop() {
      if (activeLocationCallback === installed) {
        activeLocationCallback = null;
      }
    },
  };
}

/**
 * Forward `location` to whatever callback is currently installed.
 * Called by the TaskManager background task and by tests.
 */
export function dispatchLocation(location: Location.LocationObject): void {
  activeLocationCallback?.(location);
}

/**
 * Read the current callback pointer.  Only use this in tests and
 * internal diagnostics — production code should use dispatchLocation.
 */
export function getActiveCallback(): LocationCallback | null {
  return activeLocationCallback;
}

/**
 * Force-clear the pointer.  Only call this in tests between cases to
 * reset module-level state.
 */
export function _resetForTest(): void {
  activeLocationCallback = null;
}
