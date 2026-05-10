import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  listSavedPlaces,
  upsertSavedPlace,
  deleteSavedPlace,
} from "@workspace/api-client-react";
import { STARTUP_KEYS, getStartupValue } from "@/lib/startupStorage";
import { useAuth } from "@/lib/auth";

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

function toSavedPlace(sp: {
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
  photoUrl?: string;
  savedAt: string | Date;
  note?: string;
}): SavedPlace {
  return {
    id: sp.id,
    name: sp.name,
    category: sp.category,
    yearBuilt: sp.yearBuilt,
    tags: sp.tags,
    summary: sp.summary,
    facts: sp.facts,
    latitude: sp.latitude,
    longitude: sp.longitude,
    address: sp.address,
    photoUrl: sp.photoUrl,
    savedAt: sp.savedAt instanceof Date ? sp.savedAt.toISOString() : sp.savedAt,
    note: sp.note,
  };
}

function placeToUpsertBody(place: SavedPlace) {
  return {
    name: place.name,
    category: place.category,
    yearBuilt: place.yearBuilt,
    tags: place.tags,
    summary: place.summary,
    facts: place.facts,
    latitude: place.latitude,
    longitude: place.longitude,
    address: place.address,
    photoUrl: place.photoUrl,
    savedAt: place.savedAt,
    note: place.note,
  };
}

export function DiscoveryProvider({ children }: { children: React.ReactNode }) {
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const { isAuthenticated, isLoading } = useAuth();
  const hasSyncedRef = useRef(false);

  useEffect(() => {
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

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      hasSyncedRef.current = false;
      return;
    }
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    let cancelled = false;

    async function syncWithServer() {
      try {
        const { places: serverPlaces } = await listSavedPlaces();
        if (cancelled) return;

        setSavedPlaces((local) => {
          const serverById = new Map(serverPlaces.map((sp) => [sp.id, sp]));
          const localById = new Map(local.map((p) => [p.id, p]));

          for (const lp of local) {
            if (!serverById.has(lp.id)) {
              void upsertSavedPlace(
                encodeURIComponent(lp.id),
                placeToUpsertBody(lp),
              ).catch(() => {});
            }
          }

          const serverOnly = serverPlaces.filter(
            (sp) => !localById.has(sp.id),
          );
          if (serverOnly.length === 0) return local;

          const merged = [...local, ...serverOnly.map(toSavedPlace)];
          persist(merged);
          return merged;
        });
      } catch {}
    }

    void syncWithServer();
    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated, persist]);

  const savePlace = useCallback(
    (place: Omit<SavedPlace, "savedAt" | "note">) => {
      setSavedPlaces((prev) => {
        if (prev.some((p) => p.id === place.id)) return prev;
        const newPlace: SavedPlace = {
          ...place,
          savedAt: new Date().toISOString(),
        };
        const updated = [newPlace, ...prev];
        persist(updated);

        if (isAuthenticated) {
          void upsertSavedPlace(
            encodeURIComponent(place.id),
            placeToUpsertBody(newPlace),
          ).catch(() => {});
        }

        return updated;
      });
    },
    [persist, isAuthenticated],
  );

  const removePlace = useCallback(
    (id: string) => {
      setSavedPlaces((prev) => {
        const updated = prev.filter((p) => p.id !== id);
        persist(updated);

        if (isAuthenticated) {
          void deleteSavedPlace(encodeURIComponent(id)).catch(() => {});
        }

        return updated;
      });
    },
    [persist, isAuthenticated],
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

        if (isAuthenticated) {
          const place = updated.find((p) => p.id === id);
          if (place) {
            void upsertSavedPlace(
              encodeURIComponent(id),
              placeToUpsertBody(place),
            ).catch(() => {});
          }
        }

        return updated;
      });
    },
    [persist, isAuthenticated],
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
