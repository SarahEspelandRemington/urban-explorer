import AsyncStorage from "@react-native-async-storage/async-storage";
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
  DEFAULT_NOTIFICATION_LOCALE,
  NOTIFICATION_LOCALES,
  getNotificationLocale,
  type NotificationLocale,
} from "@/lib/notificationLocales";

const STORAGE_KEY = "urban-explorer.notificationLocale";

interface LocaleContextType {
  locale: string;
  localeRef: React.MutableRefObject<string>;
  setLocale: (code: string) => Promise<void>;
  availableLocales: NotificationLocale[];
  resolved: NotificationLocale;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<string>(DEFAULT_NOTIFICATION_LOCALE);
  // Mirror in a ref so non-reactive consumers (e.g. the WalkModeProvider's
  // startWalk closure) can read the latest value without forcing a re-render
  // on every locale change.
  const localeRef = useRef<string>(DEFAULT_NOTIFICATION_LOCALE);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored && NOTIFICATION_LOCALES.some((l) => l.code === stored)) {
          localeRef.current = stored;
          setLocaleState(stored);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (code: string) => {
    if (!NOTIFICATION_LOCALES.some((l) => l.code === code)) return;
    localeRef.current = code;
    setLocaleState(code);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, code);
    } catch {}
  }, []);

  const value = useMemo<LocaleContextType>(
    () => ({
      locale,
      localeRef,
      setLocale,
      availableLocales: NOTIFICATION_LOCALES,
      resolved: getNotificationLocale(locale),
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
