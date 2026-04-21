import { useEffect, useRef } from "react";

import { useFeedback } from "@/contexts/FeedbackContext";
import { useWalkMode } from "@/contexts/WalkModeContext";

/**
 * Bridges live walk/narration state into the feedback snapshot. Lives inside
 * FeedbackProvider (which sits below WalkModeProvider in the tree) so it can
 * read the walk context. Renders nothing.
 *
 * Uses a ref so the snapshot provider is registered exactly once (with a
 * stable identity) — the provider always reads the latest walk state via the
 * ref, avoiding re-registration on every walk-context render.
 */
export function FeedbackBridges() {
  const feedback = useFeedback();
  const walk = useWalkMode();

  const walkRef = useRef(walk);
  walkRef.current = walk;

  useEffect(() => {
    return feedback.registerSnapshotProvider("walk", () => {
      const w = walkRef.current;
      return {
        walkActive: w.isWalking,
        currentPlace: w.narration?.currentPlace ?? null,
        location: w.currentLocation
          ? { lat: w.currentLocation.latitude, lng: w.currentLocation.longitude }
          : null,
        walkStats: w.stats,
      };
    });
  }, [feedback]);

  return null;
}
