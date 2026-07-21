/**
 * Encapsulates the synchronous stop-ordering for ending a walk.
 *
 * isWalkingRef.current is set to false before narrationStop() runs, so any
 * async closure or late-firing React effect that guards on isWalkingRef
 * cannot act as if the walk were still active once this returns.
 *
 * narrationStop() (narration.stop() in useNarration.ts) tears down the
 * active audio player via teardownActive(), which also clears the player's
 * iOS lock-screen registration (setActiveForLockScreen(false)) — lock-screen
 * cleanup is owned by the player lifecycle, not a separate step here.
 */

export interface StopWalkSyncDeps {
  isWalkingRef: { current: boolean };
  narrationStop: () => void;
}

export function executeStopWalkSync(deps: StopWalkSyncDeps): void {
  deps.isWalkingRef.current = false;
  deps.narrationStop();
}
