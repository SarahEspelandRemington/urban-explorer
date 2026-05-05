import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { STARTUP_KEYS, getStartupValue } from "@/lib/startupStorage";

export interface SavedPlace {
  id: string;
  name: string;
  category: string;
  yearBuilt?: string;
  tags?: string[];
  summary: string;
  facts: string[];
  latitude: number;
  longitude: number;
  address?: string;
  distanceMeters?: number;
  netScore?: number;
  photoUrl?: string;
  savedAt: string;
  note?: string;
}

interface DiscoveryContextType {
  savedPlaces: SavedPlace[];
  savePlace: (place: Omit<SavedPlace, "savedAt" | "note">) => void;
  removePlace: (id: string) => void;
  isPlaceSaved: (id: string) => boolean;
  updateNote: (id: string, note: string) => void;
}

const DiscoveryContext = createContext<DiscoveryContextType>({
  savedPlaces: [],
  savePlace: () => {},
  removePlace: () => {},
  isPlaceSaved: () => false,
  updateNote: () => {},
});

const STORAGE_KEY = STARTUP_KEYS.savedPlaces;

export function DiscoveryProvider({ children }: { children: React.ReactNode }) {
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Reads via the batched multiGet snapshot — see lib/startupStorage.ts.
    let cancelled = false;
    getStartupValue(STORAGE_KEY).then((data) => {
      if (cancelled || !data) return;
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          setSavedPlaces(parsed);
        }
      } catch {}
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((places: SavedPlace[]) => {
    writeQueueRef.current = writeQueueRef.current.then(() =>
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places)).catch(() => {}),
    );
  }, []);

  const savePlace = useCallback(
    (place: Omit<SavedPlace, "savedAt" | "note">) => {
      setSavedPlaces((prev) => {
        if (prev.some((p) => p.id === place.id)) return prev;
        const updated = [
          { ...place, savedAt: new Date().toISOString() },
          ...prev,
        ];
        persist(updated);
        return updated;
      });
    },
    [persist],
  );

  const removePlace = useCallback(
    (id: string) => {
      setSavedPlaces((prev) => {
        const updated = prev.filter((p) => p.id !== id);
        persist(updated);
        return updated;
      });
    },
    [persist],
  );

  const isPlaceSaved = useCallback(
    (id: string) => savedPlaces.some((p) => p.id === id),
    [savedPlaces],
  );

  const updateNote = useCallback(
    (id: string, note: string) => {
      setSavedPlaces((prev) => {
        const updated = prev.map((p) =>
          p.id === id ? { ...p, note: note || undefined } : p,
        );
        persist(updated);
        return updated;
      });
    },
    [persist],
  );

  return (
    <DiscoveryContext.Provider
      value={{ savedPlaces, savePlace, removePlace, isPlaceSaved, updateNote }}
    >
      {children}
    </DiscoveryContext.Provider>
  );
}

export function useDiscovery() {
  return useContext(DiscoveryContext);
}
