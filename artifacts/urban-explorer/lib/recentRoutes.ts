import AsyncStorage from "@react-native-async-storage/async-storage";

export const RECENT_ROUTES_KEY = "recentWalkRoutes";
export const MAX_RECENT_ROUTES = 5;

export interface RecentRoute {
  id: string;
  startText: string;
  endText: string;
  savedAt: number;
  distanceMeters?: number;
  durationSeconds?: number;
}

export async function saveRecentRoute(
  entry: Omit<RecentRoute, "id" | "savedAt"> &
    Partial<Pick<RecentRoute, "id" | "savedAt">>,
): Promise<void> {
  try {
    const route: RecentRoute = {
      id: entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt: entry.savedAt ?? Date.now(),
      startText: entry.startText.trim(),
      endText: entry.endText.trim(),
      distanceMeters: entry.distanceMeters,
      durationSeconds: entry.durationSeconds,
    };
    const raw = await AsyncStorage.getItem(RECENT_ROUTES_KEY);
    const existing: RecentRoute[] = raw ? JSON.parse(raw) : [];
    const deduped = existing.filter(
      (r) =>
        r.startText.toLowerCase() !== route.startText.toLowerCase() ||
        r.endText.toLowerCase() !== route.endText.toLowerCase(),
    );
    const updated = [route, ...deduped].slice(0, MAX_RECENT_ROUTES);
    await AsyncStorage.setItem(RECENT_ROUTES_KEY, JSON.stringify(updated));
  } catch {}
}

export async function loadRecentRoutes(): Promise<RecentRoute[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_ROUTES_KEY);
    if (!raw) return [];
    const parsed: RecentRoute[] = JSON.parse(raw);
    return parsed.slice(0, MAX_RECENT_ROUTES);
  } catch {
    return [];
  }
}

export async function deleteRecentRoute(id: string): Promise<RecentRoute[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_ROUTES_KEY);
    const existing: RecentRoute[] = raw ? JSON.parse(raw) : [];
    const updated = existing.filter((r) => r.id !== id);
    await AsyncStorage.setItem(RECENT_ROUTES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}
