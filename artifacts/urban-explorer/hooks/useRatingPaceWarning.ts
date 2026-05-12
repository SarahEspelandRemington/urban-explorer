import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE } from "@/lib/apiBase";

const FALLBACK_LIMIT = 20;
const FALLBACK_WINDOW_MS = 15 * 60 * 1000;
const WARNING_FRACTION = 0.25;
const AUTO_HIDE_MS = 30 * 1000;

interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

async function fetchRateLimitConfig(): Promise<RateLimitConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/explore/rate-limit-config`);
    if (!res.ok) throw new Error("non-ok response");
    const data = (await res.json()) as RateLimitConfig;
    if (typeof data.windowMs === "number" && typeof data.limit === "number") {
      return data;
    }
    throw new Error("unexpected shape");
  } catch {
    return { windowMs: FALLBACK_WINDOW_MS, limit: FALLBACK_LIMIT };
  }
}

// Module-level shared timestamps so ratings accumulate across all screens.
const sharedTimestamps: number[] = [];
type Listener = () => void;
const listeners = new Set<Listener>();

function recordSharedRating(): void {
  const now = Date.now();
  sharedTimestamps.push(now);
  // Prune using the fallback (largest) window to keep enough data for all instances.
  const cutoff = now - FALLBACK_WINDOW_MS;
  while (sharedTimestamps.length > 0 && sharedTimestamps[0] < cutoff) {
    sharedTimestamps.shift();
  }
  listeners.forEach((fn) => fn());
}

function getRecentCount(windowMs: number): number {
  const now = Date.now();
  return sharedTimestamps.filter((t) => now - t <= windowMs).length;
}

export function useRatingPaceWarning() {
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const configRef = useRef<RateLimitConfig>({
    windowMs: FALLBACK_WINDOW_MS,
    limit: FALLBACK_LIMIT,
  });

  useEffect(() => {
    let cancelled = false;
    fetchRateLimitConfig().then((cfg) => {
      if (!cancelled) {
        configRef.current = cfg;
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const checkAndWarn = useCallback(() => {
    const { windowMs, limit } = configRef.current;
    const warningThreshold = Math.max(2, Math.ceil(limit * WARNING_FRACTION));
    if (getRecentCount(windowMs) >= warningThreshold) {
      setShowWarning(true);
      scheduleHide();
    }
  }, [scheduleHide]);

  useEffect(() => {
    listeners.add(checkAndWarn);
    return () => {
      listeners.delete(checkAndWarn);
      clearHideTimer();
    };
  }, [checkAndWarn, clearHideTimer]);

  const recordRating = useCallback(() => {
    recordSharedRating();
  }, []);

  const dismissWarning = useCallback(() => {
    clearHideTimer();
    setShowWarning(false);
  }, [clearHideTimer]);

  return { showWarning, recordRating, dismissWarning };
}
