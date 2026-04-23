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
  narratedIds: Set<string>;
  followUser?: boolean;
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
      clusters.push({ key: p.id, latitude: p.latitude, longitude: p.longitude, places: group });
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
}: WalkModeMapProps) {
  const colors = useColors();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const placesRef = useRef<WalkPlace[]>(places);
  const narratedRef = useRef<Set<string>>(narratedIds);
  const colorsRef = useRef(colors);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    placesRef.current = places;
    narratedRef.current = narratedIds;
    colorsRef.current = colors;
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
    if (!leafletReady || !mapContainerRef.current || mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(
      [userLatitude, userLongitude],
      16,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    userMarkerRef.current = L.circleMarker([userLatitude, userLongitude], {
      radius: 8,
      fillColor: "#4285F4",
      color: "#fff",
      weight: 2,
      fillOpacity: 1,
    }).addTo(map);

    const renderClusters = () => {
      const currentMap = mapInstanceRef.current;
      if (!currentMap) return;
      const b = currentMap.getBounds();
      const bounds = {
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      };
      const c = colorsRef.current;
      const narrated = narratedRef.current;

      markersRef.current.forEach((m) => currentMap.removeLayer(m));
      markersRef.current = [];

      const clusters = clusterPlaces(placesRef.current, bounds);
      for (const cluster of clusters) {
        if (cluster.places.length === 1) {
          const place = cluster.places[0];
          const isNarrated = narrated.has(place.id);
          const fill = isNarrated ? c.mutedForeground : c.primary;
          const icon = L.divIcon({
            className: "walk-marker",
            html: `<div style="
              width: 22px; height: 22px; border-radius: 50%;
              background: ${fill}; border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              opacity: ${isNarrated ? 0.6 : 1};
            "></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          const marker = L.marker([place.latitude, place.longitude], { icon }).addTo(currentMap);
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
          const marker = L.marker([cluster.latitude, cluster.longitude], { icon }).addTo(
            currentMap,
          );
          marker.on("click", () => {
            const latLngs = cluster.places.map((p) => [p.latitude, p.longitude]);
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

    map.on("moveend", renderClusters);
    map.on("zoomend", renderClusters);
    mapInstanceRef.current = map;
    renderClusters();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
      userMarkerRef.current = null;
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
  }, [places, narratedIds, colors]);

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
