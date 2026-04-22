import { useCallback, useEffect, useRef, useState } from "react";

const FALLBACK_LIMIT = 20;
const FALLBACK_WINDOW_MS = 15 * 60 * 1000;
const WARNING_FRACTION = 0.25;
const AUTO_HIDE_MS = 30 * 1000;

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

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

export function useRatingPaceWarning() {
  const timestamps = useRef<number[]>([]);
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

  const recordRating = useCallback(() => {
    const { windowMs, limit } = configRef.current;
    const warningThreshold = Math.max(2, Math.ceil(limit * WARNING_FRACTION));
    const now = Date.now();
    timestamps.current.push(now);
    timestamps.current = timestamps.current.filter((t) => now - t <= windowMs);

    if (timestamps.current.length >= warningThreshold) {
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
