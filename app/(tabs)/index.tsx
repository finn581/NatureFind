import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  FlatList,
  Animated,
  ScrollView,
  Dimensions,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { US_STATES } from "@/constants/States";
import { fetchParks, type Park } from "@/services/npsApi";
import {
  getRecentSightings,
  type SightingDoc,
  getCampgroundContribution,
  saveCampgroundContribution,
  type CampgroundContribution,
} from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  fetchTrails,
  fetchTrailPreviews,
  type Trail,
  type TrailPreview,
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  TRAILS_ZOOM_THRESHOLD,
  TRAILS_PREVIEW_MAX_ZOOM,
} from "@/services/trailsApi";
import {
  fetchCampgrounds,
  type Campground,
  CAMPGROUND_COLOR,
} from "@/services/campgroundsApi";
import { saveDraft, syncPendingDrafts } from "@/services/offlineDrafts";
import LayerPanel, { type LayerGroup } from "@/components/LayerPanel";
import RoutePreviewSheet from "@/components/RoutePreviewSheet";
import {
  fetchDriveTimes,
  fetchRoute,
  fetchIsochrone,
  formatDurationShort,
  type RouteResult,
} from "@/services/mapboxRoutingApi";
import MapboxGL from "@rnmapbox/maps";

// ─── Mapbox init ─────────────────────────────────────────────────────────────

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

const SCREEN_HEIGHT = Dimensions.get("window").height;

// ─── Types ───────────────────────────────────────────────────────────────────

type DateFilter = 7 | 30 | 0;

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface ClusterPoint {
  id: string;
  lat: number;
  lng: number;
  count: number;
  emoji: string;
  items: SightingDoc[];
}

type GeoJSONFC = { type: "FeatureCollection"; features: any[] };

// ─── Constants ───────────────────────────────────────────────────────────────

const US_CENTER: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 40,
  longitudeDelta: 40,
};

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "All time", value: 0 },
];

const CONFIDENCE_COLORS: Record<string, string> = {
  certain: Colors.primaryLight,
  probable: Colors.accent,
  possible: Colors.textSecondary,
};

const LIST_BODY_HEIGHT = 300;
const HEATMAP_SHOW_THRESHOLD = 8;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildClusters(sightings: SightingDoc[], latDelta: number): ClusterPoint[] {
  const cellSize = Math.max(latDelta / 8, 0.015);
  const grid = new Map<string, SightingDoc[]>();

  for (const s of sightings) {
    const row = Math.floor(s.location.latitude / cellSize);
    const col = Math.floor(s.location.longitude / cellSize);
    const k = `${row},${col}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(s);
  }

  return [...grid.values()].map((items) => {
    const lat = items.reduce((sum, s) => sum + s.location.latitude, 0) / items.length;
    const lng = items.reduce((sum, s) => sum + s.location.longitude, 0) / items.length;

    const freq: Record<string, number> = {};
    for (const s of items) freq[s.species.emoji] = (freq[s.species.emoji] || 0) + 1;
    const emoji = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];

    return {
      id: `${lat.toFixed(5)}-${lng.toFixed(5)}`,
      lat,
      lng,
      count: items.length,
      emoji,
      items,
    };
  });
}

function timeAgo(ts: any): string {
  const ms = typeof ts?.toMillis === "function" ? ts.toMillis() : Date.now();
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function openDirections(latitude: number, longitude: number, name: string) {
  const label = encodeURIComponent(name);
  const url =
    Platform.OS === "ios"
      ? `maps://?daddr=${latitude},${longitude}&dirflg=d&t=m`
      : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_id=${label}&travelmode=driving`;
  Linking.openURL(url).catch(() => {});
}

const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  US_STATES.map((s) => [s.name, s.code])
);

const OUTDOOR_DESIGNATIONS = new Set([
  "National Park",
  "National Forest",
  "National Recreation Area",
  "National Seashore",
  "National Lakeshore",
  "National Preserve",
  "National Reserve",
  "National River",
  "National Scenic Trail",
  "National Wildlife Refuge",
  "National Grassland",
  "National Wilderness Area",
  "Wild and Scenic River",
]);

function thinCoords(
  coords: Array<{ latitude: number; longitude: number }>,
  maxPoints = 50
): Array<{ latitude: number; longitude: number }> {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  return coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
}

function inViewport(lat: number, lon: number, region: Region, buffer = 0.6): boolean {
  return (
    Math.abs(lat - region.latitude) < region.latitudeDelta * (0.5 + buffer) &&
    Math.abs(lon - region.longitude) < region.longitudeDelta * (0.5 + buffer)
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

type CampEdits = {
  fee: boolean | null;
  showers: boolean | null;
  toilets: boolean | null;
  tents: boolean | null;
  caravans: boolean | null;
};

export default function MapTab() {
  const router = useRouter();
  const { user } = useAuth();
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const listBodyAnim = useRef(new Animated.Value(0)).current;

  const [parks, setParks] = useState<Park[]>([]);
  const [sightings, setSightings] = useState<SightingDoc[]>([]);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [trailPreviews, setTrailPreviews] = useState<TrailPreview[]>([]);
  const [campgrounds, setCampgrounds] = useState<Campground[]>([]);
  const [loading, setLoading] = useState(true);
  const [sightingsLoading, setSightingsLoading] = useState(false);
  const [trailsLoading, setTrailsLoading] = useState(false);
  const [trailPreviewsLoading, setTrailPreviewsLoading] = useState(false);
  const [campgroundsLoading, setCampgroundsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [region, setRegion] = useState<Region>(US_CENTER);
  const [currentZoom, setCurrentZoom] = useState(4);
  const [locationDenied, setLocationDenied] = useState(false);
  const [showParks, setShowParks] = useState(true);
  const [showSightings, setShowSightings] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [showCampgrounds, setShowCampgrounds] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>(30);
  const [selectedSighting, setSelectedSighting] = useState<SightingDoc | null>(null);
  const [selectedTrail, setSelectedTrail] = useState<Trail | null>(null);
  const [selectedTrailPreview, setSelectedTrailPreview] = useState<TrailPreview | null>(null);
  const [selectedCampground, setSelectedCampground] = useState<Campground | null>(null);
  const [campContributions, setCampContributions] = useState<
    Record<string, CampgroundContribution | null>
  >({});
  const [campEditMode, setCampEditMode] = useState(false);
  const [campEdits, setCampEdits] = useState<CampEdits>({
    fee: null,
    showers: null,
    toilets: null,
    tents: null,
    caravans: null,
  });
  const [campSaving, setCampSaving] = useState(false);
  const [campSavedOffline, setCampSavedOffline] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [driveTimes, setDriveTimes] = useState<Record<string, number | null>>({});
  const [showIsochrone, setShowIsochrone] = useState(false);
  const [isochroneMinutes, setIsochroneMinutes] = useState(30);
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState<any>(null);
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeTarget, setRouteTarget] = useState<{ parkCode: string; name: string } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const trailFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const campFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driveTimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isochroneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync offline drafts on mount ─────────────────────────────────────────

  useEffect(() => {
    syncPendingDrafts().catch(() => {});
  }, []);

  // ── Load parks immediately on mount ──────────────────────────────────────

  useEffect(() => {
    loadParks();
  }, []);

  // ── Location ──────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation([loc.coords.longitude, loc.coords.latitude]);
          // Fly the Mapbox camera to user location
          cameraRef.current?.setCamera({
            centerCoordinate: [loc.coords.longitude, loc.coords.latitude],
            zoomLevel: 8,
            animationDuration: 1200,
            animationMode: "flyTo",
          });
          // Keep region in sync for the Overpass debounce effects
          setRegion({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 5,
            longitudeDelta: 5,
          });
          try {
            const [geo] = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
            const stateCode = geo?.region ? STATE_NAME_TO_CODE[geo.region] : undefined;
            loadParks(stateCode);
          } catch {
            loadParks();
          }
        } catch {
          loadParks();
        }
      } else {
        setLocationDenied(true);
      }
    })();
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (locationDenied) loadParks();
  }, [locationDenied]);

  useEffect(() => {
    if (showSightings) loadSightings();
  }, [showSightings, dateFilter]);

  useEffect(() => {
    if (!showTrails) {
      setTrailPreviews([]);
      return;
    }
    if (previewFetchTimer.current) clearTimeout(previewFetchTimer.current);
    previewFetchTimer.current = setTimeout(() => {
      if (
        region.latitudeDelta >= TRAILS_ZOOM_THRESHOLD &&
        region.latitudeDelta < TRAILS_PREVIEW_MAX_ZOOM
      ) {
        loadTrailPreviews(region);
      } else if (region.latitudeDelta < TRAILS_ZOOM_THRESHOLD) {
        setTrailPreviews([]);
      } else {
        setTrailPreviews([]);
      }
    }, 600);
    return () => {
      if (previewFetchTimer.current) clearTimeout(previewFetchTimer.current);
    };
  }, [showTrails, region]);

  useEffect(() => {
    if (!showTrails) return;
    if (trailFetchTimer.current) clearTimeout(trailFetchTimer.current);
    trailFetchTimer.current = setTimeout(() => {
      if (region.latitudeDelta < TRAILS_ZOOM_THRESHOLD) {
        loadTrails(region);
      }
    }, 800);
    return () => {
      if (trailFetchTimer.current) clearTimeout(trailFetchTimer.current);
    };
  }, [showTrails, region]);

  useEffect(() => {
    if (!showCampgrounds) {
      setCampgrounds([]);
      return;
    }
    if (campFetchTimer.current) clearTimeout(campFetchTimer.current);
    campFetchTimer.current = setTimeout(() => {
      loadCampgrounds(region);
    }, 700);
    return () => {
      if (campFetchTimer.current) clearTimeout(campFetchTimer.current);
    };
  }, [showCampgrounds, region]);

  // ── Matrix API: drive time badges for visible parks ───────────────────────

  useEffect(() => {
    const parkList = showParks ? parks.filter((p) => p.latitude && p.longitude) : [];
    if (!userLocation || parkList.length === 0) return;
    if (driveTimeTimer.current) clearTimeout(driveTimeTimer.current);
    driveTimeTimer.current = setTimeout(async () => {
      try {
        const dests: [number, number][] = parkList.map((p) => [
          parseFloat(p.longitude),
          parseFloat(p.latitude),
        ]);
        const times = await fetchDriveTimes(userLocation, dests);
        const map: Record<string, number | null> = {};
        parkList.forEach((p, i) => {
          map[p.parkCode] = times[i] ?? null;
        });
        setDriveTimes(map);
      } catch {
        // non-fatal
      }
    }, 1500);
    return () => {
      if (driveTimeTimer.current) clearTimeout(driveTimeTimer.current);
    };
  }, [userLocation, parks, showParks]);

  // ── Isochrone layer ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!showIsochrone || !userLocation) {
      if (!showIsochrone) setIsochroneGeoJSON(null);
      return;
    }
    if (isochroneTimer.current) clearTimeout(isochroneTimer.current);
    isochroneTimer.current = setTimeout(async () => {
      try {
        const data = await fetchIsochrone(userLocation, isochroneMinutes);
        setIsochroneGeoJSON(data);
      } catch {
        // non-fatal
      }
    }, 400);
    return () => {
      if (isochroneTimer.current) clearTimeout(isochroneTimer.current);
    };
  }, [showIsochrone, userLocation, isochroneMinutes]);

  async function loadParks(stateCode?: string) {
    setLoading(true);
    setError(false);
    try {
      const res = await fetchParks({ limit: 100, stateCode });
      setParks(
        res.data.filter(
          (p) => p.latitude && p.longitude && OUTDOOR_DESIGNATIONS.has(p.designation)
        )
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const loadSightings = useCallback(async () => {
    setSightingsLoading(true);
    try {
      const data = await getRecentSightings(dateFilter, 300);
      setSightings(data.filter((s) => s.location?.latitude && s.location?.longitude));
    } catch {
      // non-fatal
    } finally {
      setSightingsLoading(false);
    }
  }, [dateFilter]);

  async function loadTrailPreviews(r: Region) {
    setTrailPreviewsLoading(true);
    try {
      const half_lat = r.latitudeDelta / 2;
      const half_lng = r.longitudeDelta / 2;
      const data = await fetchTrailPreviews(
        r.latitude - half_lat,
        r.longitude - half_lng,
        r.latitude + half_lat,
        r.longitude + half_lng
      );
      setTrailPreviews(data);
    } catch {
      // non-fatal
    } finally {
      setTrailPreviewsLoading(false);
    }
  }

  async function loadTrails(r: Region) {
    setTrailsLoading(true);
    try {
      const half_lat = r.latitudeDelta / 2;
      const half_lng = r.longitudeDelta / 2;
      const data = await fetchTrails(
        r.latitude - half_lat,
        r.longitude - half_lng,
        r.latitude + half_lat,
        r.longitude + half_lng
      );
      setTrails(data);
    } catch {
      // non-fatal
    } finally {
      setTrailsLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedCampground) {
      setCampEditMode(false);
      return;
    }
    if (selectedCampground.id in campContributions) return;
    getCampgroundContribution(selectedCampground.id)
      .then((data) => {
        setCampContributions((prev) => ({ ...prev, [selectedCampground.id]: data }));
      })
      .catch(() => {});
  }, [selectedCampground]);

  async function loadCampgrounds(r: Region) {
    setCampgroundsLoading(true);
    try {
      const half_lat = r.latitudeDelta / 2;
      const half_lng = r.longitudeDelta / 2;
      const data = await fetchCampgrounds(
        r.latitude - half_lat,
        r.longitude - half_lng,
        r.latitude + half_lat,
        r.longitude + half_lng
      );
      setCampgrounds(data);
    } catch {
      // non-fatal
    } finally {
      setCampgroundsLoading(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const clusters = useMemo(
    () => (showSightings ? buildClusters(sightings, region.latitudeDelta) : []),
    [sightings, region.latitudeDelta, showSightings]
  );

  const visibleParks = useMemo(() => {
    if (!showParks) return [];
    return parks.filter((p) => p.latitude && p.longitude);
  }, [parks, showParks]);

  const visibleTrailPreviews = useMemo(() => {
    if (!showTrails) return [];
    return trailPreviews
      .filter((p) => inViewport(p.latitude, p.longitude, region))
      .slice(0, 40);
  }, [trailPreviews, region, showTrails]);

  const visibleCampgrounds = useMemo(() => {
    if (!showCampgrounds) return [];
    return campgrounds
      .filter((c) => inViewport(c.latitude, c.longitude, region))
      .slice(0, 40);
  }, [campgrounds, region, showCampgrounds]);

  const heatmapPoints = useMemo(() => {
    if (!showSightings || region.latitudeDelta >= HEATMAP_SHOW_THRESHOLD) return [];
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    return sightings.filter(
      (s) =>
        Math.abs(s.location.latitude - latitude) < latitudeDelta * 1.5 &&
        Math.abs(s.location.longitude - longitude) < longitudeDelta * 1.5
    );
  }, [sightings, region, showSightings]);

  // ── GeoJSON feature collections for Mapbox layers ────────────────────────

  const parksGeoJSON = useMemo<GeoJSONFC>(
    () => ({
      type: "FeatureCollection",
      features: visibleParks.map((p) => {
        const dt = driveTimes[p.parkCode];
        return {
          type: "Feature",
          id: p.id,
          geometry: {
            type: "Point",
            coordinates: [parseFloat(p.longitude), parseFloat(p.latitude)],
          },
          properties: {
            id: p.id,
            name: p.name,
            parkCode: p.parkCode,
            designation: p.designation,
            driveTimeLabel: dt != null ? formatDurationShort(dt) : "",
          },
        };
      }),
    }),
    [visibleParks, driveTimes]
  );

  const trailPreviewsGeoJSON = useMemo<GeoJSONFC>(() => {
    const seen = new Set<string>();
    const deduped = visibleTrailPreviews.filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });
    return {
      type: "FeatureCollection",
      features: deduped.map((p) => ({
        type: "Feature",
        id: p.id,
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
        properties: { id: p.id, name: p.name, difficulty: p.difficulty, color: p.color },
      })),
    };
  }, [visibleTrailPreviews]);

  const trailsGeoJSON = useMemo<GeoJSONFC>(
    () => ({
      type: "FeatureCollection",
      features: trails.map((t) => ({
        type: "Feature",
        id: t.id,
        geometry: {
          type: "LineString",
          coordinates: thinCoords(t.coordinates).map((c) => [c.longitude, c.latitude]),
        },
        properties: { id: t.id, name: t.name, color: t.color, difficulty: t.difficulty },
      })),
    }),
    [trails]
  );

  const trailLabelsGeoJSON = useMemo<GeoJSONFC>(() => {
    const byName = new Map<string, Trail>();
    for (const trail of trails) {
      const existing = byName.get(trail.name);
      if (!existing || trail.coordinates.length > existing.coordinates.length) {
        byName.set(trail.name, trail);
      }
    }
    return {
      type: "FeatureCollection",
      features: [...byName.values()]
        .slice(0, 12)
        .map((trail) => {
          const mid = trail.coordinates[Math.floor(trail.coordinates.length / 2)];
          if (!mid) return null;
          return {
            type: "Feature",
            id: `label-${trail.id}`,
            geometry: { type: "Point", coordinates: [mid.longitude, mid.latitude] },
            properties: { id: trail.id, name: trail.name, color: trail.color },
          };
        })
        .filter(Boolean),
    };
  }, [trails]);

  const campgroundsGeoJSON = useMemo<GeoJSONFC>(
    () => ({
      type: "FeatureCollection",
      features: visibleCampgrounds.map((c) => ({
        type: "Feature",
        id: c.id,
        geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
        properties: { id: c.id, name: c.name },
      })),
    }),
    [visibleCampgrounds]
  );

  const clustersGeoJSON = useMemo<GeoJSONFC>(
    () => ({
      type: "FeatureCollection",
      features: clusters.map((c) => ({
        type: "Feature",
        id: c.id,
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        properties: {
          id: c.id,
          count: c.count,
          emoji: c.emoji,
          label: c.count === 1 ? c.emoji : `${c.emoji} ${c.count}`,
        },
      })),
    }),
    [clusters]
  );

  const heatmapGeoJSON = useMemo<GeoJSONFC>(
    () => ({
      type: "FeatureCollection",
      features: heatmapPoints.map((s) => ({
        type: "Feature",
        id: s.id,
        geometry: {
          type: "Point",
          coordinates: [s.location.longitude, s.location.latitude],
        },
        properties: {},
      })),
    }),
    [heatmapPoints]
  );

  // ── List panel animation ──────────────────────────────────────────────────

  function toggleList() {
    const toValue = listOpen ? 0 : LIST_BODY_HEIGHT;
    setListOpen(!listOpen);
    Animated.spring(listBodyAnim, {
      toValue,
      useNativeDriver: false,
      damping: 22,
      stiffness: 180,
    }).start();
  }

  // ── Web fallback ──────────────────────────────────────────────────────────

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, styles.webFallback]}>
        <Text style={styles.webText}>Map is available on iOS and Android only</Text>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {locationDenied && (
        <View style={styles.permissionBanner}>
          <Ionicons name="location-outline" size={16} color={Colors.star} />
          <Text style={styles.permissionText}>
            Enable location in Settings to see nearby parks
          </Text>
          <Pressable
            onPress={() => setLocationDenied(false)}
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Failed to load parks</Text>
          <Pressable onPress={() => loadParks()} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* ── Mapbox Map ── */}
      <MapboxGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL="mapbox://styles/mapbox/outdoors-v12"
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled
        onMapIdle={(state: any) => {
          const props = state.properties;
          if (!props) return;
          const [lon, lat] = props.center ?? [0, 0];
          const ne = props.bounds?.ne;
          const sw = props.bounds?.sw;
          if (!ne || !sw) return;
          const [east, north] = ne;
          const [west, south] = sw;
          setCurrentZoom(props.zoom ?? currentZoom);
          setRegion({
            latitude: lat,
            longitude: lon,
            latitudeDelta: Math.max(north - south, 0.001),
            longitudeDelta: Math.max(east - west, 0.001),
          });
        }}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [US_CENTER.longitude, US_CENTER.latitude],
            zoomLevel: 4,
          }}
          followUserLocation={isNavigating}
          followUserMode={isNavigating ? MapboxGL.UserTrackingMode.FollowWithCourse : undefined}
          followZoomLevel={isNavigating ? 17 : undefined}
          followPitch={isNavigating ? 50 : undefined}
        />

        <MapboxGL.UserLocation visible animated />

        {/* ── Heatmap (sightings density) ── */}
        {showSightings && heatmapPoints.length > 0 && (
          <MapboxGL.ShapeSource id="heatmap-src" shape={heatmapGeoJSON}>
            <MapboxGL.HeatmapLayer
              id="heatmap-layer"
              style={{
                heatmapRadius: 40,
                heatmapOpacity: 0.65,
                heatmapColor: [
                  "interpolate",
                  ["linear"],
                  ["heatmap-density"],
                  0,
                  "rgba(0,0,0,0)",
                  0.3,
                  "rgba(45,106,79,0.5)",
                  0.6,
                  "rgba(72,187,120,0.75)",
                  1,
                  "rgba(52,211,153,0.9)",
                ],
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Trail polylines (zoomed in) ── */}
        {showTrails && trails.length > 0 && region.latitudeDelta < TRAILS_ZOOM_THRESHOLD && (
          <MapboxGL.ShapeSource
            id="trails-src"
            shape={trailsGeoJSON}
            onPress={(e: any) => {
              const f = e.features?.[0];
              if (!f) return;
              const trail = trails.find(
                (t) => String(t.id) === String(f.id ?? f.properties?.id)
              );
              if (trail) setSelectedTrail(trail);
            }}
          >
            <MapboxGL.LineLayer
              id="trail-lines"
              style={{
                lineColor: ["get", "color"],
                lineWidth: 3,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Trail name labels at midpoint (zoomed in) ── */}
        {showTrails && trails.length > 0 && region.latitudeDelta < TRAILS_ZOOM_THRESHOLD && (
          <MapboxGL.ShapeSource
            id="trail-labels-src"
            shape={trailLabelsGeoJSON}
            onPress={(e: any) => {
              const f = e.features?.[0];
              if (!f) return;
              const trail = trails.find((t) => String(t.id) === String(f.properties?.id));
              if (trail) setSelectedTrail(trail);
            }}
          >
            <MapboxGL.CircleLayer
              id="trail-label-dots"
              style={{
                circleRadius: 7,
                circleColor: ["get", "color"],
                circleStrokeWidth: 2,
                circleStrokeColor: "#fff",
              }}
            />
            <MapboxGL.SymbolLayer
              id="trail-label-text"
              style={{
                textField: ["get", "name"],
                textSize: 11,
                textAnchor: "top",
                textOffset: [0, 1.2],
                textColor: "#fff",
                textHaloColor: "#111",
                textHaloWidth: 1.5,
                textAllowOverlap: false,
                textOptional: true,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Trail preview pins (zoomed out) ── */}
        {showTrails &&
          region.latitudeDelta >= TRAILS_ZOOM_THRESHOLD &&
          region.latitudeDelta < TRAILS_PREVIEW_MAX_ZOOM &&
          trailPreviews.length > 0 && (
            <MapboxGL.ShapeSource
              id="trail-previews-src"
              shape={trailPreviewsGeoJSON}
              onPress={(e: any) => {
                const f = e.features?.[0];
                if (!f) return;
                const preview = trailPreviews.find((p) => p.id === f.properties?.id);
                if (preview) setSelectedTrailPreview(preview);
              }}
            >
              <MapboxGL.CircleLayer
                id="trail-preview-circles"
                style={{
                  circleRadius: 10,
                  circleColor: ["get", "color"],
                  circleStrokeWidth: 2.5,
                  circleStrokeColor: "#fff",
                }}
              />
              <MapboxGL.SymbolLayer
                id="trail-preview-icons"
                style={{
                  textField: "🥾",
                  textSize: 11,
                  textAllowOverlap: true,
                  textAnchor: "center",
                }}
              />
              <MapboxGL.SymbolLayer
                id="trail-preview-labels"
                style={{
                  textField: ["get", "name"],
                  textSize: 10,
                  textAnchor: "top",
                  textOffset: [0, 1.5],
                  textColor: "#fff",
                  textHaloColor: "#111",
                  textHaloWidth: 1.5,
                  textAllowOverlap: false,
                  textOptional: true,
                }}
              />
            </MapboxGL.ShapeSource>
          )}

        {/* ── National Park pins ── */}
        {showParks && visibleParks.length > 0 && (
          <MapboxGL.ShapeSource
            id="parks-src"
            shape={parksGeoJSON}
            onPress={async (e: any) => {
              const f = e.features?.[0];
              if (!f) return;
              const { parkCode, name } = f.properties ?? {};
              if (!parkCode) return;
              const park = visibleParks.find((p) => p.parkCode === parkCode);
              if (!park) return;
              if (userLocation) {
                setRouteTarget({ parkCode, name: park.fullName });
                setActiveRoute(null);
                setRouteLoading(true);
                try {
                  const route = await fetchRoute(userLocation, [
                    parseFloat(park.longitude),
                    parseFloat(park.latitude),
                  ]);
                  setActiveRoute(route);
                } catch {
                  setActiveRoute(null);
                } finally {
                  setRouteLoading(false);
                }
              } else {
                router.push(`/park/${parkCode}`);
              }
            }}
          >
            <MapboxGL.CircleLayer
              id="park-circles"
              style={{
                circleRadius: 13,
                circleColor: Colors.primary,
                circleStrokeWidth: 2.5,
                circleStrokeColor: "#fff",
              }}
            />
            <MapboxGL.SymbolLayer
              id="park-icons"
              style={{
                textField: "🌲",
                textSize: 14,
                textAllowOverlap: true,
                textAnchor: "center",
              }}
            />
            <MapboxGL.SymbolLayer
              id="park-labels"
              style={{
                textField: ["get", "name"],
                textSize: 11,
                textAnchor: "top",
                textOffset: [0, 1.6],
                textColor: "#fff",
                textHaloColor: "#1a3a2a",
                textHaloWidth: 2,
                textAllowOverlap: false,
                textOptional: true,
              }}
            />
            <MapboxGL.SymbolLayer
              id="park-drive-times"
              style={{
                textField: ["get", "driveTimeLabel"],
                textSize: 9,
                textAnchor: "bottom",
                textOffset: [0, -1.8],
                textColor: "#fff",
                textHaloColor: "#1a3a2a",
                textHaloWidth: 1.5,
                textAllowOverlap: false,
                textOptional: true,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Active route polyline ── */}
        {activeRoute && (
          <MapboxGL.ShapeSource
            id="route-src"
            shape={activeRoute.geometry}
          >
            <MapboxGL.LineLayer
              id="route-casing"
              style={{
                lineColor: "#fff",
                lineWidth: 7,
                lineCap: "round",
                lineJoin: "round",
              }}
              belowLayerID="park-circles"
            />
            <MapboxGL.LineLayer
              id="route-line"
              style={{
                lineColor: Colors.primary,
                lineWidth: 4,
                lineCap: "round",
                lineJoin: "round",
              }}
              belowLayerID="park-circles"
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Isochrone reachability polygon ── */}
        {showIsochrone && isochroneGeoJSON && (
          <MapboxGL.ShapeSource id="isochrone-src" shape={isochroneGeoJSON}>
            <MapboxGL.FillLayer
              id="isochrone-fill"
              style={{
                fillColor: Colors.primary,
                fillOpacity: 0.12,
              }}
            />
            <MapboxGL.LineLayer
              id="isochrone-border"
              style={{
                lineColor: Colors.primary,
                lineWidth: 2,
                lineOpacity: 0.6,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Campground pins ── */}
        {showCampgrounds && visibleCampgrounds.length > 0 && (
          <MapboxGL.ShapeSource
            id="camps-src"
            shape={campgroundsGeoJSON}
            onPress={(e: any) => {
              const f = e.features?.[0];
              if (!f) return;
              const camp = campgrounds.find((c) => c.id === f.properties?.id);
              if (camp) setSelectedCampground(camp);
            }}
          >
            <MapboxGL.CircleLayer
              id="camp-circles"
              style={{
                circleRadius: 12,
                circleColor: CAMPGROUND_COLOR,
                circleStrokeWidth: 2.5,
                circleStrokeColor: "#fff",
              }}
            />
            <MapboxGL.SymbolLayer
              id="camp-icons"
              style={{
                textField: "⛺",
                textSize: 12,
                textAllowOverlap: true,
                textAnchor: "center",
              }}
            />
            <MapboxGL.SymbolLayer
              id="camp-labels"
              style={{
                textField: ["get", "name"],
                textSize: 10,
                textAnchor: "top",
                textOffset: [0, 1.5],
                textColor: "#fff",
                textHaloColor: "#111",
                textHaloWidth: 1.5,
                textAllowOverlap: false,
                textOptional: true,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Wildlife sighting clusters ── */}
        {showSightings && clusters.length > 0 && (
          <MapboxGL.ShapeSource
            id="clusters-src"
            shape={clustersGeoJSON}
            onPress={(e: any) => {
              const f = e.features?.[0];
              if (!f) return;
              const cluster = clusters.find((c) => c.id === f.properties?.id);
              if (!cluster) return;
              if (cluster.count === 1) {
                setSelectedSighting(cluster.items[0]);
              } else {
                cameraRef.current?.setCamera({
                  centerCoordinate: [cluster.lng, cluster.lat],
                  zoomLevel: currentZoom + 2.5,
                  animationDuration: 350,
                  animationMode: "flyTo",
                });
              }
            }}
          >
            <MapboxGL.CircleLayer
              id="cluster-circles"
              style={{
                circleRadius: ["case", [">", ["get", "count"], 1], 18, 13],
                circleColor: "#7c3aed",
                circleStrokeWidth: 2.5,
                circleStrokeColor: "#fff",
                circleOpacity: 0.9,
              }}
            />
            <MapboxGL.SymbolLayer
              id="cluster-labels"
              style={{
                textField: ["get", "label"],
                textSize: 13,
                textColor: "#fff",
                textAllowOverlap: true,
                textAnchor: "center",
              }}
            />
          </MapboxGL.ShapeSource>
        )}

      </MapboxGL.MapView>

      {/* ── Layer Panel ── */}
      {(() => {
        const activeCount = [showParks, showTrails, showCampgrounds, showSightings, showIsochrone].filter(
          Boolean
        ).length;

        const trailZoomStatus = showTrails
          ? region.latitudeDelta >= TRAILS_PREVIEW_MAX_ZOOM
            ? "Zoom in to see trails"
            : region.latitudeDelta >= TRAILS_ZOOM_THRESHOLD
            ? `${trailPreviews.length} trail previews nearby`
            : `${trails.length} trails loaded`
          : undefined;

        const campZoomStatus = showCampgrounds
          ? campgrounds.length > 0
            ? `${campgrounds.length} campgrounds nearby`
            : "Loading campgrounds..."
          : undefined;

        const sightingsZoomStatus = showSightings
          ? `${sightings.length} sighting${sightings.length !== 1 ? "s" : ""}`
          : undefined;

        const dateFilterExtra = (
          <View style={styles.dateChipRow}>
            {DATE_FILTERS.map((f) => (
              <Pressable
                key={f.value}
                style={[styles.dateChip, dateFilter === f.value && styles.dateChipActive]}
                onPress={() => setDateFilter(f.value)}
                accessibilityRole="radio"
                accessibilityLabel={f.label}
              >
                {sightingsLoading && dateFilter === f.value ? (
                  <ActivityIndicator size="small" color={Colors.primaryLight} />
                ) : (
                  <Text
                    style={[
                      styles.dateChipText,
                      dateFilter === f.value && styles.dateChipTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        );

        const isochroneExtra = (
          <View style={styles.dateChipRow}>
            {[15, 30, 60].map((m) => (
              <Pressable
                key={m}
                style={[styles.dateChip, isochroneMinutes === m && styles.dateChipActive]}
                onPress={() => setIsochroneMinutes(m)}
                accessibilityRole="radio"
                accessibilityLabel={`${m} minute drive`}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    isochroneMinutes === m && styles.dateChipTextActive,
                  ]}
                >
                  {m}m
                </Text>
              </Pressable>
            ))}
          </View>
        );

        const groups: LayerGroup[] = [
          {
            title: "Nature & Recreation",
            layers: [
              {
                key: "parks",
                emoji: "🌲",
                name: "National Parks",
                description: "Parks, forests & recreation areas",
                color: Colors.primary,
                active: showParks,
                onToggle: () => setShowParks((v) => !v),
              },
              {
                key: "trails",
                emoji: "🥾",
                name: "Hiking Trails",
                description: "Named trails & footpaths",
                color: "#f59e0b",
                active: showTrails,
                onToggle: () => setShowTrails((v) => !v),
                zoomStatus: trailZoomStatus,
              },
              {
                key: "campgrounds",
                emoji: "⛺",
                name: "Campgrounds",
                description: "Camp sites & RV parks",
                color: CAMPGROUND_COLOR,
                active: showCampgrounds,
                onToggle: () => setShowCampgrounds((v) => !v),
                zoomStatus: campZoomStatus,
              },
            ],
          },
          {
            title: "Wildlife & Community",
            layers: [
              {
                key: "sightings",
                emoji: "🦅",
                name: "Wildlife Sightings",
                description: "Community reported sightings",
                color: "#7c3aed",
                active: showSightings,
                onToggle: () => setShowSightings((v) => !v),
                zoomStatus: sightingsZoomStatus,
                extra: dateFilterExtra,
              },
            ],
          },
          {
            title: "Reachability",
            layers: [
              {
                key: "isochrone",
                emoji: "🚗",
                name: "Drive Time Zone",
                description: userLocation
                  ? "Shows parks reachable from you"
                  : "Enable location to use",
                color: "#0ea5e9",
                active: showIsochrone,
                onToggle: () => setShowIsochrone((v) => !v),
                zoomStatus: showIsochrone
                  ? isochroneGeoJSON
                    ? `${isochroneMinutes}‑min drive zone active`
                    : "Calculating…"
                  : undefined,
                extra: isochroneExtra,
              },
            ],
          },
        ];

        return (
          <LayerPanel
            open={layerPanelOpen}
            onOpen={() => setLayerPanelOpen(true)}
            onClose={() => setLayerPanelOpen(false)}
            groups={groups}
            activeCount={activeCount}
          />
        );
      })()}

      {/* ── Status badges ── */}
      {showTrails && region.latitudeDelta >= TRAILS_PREVIEW_MAX_ZOOM && (
        <View style={styles.statusBadge}>
          <Ionicons name="search-outline" size={14} color={Colors.star} />
          <Text style={[styles.statusBadgeText, { color: Colors.star }]}>
            Zoom in to see trails
          </Text>
        </View>
      )}
      {showTrails && trailPreviewsLoading && (
        <View style={styles.statusBadge}>
          <ActivityIndicator size="small" color={Colors.primaryLight} />
          <Text style={[styles.statusBadgeText, { color: Colors.primaryLight }]}>
            Loading trails...
          </Text>
        </View>
      )}
      {showTrails && trailsLoading && (
        <View style={styles.statusBadge}>
          <ActivityIndicator size="small" color={Colors.primaryLight} />
          <Text style={[styles.statusBadgeText, { color: Colors.primaryLight }]}>
            Loading trail detail...
          </Text>
        </View>
      )}
      {showCampgrounds && campgroundsLoading && (
        <View style={[styles.statusBadge, styles.statusBadgeRow2]}>
          <ActivityIndicator size="small" color={CAMPGROUND_COLOR} />
          <Text style={[styles.statusBadgeText, { color: CAMPGROUND_COLOR }]}>
            Loading campgrounds...
          </Text>
        </View>
      )}

      {/* ── Trail difficulty legend ── */}
      {showTrails && trails.length > 0 && region.latitudeDelta < TRAILS_ZOOM_THRESHOLD && (
        <View style={styles.trailLegend}>
          {(
            Object.entries(DIFFICULTY_COLORS) as [keyof typeof DIFFICULTY_COLORS, string][]
          ).map(([key, color]) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{DIFFICULTY_LABELS[key]}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Report sighting FAB ── */}
      {showSightings && (
        <Pressable
          style={styles.fab}
          onPress={() => router.push("/sighting/submit")}
          accessibilityRole="button"
          accessibilityLabel="Report a wildlife sighting"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      )}

      {/* ── Sightings list panel ── */}
      {showSightings && (
        <View style={styles.listPanel}>
          <Pressable
            style={styles.listHandle}
            onPress={toggleList}
            accessibilityRole="button"
            accessibilityLabel={listOpen ? "Collapse sightings list" : "Expand sightings list"}
          >
            <View style={styles.handleBar} />
            <View style={styles.listHandleRow}>
              <View style={styles.listHandleLeft}>
                <Ionicons name="paw" size={14} color={Colors.primaryLight} />
                <Text style={styles.listCount}>
                  {sightings.length > 0
                    ? `${sightings.length} wildlife sightings`
                    : "No sightings yet — be the first!"}
                </Text>
              </View>
              <Ionicons
                name={listOpen ? "chevron-down" : "chevron-up"}
                size={18}
                color={Colors.textSecondary}
              />
            </View>
          </Pressable>

          <Animated.View style={{ height: listBodyAnim, overflow: "hidden" }}>
            <FlatList
              data={sightings.slice(0, 60)}
              keyExtractor={(item, i) => item.id ?? String(i)}
              showsVerticalScrollIndicator={false}
              scrollEnabled
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sightingRow}
                  onPress={() => setSelectedSighting(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.species.commonName} sighting at ${item.parkName}`}
                >
                  <View style={styles.rowEmojiWrap}>
                    <Text style={styles.rowEmoji}>{item.species.emoji}</Text>
                  </View>
                  <View style={styles.rowInfo}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowSpecies} numberOfLines={1}>
                        {item.species.commonName}
                      </Text>
                      <Text style={styles.rowTime}>{timeAgo(item.timestamp)}</Text>
                    </View>
                    <Text style={styles.rowPark} numberOfLines={1}>
                      {item.parkName}
                    </Text>
                  </View>
                  <View style={styles.rowCountBadge}>
                    <Text style={styles.rowCountText}>×{item.count}</Text>
                  </View>
                </Pressable>
              )}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: Colors.border }} />
              )}
            />
          </Animated.View>
        </View>
      )}

      {/* ── Trail detail sheet ── */}
      {selectedTrail && (
        <View style={styles.detailOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedTrail(null)} />
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              <View style={styles.sheetHeader}>
                <View
                  style={[styles.trailIconWrap, { backgroundColor: selectedTrail.color + "33" }]}
                >
                  <Ionicons name="walk" size={26} color={selectedTrail.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetSpecies} numberOfLines={2}>
                    {selectedTrail.name}
                  </Text>
                  <View style={styles.difficultyBadgeRow}>
                    <View
                      style={[styles.difficultyBadge, { backgroundColor: selectedTrail.color }]}
                    >
                      <Text style={styles.difficultyBadgeText}>
                        {DIFFICULTY_LABELS[selectedTrail.difficulty]}
                      </Text>
                    </View>
                  </View>
                </View>
                <Pressable
                  onPress={() => setSelectedTrail(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.sheetActionRow}>
                <Pressable
                  style={[styles.directionsBtn, { borderColor: selectedTrail.color }]}
                  onPress={() => {
                    const mid =
                      selectedTrail.coordinates[
                        Math.floor(selectedTrail.coordinates.length / 2)
                      ];
                    if (mid) openDirections(mid.latitude, mid.longitude, selectedTrail.name);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Get directions"
                >
                  <Ionicons name="navigate-outline" size={15} color={selectedTrail.color} />
                  <Text style={[styles.directionsBtnText, { color: selectedTrail.color }]}>
                    Directions
                  </Text>
                </Pressable>
              </View>

              <View style={styles.trailDetails}>
                <View style={styles.trailDetailItem}>
                  <Ionicons name="layers-outline" size={16} color={Colors.textSecondary} />
                  <View>
                    <Text style={styles.trailDetailLabel}>Surface</Text>
                    <Text style={styles.trailDetailValue}>{selectedTrail.surface}</Text>
                  </View>
                </View>
                <View style={styles.trailDetailItem}>
                  <Ionicons
                    name={
                      selectedTrail.dogFriendly === true
                        ? "checkmark-circle"
                        : selectedTrail.dogFriendly === false
                        ? "close-circle"
                        : "help-circle-outline"
                    }
                    size={16}
                    color={
                      selectedTrail.dogFriendly === true
                        ? Colors.primaryLight
                        : selectedTrail.dogFriendly === false
                        ? Colors.error
                        : Colors.textSecondary
                    }
                  />
                  <View>
                    <Text style={styles.trailDetailLabel}>Dogs</Text>
                    <Text style={styles.trailDetailValue}>
                      {selectedTrail.dogFriendly === true
                        ? "Allowed"
                        : selectedTrail.dogFriendly === false
                        ? "Not allowed"
                        : "Unknown"}
                    </Text>
                  </View>
                </View>
                <View style={styles.trailDetailItem}>
                  <Ionicons
                    name={selectedTrail.fee === true ? "cash-outline" : "gift-outline"}
                    size={16}
                    color={Colors.textSecondary}
                  />
                  <View>
                    <Text style={styles.trailDetailLabel}>Fee</Text>
                    <Text style={styles.trailDetailValue}>
                      {selectedTrail.fee === true
                        ? "Required"
                        : selectedTrail.fee === false
                        ? "Free"
                        : "Unknown"}
                    </Text>
                  </View>
                </View>
                {selectedTrail.access && (
                  <View style={styles.trailDetailItem}>
                    <Ionicons name="lock-open-outline" size={16} color={Colors.textSecondary} />
                    <View>
                      <Text style={styles.trailDetailLabel}>Access</Text>
                      <Text style={styles.trailDetailValue}>
                        {selectedTrail.access.charAt(0).toUpperCase() +
                          selectedTrail.access.slice(1)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Campground detail sheet ── */}
      {selectedCampground &&
        (() => {
          const contrib = campContributions[selectedCampground.id];
          const merged = {
            fee: contrib?.fee !== undefined ? contrib.fee : selectedCampground.fee,
            showers:
              contrib?.showers !== undefined ? contrib.showers : selectedCampground.showers,
            toilets:
              contrib?.toilets !== undefined ? contrib.toilets : selectedCampground.toilets,
            tents: contrib?.tents !== undefined ? contrib.tents : selectedCampground.tents,
            caravans:
              contrib?.caravans !== undefined ? contrib.caravans : selectedCampground.caravans,
          };
          const hasGaps = Object.values(merged).some((v) => v === null);
          const communityFields = new Set(
            Object.keys(contrib ?? {}).filter((k) =>
              ["fee", "showers", "toilets", "tents", "caravans"].includes(k)
            )
          );

          const editFields: { field: keyof CampEdits; label: string; icon: string }[] = [
            { field: "fee", label: "Entry Fee", icon: "cash-outline" },
            { field: "showers", label: "Showers", icon: "water-outline" },
            { field: "toilets", label: "Toilets", icon: "medical-outline" },
            { field: "tents", label: "Tents", icon: "flag-outline" },
            { field: "caravans", label: "RV / Caravan", icon: "car-outline" },
          ];

          async function handleSave() {
            if (!user || !selectedCampground) return;
            setCampSaving(true);
            setCampSavedOffline(false);
            const editData = {
              fee: campEdits.fee,
              showers: campEdits.showers,
              toilets: campEdits.toilets,
              tents: campEdits.tents,
              caravans: campEdits.caravans,
            };
            const displayName = user.displayName ?? "Anonymous";
            try {
              await saveCampgroundContribution(selectedCampground.id, editData, displayName);
              setCampContributions((prev) => ({
                ...prev,
                [selectedCampground.id]: {
                  ...campEdits,
                  contributedBy: displayName,
                  contributedAt: null,
                },
              }));
              setCampEditMode(false);
            } catch {
              saveDraft({ campId: selectedCampground.id, data: editData, displayName });
              setCampContributions((prev) => ({
                ...prev,
                [selectedCampground.id]: {
                  ...campEdits,
                  contributedBy: displayName,
                  contributedAt: null,
                },
              }));
              setCampSavedOffline(true);
              setCampEditMode(false);
            } finally {
              setCampSaving(false);
            }
          }

          return (
            <View style={styles.detailOverlay}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => {
                  setSelectedCampground(null);
                  setCampEditMode(false);
                  setCampSavedOffline(false);
                }}
              />
              <View style={styles.detailSheet}>
                <View style={styles.sheetHandle} />

                <View style={[styles.sheetHeader, { paddingHorizontal: 20 }]}>
                  <View
                    style={[styles.trailIconWrap, { backgroundColor: CAMPGROUND_COLOR + "33" }]}
                  >
                    <Ionicons name="flame" size={26} color={CAMPGROUND_COLOR} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetSpecies} numberOfLines={2}>
                      {selectedCampground.name}
                    </Text>
                    <View style={styles.difficultyBadgeRow}>
                      <View
                        style={[styles.difficultyBadge, { backgroundColor: CAMPGROUND_COLOR }]}
                      >
                        <Text style={styles.difficultyBadgeText}>Campground</Text>
                      </View>
                    </View>
                  </View>
                  {!campEditMode && user && (
                    <Pressable
                      style={styles.editIconBtn}
                      onPress={() => {
                        setCampEdits({
                          fee: merged.fee,
                          showers: merged.showers,
                          toilets: merged.toilets,
                          tents: merged.tents,
                          caravans: merged.caravans,
                        });
                        setCampEditMode(true);
                      }}
                      accessibilityLabel="Edit campground info"
                      accessibilityRole="button"
                    >
                      <Ionicons name="create-outline" size={20} color={CAMPGROUND_COLOR} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      setSelectedCampground(null);
                      setCampEditMode(false);
                      setCampSavedOffline(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={22} color={Colors.textSecondary} />
                  </Pressable>
                </View>

                {campEditMode ? (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.sheetScrollContent}
                  >
                    <Text style={styles.editModeTitle}>
                      Help other campers — fill in what you know
                    </Text>
                    {editFields.map(({ field, label, icon }) => {
                      const val = campEdits[field];
                      return (
                        <View key={field} style={styles.editRow}>
                          <View style={styles.editRowLabel}>
                            <Ionicons name={icon as any} size={15} color={Colors.textSecondary} />
                            <Text style={styles.editFieldLabel}>{label}</Text>
                          </View>
                          <View style={styles.triToggleRow}>
                            {([true, false, null] as const).map((opt) => (
                              <Pressable
                                key={String(opt)}
                                style={[styles.triBtn, val === opt && styles.triBtnActive]}
                                onPress={() =>
                                  setCampEdits((prev) => ({ ...prev, [field]: opt }))
                                }
                              >
                                <Text
                                  style={[
                                    styles.triBtnText,
                                    val === opt && styles.triBtnTextActive,
                                  ]}
                                >
                                  {opt === true ? "Yes" : opt === false ? "No" : "?"}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                    <View style={styles.editActions}>
                      <Pressable
                        style={styles.cancelBtn}
                        onPress={() => setCampEditMode(false)}
                      >
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={styles.saveBtn}
                        onPress={handleSave}
                        disabled={campSaving}
                      >
                        {campSaving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.saveBtnText}>Save</Text>
                        )}
                      </Pressable>
                    </View>
                  </ScrollView>
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.sheetScrollContent}
                  >
                    <View style={styles.trailDetails}>
                      {(
                        [
                          {
                            key: "fee",
                            label: "Fee",
                            icon: merged.fee === true ? "cash-outline" : "gift-outline",
                            val:
                              merged.fee === true
                                ? "Required"
                                : merged.fee === false
                                ? "Free"
                                : "Unknown",
                          },
                          {
                            key: "showers",
                            label: "Showers",
                            icon: "water-outline",
                            val:
                              merged.showers === true
                                ? "Available"
                                : merged.showers === false
                                ? "None"
                                : "Unknown",
                          },
                          {
                            key: "toilets",
                            label: "Toilets",
                            icon: "medical-outline",
                            val:
                              merged.toilets === true
                                ? "Available"
                                : merged.toilets === false
                                ? "None"
                                : "Unknown",
                          },
                          {
                            key: "tents",
                            label: "Tents",
                            icon: "flag-outline",
                            val:
                              merged.tents === true
                                ? "Allowed"
                                : merged.tents === false
                                ? "Not allowed"
                                : "Unknown",
                          },
                          {
                            key: "caravans",
                            label: "RV/Caravan",
                            icon: "car-outline",
                            val:
                              merged.caravans === true
                                ? "Allowed"
                                : merged.caravans === false
                                ? "Not allowed"
                                : "Unknown",
                          },
                        ] as const
                      ).map(({ key, label, icon, val }) => (
                        <View key={key} style={styles.trailDetailItem}>
                          <Ionicons name={icon as any} size={16} color={Colors.textSecondary} />
                          <View>
                            <Text style={styles.trailDetailLabel}>{label}</Text>
                            <Text
                              style={[
                                styles.trailDetailValue,
                                val === "Unknown" && { color: Colors.textMuted },
                              ]}
                            >
                              {val}
                            </Text>
                            {communityFields.has(key) && (
                              <Text style={styles.communityTag}>community</Text>
                            )}
                          </View>
                        </View>
                      ))}
                      {selectedCampground.operator && (
                        <View style={styles.trailDetailItem}>
                          <Ionicons
                            name="business-outline"
                            size={16}
                            color={Colors.textSecondary}
                          />
                          <View>
                            <Text style={styles.trailDetailLabel}>Operator</Text>
                            <Text style={styles.trailDetailValue}>
                              {selectedCampground.operator}
                            </Text>
                          </View>
                        </View>
                      )}
                      {selectedCampground.phone && (
                        <View style={styles.trailDetailItem}>
                          <Ionicons name="call-outline" size={16} color={Colors.textSecondary} />
                          <View>
                            <Text style={styles.trailDetailLabel}>Phone</Text>
                            <Text style={styles.trailDetailValue}>
                              {selectedCampground.phone}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>

                    {!user && hasGaps && (
                      <Pressable
                        style={styles.contributePrompt}
                        onPress={() => router.push("/(tabs)/profile")}
                      >
                        <Ionicons name="people-outline" size={15} color={CAMPGROUND_COLOR} />
                        <Text style={styles.contributeText}>Sign in to fill in missing info</Text>
                        <Ionicons name="chevron-forward" size={14} color={CAMPGROUND_COLOR} />
                      </Pressable>
                    )}
                    {contrib?.contributedBy && (
                      <Text style={styles.contributedBy}>
                        Info contributed by {contrib.contributedBy}
                      </Text>
                    )}
                    <View style={styles.sheetActionRow}>
                      <Pressable
                        style={[styles.directionsBtn, { borderColor: CAMPGROUND_COLOR }]}
                        onPress={() =>
                          openDirections(
                            selectedCampground.latitude,
                            selectedCampground.longitude,
                            selectedCampground.name
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Get directions to campground"
                      >
                        <Ionicons name="navigate-outline" size={15} color={CAMPGROUND_COLOR} />
                        <Text style={[styles.directionsBtnText, { color: CAMPGROUND_COLOR }]}>
                          Directions
                        </Text>
                      </Pressable>
                    </View>

                    {campSavedOffline && (
                      <View style={styles.offlineBanner}>
                        <Ionicons name="cloud-offline-outline" size={14} color={Colors.star} />
                        <Text style={styles.offlineBannerText}>
                          Saved locally — will sync when back online
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </View>
            </View>
          );
        })()}

      {/* ── Trail preview detail sheet ── */}
      {selectedTrailPreview && (
        <View style={styles.detailOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectedTrailPreview(null)}
          />
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <View style={[styles.sheetHeader, { paddingHorizontal: 20 }]}>
              <View
                style={[
                  styles.trailIconWrap,
                  { backgroundColor: selectedTrailPreview.color + "33" },
                ]}
              >
                <Ionicons name="walk" size={26} color={selectedTrailPreview.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetSpecies} numberOfLines={2}>
                  {selectedTrailPreview.name}
                </Text>
                <View style={styles.difficultyBadgeRow}>
                  <View
                    style={[
                      styles.difficultyBadge,
                      { backgroundColor: selectedTrailPreview.color },
                    ]}
                  >
                    <Text style={styles.difficultyBadgeText}>
                      {DIFFICULTY_LABELS[selectedTrailPreview.difficulty]}
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={() => setSelectedTrailPreview(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <View style={[styles.sheetScrollContent, { paddingBottom: 32 }]}>
              <View style={styles.sheetActionRow}>
                <Pressable
                  style={[
                    styles.directionsBtn,
                    { borderColor: selectedTrailPreview.color, flex: 1 },
                  ]}
                  onPress={() =>
                    openDirections(
                      selectedTrailPreview.latitude,
                      selectedTrailPreview.longitude,
                      selectedTrailPreview.name
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Get directions to trail"
                >
                  <Ionicons
                    name="navigate-outline"
                    size={15}
                    color={selectedTrailPreview.color}
                  />
                  <Text
                    style={[styles.directionsBtnText, { color: selectedTrailPreview.color }]}
                  >
                    Directions
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.directionsBtn,
                    { borderColor: Colors.textSecondary, flex: 1 },
                  ]}
                  onPress={() => {
                    setSelectedTrailPreview(null);
                    cameraRef.current?.setCamera({
                      centerCoordinate: [
                        selectedTrailPreview.longitude,
                        selectedTrailPreview.latitude,
                      ],
                      zoomLevel: 14,
                      animationDuration: 400,
                      animationMode: "flyTo",
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Zoom in to trail"
                >
                  <Ionicons name="search-outline" size={15} color={Colors.textSecondary} />
                  <Text style={[styles.directionsBtnText, { color: Colors.textSecondary }]}>
                    Zoom In
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── Sighting detail overlay ── */}
      {selectedSighting && (
        <View style={styles.detailOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectedSighting(null)}
          />
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              <View style={styles.sheetHeader}>
                <View style={styles.sheetEmojiWrap}>
                  <Text style={styles.sheetEmoji}>{selectedSighting.species.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetSpecies}>{selectedSighting.species.commonName}</Text>
                  <Text style={styles.sheetCategory}>
                    {selectedSighting.species.categoryLabel}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSelectedSighting(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.sheetMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {selectedSighting.parkName}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>×{selectedSighting.count}</Text>
                </View>
                <View style={styles.metaItem}>
                  <View
                    style={[
                      styles.confidenceDot,
                      {
                        backgroundColor:
                          CONFIDENCE_COLORS[selectedSighting.confidence] ??
                          Colors.textSecondary,
                      },
                    ]}
                  />
                  <Text style={styles.metaText}>{selectedSighting.confidence}</Text>
                </View>
              </View>

              {!!selectedSighting.notes && (
                <Text style={styles.sheetNotes}>{selectedSighting.notes}</Text>
              )}

              {selectedSighting.photoUrls?.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoList}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {selectedSighting.photoUrls.map((url, i) => (
                    <Image
                      key={i}
                      source={{ uri: url }}
                      style={styles.sheetPhoto}
                      contentFit="cover"
                    />
                  ))}
                </ScrollView>
              )}

              <Text style={styles.sheetReporter}>
                {selectedSighting.userDisplayName} · {timeAgo(selectedSighting.timestamp)}
              </Text>
              <View style={[styles.sheetActionRow, { marginTop: 12 }]}>
                <Pressable
                  style={[styles.directionsBtn, { borderColor: "#7c3aed", flex: 1 }]}
                  onPress={() =>
                    openDirections(
                      selectedSighting.location.latitude,
                      selectedSighting.location.longitude,
                      selectedSighting.species.commonName
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Get directions to sighting"
                >
                  <Ionicons name="navigate-outline" size={15} color="#7c3aed" />
                  <Text style={[styles.directionsBtnText, { color: "#7c3aed" }]}>
                    Directions
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.viewParkBtn, { flex: 1, justifyContent: "center" }]}
                  onPress={() => {
                    setSelectedSighting(null);
                    router.push(`/park/${selectedSighting.parkCode}`);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="View park"
                >
                  <Text style={styles.viewParkText}>View Park</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.primaryLight} />
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Route preview sheet ── */}
      <RoutePreviewSheet
        visible={!!routeTarget && (routeLoading || !!activeRoute)}
        loading={routeLoading}
        route={activeRoute}
        destinationName={routeTarget?.name ?? ""}
        onClose={() => {
          setRouteTarget(null);
          setActiveRoute(null);
          setIsNavigating(false);
        }}
        onNavigate={() => setIsNavigating(true)}
        onViewDetails={
          routeTarget ? () => router.push(`/park/${routeTarget.parkCode}`) : undefined
        }
      />

      {/* ── Navigation HUD ── */}
      {isNavigating && (
        <View style={styles.navHud}>
          <View style={styles.navHudLeft}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.navHudText}>Navigating to {routeTarget?.name}</Text>
          </View>
          <Pressable
            style={styles.navEndBtn}
            onPress={() => {
              setIsNavigating(false);
              setRouteTarget(null);
              setActiveRoute(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="End navigation"
          >
            <Text style={styles.navEndText}>End</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  webFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  webText: { color: Colors.textMuted, fontSize: 16 },

  // Banners
  permissionBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  permissionText: { flex: 1, color: Colors.textSecondary, fontSize: 13 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.error,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  errorBannerText: { color: Colors.white, fontSize: 14, fontWeight: "600" },
  retryText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "underline",
  },

  // Loading
  loadingOverlay: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 12,
  },

  // Date filter chips
  dateChipRow: { flexDirection: "row", gap: 6 },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.background,
    minWidth: 56,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateChipActive: { backgroundColor: "#7c3aed22", borderColor: "#7c3aed" },
  dateChipText: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Montserrat-Medium" },
  dateChipTextActive: { color: "#7c3aed", fontFamily: "Montserrat-SemiBold" },

  // FAB
  fab: {
    position: "absolute",
    bottom: 96,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },

  // List panel
  listPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  listHandle: { paddingTop: 10, paddingBottom: 12, paddingHorizontal: 16 },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 10,
  },
  listHandleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listHandleLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  listCount: { color: Colors.text, fontSize: 14, fontFamily: "Montserrat-SemiBold" },

  // Sighting rows
  sightingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowEmojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  rowEmoji: { fontSize: 20 },
  rowInfo: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowSpecies: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
    flex: 1,
  },
  rowTime: { color: Colors.textMuted, fontSize: 11 },
  rowPark: { color: Colors.textSecondary, fontSize: 12 },
  rowCountBadge: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  rowCountText: { color: Colors.primaryLight, fontSize: 12, fontWeight: "700" },

  // Detail overlay & sheet
  detailOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    zIndex: 200,
  },
  detailSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: SCREEN_HEIGHT * 0.68,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
    overflow: "hidden",
  },
  sheetScrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  sheetEmojiWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetEmoji: { fontSize: 28 },
  sheetSpecies: {
    color: Colors.text,
    fontSize: 19,
    fontFamily: "Montserrat-Bold",
  },
  sheetCategory: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Montserrat-Medium",
    marginTop: 2,
  },
  sheetMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: Colors.textSecondary, fontSize: 13 },
  confidenceDot: { width: 8, height: 8, borderRadius: 4 },
  sheetNotes: { color: Colors.text, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  photoList: { marginBottom: 14, marginHorizontal: -4 },
  sheetPhoto: {
    width: 130,
    height: 96,
    borderRadius: 12,
    marginHorizontal: 4,
    backgroundColor: Colors.background,
  },
  sheetReporter: { color: Colors.textMuted, fontSize: 12 },
  viewParkBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewParkText: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
  },

  // Status badges
  statusBadge: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  statusBadgeRow2: { top: 104 },
  statusBadgeText: { fontSize: 13, fontFamily: "Montserrat-Medium" },

  // Trail legend
  trailLegend: {
    position: "absolute",
    bottom: 16,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: "#fff", fontSize: 11, fontFamily: "Montserrat-Medium" },

  // Campground edit
  editIconBtn: { padding: 4, marginRight: 8 },
  editModeTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editRowLabel: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  editFieldLabel: { color: Colors.text, fontSize: 14, fontFamily: "Montserrat-SemiBold" },
  triToggleRow: { flexDirection: "row", gap: 6 },
  triBtn: {
    width: 42,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  triBtnActive: { backgroundColor: CAMPGROUND_COLOR, borderColor: CAMPGROUND_COLOR },
  triBtnText: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Montserrat-SemiBold" },
  triBtnTextActive: { color: "#fff" },
  editActions: { flexDirection: "row", gap: 12, marginTop: 20, marginBottom: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontFamily: "Montserrat-SemiBold",
    fontSize: 14,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: CAMPGROUND_COLOR,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontFamily: "Montserrat-Bold", fontSize: 14 },
  communityTag: {
    color: CAMPGROUND_COLOR,
    fontSize: 10,
    fontFamily: "Montserrat-Medium",
    marginTop: 1,
  },
  contributePrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: CAMPGROUND_COLOR + "18",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  contributeText: {
    color: CAMPGROUND_COLOR,
    fontSize: 13,
    fontFamily: "Montserrat-SemiBold",
    flex: 1,
  },
  contributedBy: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 10,
    textAlign: "center",
    fontStyle: "italic",
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.star + "55",
  },
  offlineBannerText: {
    color: Colors.star,
    fontSize: 12,
    fontFamily: "Montserrat-Medium",
    flex: 1,
  },

  // Trail detail
  trailIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  difficultyBadgeRow: { flexDirection: "row", marginTop: 4 },
  difficultyBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  difficultyBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  trailDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  trailDetailItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: "40%",
  },
  trailDetailLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: "Montserrat-Medium",
  },
  trailDetailValue: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
    marginTop: 1,
  },

  // Action buttons
  sheetActionRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  directionsBtnText: { fontSize: 14, fontFamily: "Montserrat-SemiBold" },

  // Navigation HUD
  navHud: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 50,
    gap: 10,
    zIndex: 150,
  },
  navHudLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navHudText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
    flex: 1,
  },
  navEndBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  navEndText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Montserrat-Bold",
  },
});
