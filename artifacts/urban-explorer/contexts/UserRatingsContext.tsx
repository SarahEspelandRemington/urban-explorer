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
import { InteractionManager } from "react-native";
import { API_BASE } from "@/lib/apiBase";
import { useAuth } from "@/lib/auth";
import { getApiToken } from "@/lib/apiToken";

type RatingValue = "up" | "down";

interface UserRatingsContextType {
  ratings: Map<string, RatingValue>;
  isLoaded: boolean;
  userId: string | null;
  setLocalRating: (placeId: string, rating: RatingValue | null) => void;
  getRating: (placeId: string) => RatingValue | null;
}

const UserRatingsContext = createContext<UserRatingsContextType>({
  ratings: new Map(),
  isLoaded: false,
  userId: null,
  setLocalRating: () => {},
  getRating: () => null,
});

export function storageKey(userId: string | null, placeId: string): string {
  return userId
    ? `place_rating:${userId}:${placeId}`
    : `place_rating:${placeId}`;
}

export function UserRatingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [ratings, setRatings] = useState<Map<string, RatingValue>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchedForUserRef = useRef<string | null>(undefined as any);

  useEffect(() => {
    if (fetchedForUserRef.current === userId) return;
    fetchedForUserRef.current = userId;

    setRatings(new Map());
    setIsLoaded(false);

    if (!userId) {
      setIsLoaded(true);
      return;
    }

    // Defer the network round-trip until after the first interactive frame.
    // The ratings result is only consumed by Explore list items further down
    // the screen, so blocking the JS bridge with this fetch during the splash
    // window measurably delays time-to-first-paint on cold start.
    let cancelled = false;
    const abortCtrl = new AbortController();
    // Snapshot userId at effect-creation time so post-await guards can detect
    // a user switch that happened while the fetch was in-flight.
    const requestUserId = userId;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      void loadRatings();
    });

    return () => {
      cancelled = true;
      abortCtrl.abort();
      handle.cancel();
    };

    async function loadRatings() {
      try {
        const token = await getApiToken();
        if (cancelled) return;
        if (!token) {
          setIsLoaded(true);
          return;
        }

        const res = await fetch(`${API_BASE}/api/explore/user-ratings`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortCtrl.signal,
        });
        if (cancelled) return;
        if (!res.ok) {
          setIsLoaded(true);
          return;
        }

        const data = (await res.json()) as {
          ratings: Record<string, RatingValue>;
        };
        // Guard: user switched while res.json() was running.
        if (cancelled || requestUserId !== userId) return;
        if (!data.ratings) {
          setIsLoaded(true);
          return;
        }

        const map = new Map<string, RatingValue>();
        const storageWrites: Promise<void>[] = [];

        for (const [placeId, rating] of Object.entries(data.ratings)) {
          if (rating === "up" || rating === "down") {
            map.set(placeId, rating);
            storageWrites.push(
              AsyncStorage.setItem(storageKey(requestUserId, placeId), rating),
            );
          }
        }

        setRatings(map);
        await Promise.all(storageWrites);
      } catch {
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }
  }, [userId]);

  const setLocalRating = useCallback(
    (placeId: string, rating: RatingValue | null) => {
      setRatings((prev) => {
        const next = new Map(prev);
        if (rating === null) {
          next.delete(placeId);
        } else {
          next.set(placeId, rating);
        }
        return next;
      });
    },
    [],
  );

  const getRating = useCallback(
    (placeId: string) => ratings.get(placeId) ?? null,
    [ratings],
  );

  const contextValue = useMemo(
    () => ({ ratings, isLoaded, userId, setLocalRating, getRating }),
    [ratings, isLoaded, userId, setLocalRating, getRating],
  );

  return (
    <UserRatingsContext.Provider value={contextValue}>
      {children}
    </UserRatingsContext.Provider>
  );
}

export function useUserRatings() {
  return useContext(UserRatingsContext);
}
