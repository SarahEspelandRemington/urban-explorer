// Backwards-compatible shim. The full translations live in `./i18n`.
// Existing modules that only need notification strings still import from here.
import {
  DEFAULT_LOCALE,
  LOCALES,
  type LocaleMeta,
  getLocaleMeta,
} from "./i18n";

export type NotificationLocale = LocaleMeta;

export const NOTIFICATION_LOCALES: NotificationLocale[] = LOCALES;
export const DEFAULT_NOTIFICATION_LOCALE = DEFAULT_LOCALE;

export function getNotificationLocale(code: string): NotificationLocale {
  return getLocaleMeta(code);
}
