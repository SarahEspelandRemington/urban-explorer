/**
 * Encapsulates the synchronous stop-ordering that is critical for preventing
 * NowPlaying lock-screen widget races.
 *
 * Order matters — and is verified by walkModeStress.test.ts (group 2):
 *   1. isWalkingRef.current = false — guards every async closure that checks it
 *   2. nowPlayingUnsub()            — tear down the remote-command listener
 *   3. nowPlayingClear()            — remove the lock-screen widget immediately
 *   4. narrationStop()              — stop audio playback
 *
 * A late React effect that calls NowPlaying.setNowPlaying will guard on
 * isWalkingRef.current; since we set it false before nowPlayingClear(), the
 * widget can never be re-instated by such an effect after the walk ends.
 */

export interface StopWalkSyncDeps {
  isWalkingRef: { current: boolean };
  nowPlayingUnsub: (() => void) | null;
  nowPlayingClear: () => void;
  narrationStop: () => void;
}

export function executeStopWalkSync(deps: StopWalkSyncDeps): void {
  deps.isWalkingRef.current = false;
  if (deps.nowPlayingUnsub) {
    deps.nowPlayingUnsub();
  }
  deps.nowPlayingClear();
  deps.narrationStop();
}
