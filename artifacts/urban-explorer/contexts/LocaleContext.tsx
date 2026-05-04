import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_LOCALE,
  LOCALES,
  TRANSLATIONS,
  getLocaleMeta,
  getMeasurementSystem,
  getStrings,
  isLocaleCode,
  type LocaleMeta,
  type MeasurementSystem,
  type Strings,
} from "@/lib/i18n";
import { STARTUP_KEYS, getStartupValue } from "@/lib/startupStorage";

const STORAGE_KEY = STARTUP_KEYS.locale;

interface LocaleContextType {
  locale: string;
  localeRef: React.MutableRefObject<string>;
  setLocale: (code: string) => Promise<void>;
  availableLocales: LocaleMeta[];
  resolved: LocaleMeta;
  t: Strings;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

function matchDeviceLocale(
  deviceLocales: ReadonlyArray<{ languageCode: string | null }>,
): string | null {
  for (const entry of deviceLocales) {
    const code = entry.languageCode?.toLowerCase();
    if (!code) continue;
    if (isLocaleCode(code)) {
      return code;
    }
  }
  return null;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const deviceLocales = Localization.useLocales();
  const deviceLocale = useMemo(
    () => matchDeviceLocale(deviceLocales) ?? DEFAULT_LOCALE,
    [deviceLocales],
  );

  // null means "follow the device language". A string means the user has
  // explicitly picked a language and that choice should win over the device.
  const [override, setOverride] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const locale = hydrated && override ? override : deviceLocale;
  // Mirror in a ref so non-reactive consumers (e.g. the WalkModeProvider's
  // startWalk closure) can read the latest value without forcing a re-render
  // on every locale change.
  const localeRef = useRef<string>(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    // Read from the shared multiGet snapshot so cold start only pays for one
    // AsyncStorage round-trip across all providers (vs one per provider).
    getStartupValue(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored && isLocaleCode(stored)) {
          setOverride(stored);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (code: string) => {
    if (!isLocaleCode(code)) return;
    setOverride(code);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, code);
    } catch {}
  }, []);

  const value = useMemo<LocaleContextType>(
    () => ({
      locale,
      localeRef,
      setLocale,
      availableLocales: LOCALES,
      resolved: getLocaleMeta(locale),
      t: getStrings(locale),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

// Convenience hook returning just the translations object so callers can write
// `const t = useT();` and then `t.explore.discover`.
export function useT(): Strings {
  return useLocale().t;
}

// Returns the measurement system ("metric" or "imperial") that should be used
// to render distances and other quantities for the active locale.
export function useMeasurementSystem(): MeasurementSystem {
  return getMeasurementSystem(useLocale().locale);
}

// Re-export for any direct consumers that previously imported the type from
// the locale context module.
export { TRANSLATIONS };
