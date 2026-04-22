import { useCallback, useEffect, useRef, useState } from "react";

const WARNING_THRESHOLD = 5;
const TRACKING_WINDOW_MS = 2 * 60 * 1000;
const AUTO_HIDE_MS = 30 * 1000;

export function useRatingPaceWarning() {
  const timestamps = useRef<number[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      setShowWarning(false);
    }, AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const recordRating = useCallback(() => {
    const now = Date.now();
    timestamps.current.push(now);
    timestamps.current = timestamps.current.filter(
      (t) => now - t <= TRACKING_WINDOW_MS,
    );

    if (timestamps.current.length >= WARNING_THRESHOLD) {
      setShowWarning(true);
      scheduleHide();
    }
  }, [scheduleHide]);

  const dismissWarning = useCallback(() => {
    clearHideTimer();
    setShowWarning(false);
  }, [clearHideTimer]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  return { showWarning, recordRating, dismissWarning };
}
