import { useState, useEffect } from "react";

/**
 * Returns `true` after `delayMs` milliseconds of continuous pending state,
 * giving the user a reassuring "still loading" hint on slow AI responses.
 *
 * ## When to use
 * Reach for this hook whenever a screen fires a long-running AI mutation and
 * needs to show a secondary message after the initial spinner has been visible
 * for a while. The default delay (10 s) matches the typical AI round-trip
 * budget; lower it only if the operation is expected to finish faster.
 *
 * ## Usage pattern
 * ```tsx
 * const myMutation = useMyAiMutation();
 * const showStillLoading = useStillLoading(myMutation.isPending);
 *
 * // Inside JSX, while myMutation.isPending:
 * {showStillLoading ? (
 *   <Animated.Text entering={FadeInDown.duration(600)}>
 *     {t.myScreen.stillLoading}
 *   </Animated.Text>
 * ) : null}
 * ```
 *
 * The boolean resets to `false` automatically whenever `isPending` flips back
 * to `false`, so there is no cleanup required at the call site.
 *
 * ## Existing call sites
 * - `app/investigate.tsx` — used with `useInvestigateAddress` (discovery flow)
 * - `app/place-detail.tsx` — used with `useGetPlaceDetail` (history enrichment flow)
 */
export function useStillLoading(isPending: boolean, delayMs: number = 10_000): boolean {
  const [showStillLoading, setShowStillLoading] = useState(false);

  useEffect(() => {
    if (isPending) {
      setShowStillLoading(false);
      const timer = setTimeout(() => setShowStillLoading(true), delayMs);
      return () => clearTimeout(timer);
    } else {
      setShowStillLoading(false);
    }
  }, [isPending, delayMs]);

  return showStillLoading;
}
