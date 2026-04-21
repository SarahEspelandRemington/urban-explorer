import Constants from "expo-constants";
import { usePathname } from "expo-router";
import React, { createContext, useCallback, useContext, useMemo, useRef } from "react";

import {
  FEEDBACK_CAPTURE_ENABLED,
  logEvent as bufferLogEvent,
  saveReport as persistReport,
  type FeedbackContextSnapshot,
  type FeedbackReport,
  type Severity,
} from "@/lib/feedback";

interface SnapshotProvider {
  walkActive?: boolean;
  currentPlace?: string | null;
  location?: { lat: number; lng: number; accuracy?: number | null } | null;
  walkStats?: { placesNarrated: number; distanceWalked: number } | null;
}

interface FeedbackContextValue {
  enabled: boolean;
  logEvent: (type: string, data?: Record<string, unknown>) => void;
  registerSnapshotProvider: (key: string, get: () => SnapshotProvider) => () => void;
  captureSnapshot: () => FeedbackContextSnapshot;
  saveReport: (input: { severity: Severity; note: string; audioUri?: string | null; audioDurationMs?: number | null }) => Promise<FeedbackReport>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const providersRef = useRef<Map<string, () => SnapshotProvider>>(new Map());
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const logEvent = useCallback((type: string, data: Record<string, unknown> = {}) => {
    bufferLogEvent(type, data);
  }, []);

  const registerSnapshotProvider = useCallback(
    (key: string, get: () => SnapshotProvider) => {
      providersRef.current.set(key, get);
      return () => {
        providersRef.current.delete(key);
      };
    },
    [],
  );

  const captureSnapshot = useCallback((): FeedbackContextSnapshot => {
    const merged: SnapshotProvider = {};
    for (const get of providersRef.current.values()) {
      try {
        Object.assign(merged, get());
      } catch {}
    }
    return {
      route: pathnameRef.current,
      walkActive: merged.walkActive,
      currentPlace: merged.currentPlace ?? null,
      location: merged.location ?? null,
      walkStats: merged.walkStats ?? null,
      appVersion: Constants.expoConfig?.version ?? undefined,
    };
  }, []);

  const saveReport = useCallback(
    async (input: { severity: Severity; note: string; audioUri?: string | null; audioDurationMs?: number | null }) => {
      const context = captureSnapshot();
      const report = await persistReport({ ...input, context });
      bufferLogEvent("report_saved", { severity: input.severity, hasAudio: !!input.audioUri });
      return report;
    },
    [captureSnapshot],
  );

  const value = useMemo<FeedbackContextValue>(
    () => ({
      enabled: FEEDBACK_CAPTURE_ENABLED,
      logEvent,
      registerSnapshotProvider,
      captureSnapshot,
      saveReport,
    }),
    [logEvent, registerSnapshotProvider, captureSnapshot, saveReport],
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    return {
      enabled: false,
      logEvent: () => {},
      registerSnapshotProvider: () => () => {},
      captureSnapshot: () => ({}),
      saveReport: async () => {
        throw new Error("FeedbackProvider missing");
      },
    };
  }
  return ctx;
}
