import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

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
  savedAt: string;
}

interface DiscoveryContextType {
  savedPlaces: SavedPlace[];
  savePlace: (place: Omit<SavedPlace, "savedAt">) => void;
  removePlace: (id: string) => void;
  isPlaceSaved: (id: string) => boolean;
}

const DiscoveryContext = createContext<DiscoveryContextType>({
  savedPlaces: [],
  savePlace: () => {},
  removePlace: () => {},
  isPlaceSaved: () => false,
});

const STORAGE_KEY = "@urban_explorer_saved";

export function DiscoveryProvider({ children }: { children: React.ReactNode }) {
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        setSavedPlaces(JSON.parse(data));
      }
    });
  }, []);

  const persist = useCallback((places: SavedPlace[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  }, []);

  const savePlace = useCallback(
    (place: Omit<SavedPlace, "savedAt">) => {
      setSavedPlaces((prev) => {
        if (prev.some((p) => p.id === place.id)) return prev;
        const updated = [{ ...place, savedAt: new Date().toISOString() }, ...prev];
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const removePlace = useCallback(
    (id: string) => {
      setSavedPlaces((prev) => {
        const updated = prev.filter((p) => p.id !== id);
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const isPlaceSaved = useCallback(
    (id: string) => savedPlaces.some((p) => p.id === id),
    [savedPlaces]
  );

  return (
    <DiscoveryContext.Provider value={{ savedPlaces, savePlace, removePlace, isPlaceSaved }}>
      {children}
    </DiscoveryContext.Provider>
  );
}

export function useDiscovery() {
  return useContext(DiscoveryContext);
}
