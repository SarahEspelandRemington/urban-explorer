import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface WalkPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface WalkModeMapProps {
  userLatitude: number;
  userLongitude: number;
  places: WalkPlace[];
  narratedIds: Map<string, number>;
  followUser?: boolean;
  currentlyPlayingPlaceId?: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function visitedOpacity(narratedAt: number | undefined): number {
  if (narratedAt === undefined) return 1;
  const ageMs = Date.now() - narratedAt;
  if (ageMs < ONE_HOUR_MS) return 1;
  const hours = ageMs / ONE_HOUR_MS;
  return Math.max(0.3, 1 - (hours - 1) * 0.1);
}

interface Cluster {
  key: string;
  latitude: number;
  longitude: number;
  places: WalkPlace[];
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const CLUSTER_GRID_SIZE = 60;
const COLLAPSE_DURATION = 420;

function easeInCubic(t: number): number {
  return t * t * t;
}

function clusterPlaces(
  places: WalkPlace[],
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): Cluster[] {
  if (places.length === 0) return [];
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1e-6);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 1e-6);
  const cellLat = latSpan / CLUSTER_GRID_SIZE;
  const cellLng = lngSpan / CLUSTER_GRID_SIZE;
  const buckets = new Map<string, WalkPlace[]>();
  for (const place of places) {
    const gx = Math.floor(place.latitude / cellLat);
    const gy = Math.floor(place.longitude / cellLng);
    const key = `${gx}:${gy}`;
    const arr = buckets.get(key);
    if (arr) arr.push(place);
    else buckets.set(key, [place]);
  }
  const clusters: Cluster[] = [];
  for (const [key, group] of buckets) {
    if (group.length === 1) {
      const p = group[0];
      clusters.push({
        key: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        places: group,
      });
    } else {
      let lat = 0;
      let lng = 0;
      for (const p of group) {
        lat += p.latitude;
        lng += p.longitude;
      }
      clusters.push({
        key: `cluster:${key}`,
        latitude: lat / group.length,
        longitude: lng / group.length,
        places: group,
      });
    }
  }
  return clusters;
}

export function WalkModeMap({
  userLatitude,
  userLongitude,
  places,
  narratedIds,
  currentlyPlayingPlaceId,
}: WalkModeMapProps) {
  const colors = useColors();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const placesRef = useRef<WalkPlace[]>(places);
  const narratedRef = useRef<Map<string, number>>(narratedIds);
  const colorsRef = useRef(colors);
  const currentlyPlayingIdRef = useRef<string | undefined>(
    currentlyPlayingPlaceId,
  );
  const prevClustersRef = useRef<Cluster[]>([]);
  const collapseRafRef = useRef<number | null>(null);
  const collapseMarkersRef = useRef<any[]>([]);
  const justZoomedRef = useRef(false);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    placesRef.current = places;
    narratedRef.current = narratedIds;
    colorsRef.current = colors;
    currentlyPlayingIdRef.current = currentlyPlayingPlaceId;
  });

  useEffect(() => {
    if ((window as any).L) {
      setLeafletReady(true);
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapInstanceRef.current)
      return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(
      [userLatitude, userLongitude],
      16,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    userMarkerRef.current = L.circleMarker([userLatitude, userLongitude], {
      radius: 8,
      fillColor: "#4285F4",
      color: "#fff",
      weight: 2,
      fillOpacity: 1,
    }).addTo(map);

    const removeCollapseMarkers = () => {
      const currentMap = mapInstanceRef.current;
      collapseMarkersRef.current.forEach((m) => {
        if (currentMap) currentMap.removeLayer(m);
      });
      collapseMarkersRef.current = [];
    };

    const cancelCollapseAnimation = () => {
      if (collapseRafRef.current !== null) {
        cancelAnimationFrame(collapseRafRef.current);
        collapseRafRef.current = null;
      }
      removeCollapseMarkers();
    };

    const renderMarkers = (
      clusters: Cluster[],
      suppressedKeys: Set<string>,
    ) => {
      const currentMap = mapInstanceRef.current;
      if (!currentMap) return;
      const c = colorsRef.current;
      const narrated = narratedRef.current;

      markersRef.current.forEach((m) => currentMap.removeLayer(m));
      markersRef.current = [];

      for (const cluster of clusters) {
        if (suppressedKeys.has(cluster.key)) continue;

        if (cluster.places.length === 1) {
          const place = cluster.places[0];
          const narratedAt = narrated.get(place.id);
          const isNarrated = narratedAt !== undefined;
          const isPlaying = place.id === currentlyPlayingIdRef.current;

          // Three-tier visual hierarchy matching the native map:
          //   active (playing): 26 px, full primary, strong shadow + halo
          //   upcoming: 16 px, primary at 73% opacity
          //   played: 12 px, mutedForeground, very faded
          const pinSize = isPlaying ? 26 : isNarrated ? 12 : 16;
          const fill = isPlaying
            ? c.primary
            : isNarrated
              ? c.mutedForeground
              : c.primary + "BB";
          const pinOpacity =
            isNarrated && !isPlaying ? visitedOpacity(narratedAt) * 0.35 : 1;
          const border = isPlaying ? 3 : isNarrated ? 1.5 : 2;
          const shadow = isPlaying
            ? `0 0 10px 3px ${c.primary}55, 0 2px 6px rgba(0,0,0,0.4)`
            : isNarrated
              ? "none"
              : "0 2px 4px rgba(0,0,0,0.25)";
          const halo = isPlaying
            ? `<div style="
                position: absolute; top: 50%; left: 50%;
                transform: translate(-50%,-50%);
                width: 48px; height: 48px; border-radius: 50%;
                border: 3px solid ${c.primary};
                background: ${c.primary}18;
                pointer-events: none;
              "></div>`
            : "";
          const half = Math.round(pinSize / 2);
          const wrapperSize = isPlaying ? 52 : pinSize + 8;
          const halfWrapper = Math.round(wrapperSize / 2);
          const icon = L.divIcon({
            className: "walk-marker",
            html: `<div style="
              position: relative;
              width: ${wrapperSize}px; height: ${wrapperSize}px;
              display: flex; align-items: center; justify-content: center;
            ">${halo}<div style="
              width: ${pinSize}px; height: ${pinSize}px; border-radius: 50%;
              background: ${fill}; border: ${border}px solid white;
              box-shadow: ${shadow};
              opacity: ${pinOpacity};
              position: relative;
            "></div></div>`,
            iconSize: [wrapperSize, wrapperSize],
            iconAnchor: [halfWrapper, halfWrapper],
          });
          void half; // suppress unused warning — kept for clarity
          const marker = L.marker([place.latitude, place.longitude], {
            icon,
          }).addTo(currentMap);
          marker.bindTooltip(place.name);
          markersRef.current.push(marker);
        } else {
          const allNarrated = cluster.places.every((p) => narrated.has(p.id));
          const bg = allNarrated ? c.mutedForeground : c.primary;
          const count = cluster.places.length;
          const size = count >= 100 ? 48 : count >= 10 ? 40 : 32;
          const icon = L.divIcon({
            className: "walk-cluster",
            html: `<div style="
              width: ${size}px; height: ${size}px; border-radius: 50%;
              background: ${bg}; border: 2px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.35);
              display: flex; align-items: center; justify-content: center;
              color: ${c.primaryForeground};
              font-family: Inter_600SemiBold, sans-serif;
              font-size: 13px; cursor: pointer;
              opacity: ${allNarrated ? 0.7 : 1};
            ">${count}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
          const marker = L.marker([cluster.latitude, cluster.longitude], {
            icon,
          }).addTo(currentMap);
          marker.on("click", () => {
            const latLngs = cluster.places.map((p) => [
              p.latitude,
              p.longitude,
            ]);
            const clusterBounds = L.latLngBounds(latLngs);
            currentMap.fitBounds(clusterBounds.pad(0.4), {
              maxZoom: 19,
              animate: true,
            });
          });
          markersRef.current.push(marker);
        }
      }
    };

    const runCollapseAnimation = (
      clusters: Cluster[],
      groups: {
        clusterKey: string;
        center: { latitude: number; longitude: number };
        places: WalkPlace[];
      }[],
    ) => {
      const currentMap = mapInstanceRef.current;
      if (!currentMap) return;

      const c = colorsRef.current;
      const narrated = narratedRef.current;

      const suppressedKeys = new Set(groups.map((g) => g.clusterKey));

      renderMarkers(clusters, suppressedKeys);

      const animEntries: {
        marker: any;
        el: HTMLElement | null;
        fromLat: number;
        fromLng: number;
        toLat: number;
        toLng: number;
      }[] = [];

      for (const group of groups) {
        for (const place of group.places) {
          const fill = narrated.has(place.id) ? c.mutedForeground : c.primary;
          const icon = L.divIcon({
            className: "",
            html: `<div style="
              width: 22px; height: 22px; border-radius: 50%;
              background: ${fill}; border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              transform-origin: center;
            "></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          const marker = L.marker([place.latitude, place.longitude], {
            icon,
            zIndexOffset: 1000,
          }).addTo(currentMap);
          const el: HTMLElement | null = marker.getElement
            ? marker.getElement()
            : null;
          collapseMarkersRef.current.push(marker);
          animEntries.push({
            marker,
            el,
            fromLat: place.latitude,
            fromLng: place.longitude,
            toLat: group.center.latitude,
            toLng: group.center.longitude,
          });
        }
      }

      const startedAt = Date.now();

      const tick = () => {
        const elapsed = Date.now() - startedAt;
        const rawT = Math.min(1, elapsed / COLLAPSE_DURATION);
        const t = easeInCubic(rawT);
        const opacity = 1 - 0.55 * t;
        const scale = 1 - 0.4 * t;

        for (const entry of animEntries) {
          const lat = entry.fromLat + (entry.toLat - entry.fromLat) * t;
          const lng = entry.fromLng + (entry.toLng - entry.fromLng) * t;
          entry.marker.setLatLng([lat, lng]);
          if (entry.el) {
            const inner = entry.el.firstElementChild as HTMLElement | null;
            if (inner) {
              inner.style.opacity = String(opacity);
              inner.style.transform = `scale(${scale})`;
            }
          }
        }

        if (rawT < 1) {
          collapseRafRef.current = requestAnimationFrame(tick);
        } else {
          collapseRafRef.current = null;
          removeCollapseMarkers();
          renderMarkers(clusters, new Set());
        }
      };

      collapseRafRef.current = requestAnimationFrame(tick);
    };

    const computeBounds = () => {
      const b = map.getBounds();
      return {
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      };
    };

    const handleZoomEnd = () => {
      justZoomedRef.current = true;
      cancelCollapseAnimation();

      const bounds = computeBounds();
      const newClusters = clusterPlaces(placesRef.current, bounds);
      const prev = prevClustersRef.current;
      prevClustersRef.current = newClusters;

      const prevSingleById = new Map<string, WalkPlace>();
      for (const c of prev) {
        if (c.places.length === 1)
          prevSingleById.set(c.places[0].id, c.places[0]);
      }

      if (prevSingleById.size > 0) {
        const groups: {
          clusterKey: string;
          center: { latitude: number; longitude: number };
          places: WalkPlace[];
        }[] = [];

        for (const cluster of newClusters) {
          if (cluster.places.length <= 1) continue;
          const merged = cluster.places.filter((p) => prevSingleById.has(p.id));
          if (merged.length >= 1) {
            groups.push({
              clusterKey: cluster.key,
              center: {
                latitude: cluster.latitude,
                longitude: cluster.longitude,
              },
              places: merged.map((p) => prevSingleById.get(p.id)!),
            });
          }
        }

        if (groups.length > 0) {
          runCollapseAnimation(newClusters, groups);
          return;
        }
      }

      renderMarkers(newClusters, new Set());
    };

    const handleMoveEnd = () => {
      if (justZoomedRef.current) {
        justZoomedRef.current = false;
        return;
      }
      cancelCollapseAnimation();
      const bounds = computeBounds();
      const newClusters = clusterPlaces(placesRef.current, bounds);
      prevClustersRef.current = newClusters;
      renderMarkers(newClusters, new Set());
    };

    map.on("zoomend", handleZoomEnd);
    map.on("moveend", handleMoveEnd);
    mapInstanceRef.current = map;

    const bounds = computeBounds();
    const initialClusters = clusterPlaces(placesRef.current, bounds);
    prevClustersRef.current = initialClusters;
    renderMarkers(initialClusters, new Set());

    return () => {
      cancelCollapseAnimation();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
      userMarkerRef.current = null;
      prevClustersRef.current = [];
    };
    // Map is created once when Leaflet loads. Live updates are handled by
    // the user-marker effect and the places effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  useEffect(() => {
    if (!mapInstanceRef.current || !userMarkerRef.current) return;
    userMarkerRef.current.setLatLng([userLatitude, userLongitude]);
  }, [userLatitude, userLongitude]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.fire("moveend");
  }, [places, narratedIds, colors, currentlyPlayingPlaceId]);

  return (
    <View style={styles.container}>
      <div
        ref={mapContainerRef as any}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative" as any,
  },
});
