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
import { fetchParks, fetchParksByActivity, type Park } from "@/services/npsApi";
import { ACTIVITY_LIST } from "@/constants/Activities";
import ActivityChips from "@/components/ActivityChips";
import TeaserCard from "@/components/TeaserCard";
import { getElevationProfile, type ElevationProfile } from "@/services/elevationApi";
import {
  getRecentSightings,
  type SightingDoc,
  getCampgroundContribution,
  saveCampgroundContribution,
  type CampgroundContribution,
} from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import {
  fetchTrails,
  fetchTrailPreviews,
  fetchTrailDetail,
  type Trail,
  type TrailPreview,
  type TrailDetail,
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  TRAILS_ZOOM_THRESHOLD,
  TRAILS_PREVIEW_MAX_ZOOM,
} from "@/services/trailsApi";
import {
  fetchCampgrounds,
  type Campground,
  CAMPGROUND_COLOR,
  CAMPGROUNDS_ZOOM_THRESHOLD,
} from "@/services/campgroundsApi";
import { saveDraft, syncPendingDrafts } from "@/services/offlineDrafts";
import {
  fetchOsmParks,
  type OsmPark,
  type OsmParkType,
  OSM_PARKS_ZOOM_THRESHOLD,
} from "@/services/parksOverpassApi";
import {
  fetchOutdoorPois,
  type OutdoorPoi,
  type PoiCategory,
  POI_ZOOM_THRESHOLD,
  POI_COLORS,
  POI_LABELS,
} from "@/services/outdoorPoisApi";
import { fetchRidbEnrichment, fetchRidbCampsites, type RidbFacility, type RidbCampsite } from "@/services/ridbApi";
import LayerPanel, { type LayerGroup } from "@/components/LayerPanel";
import RoutePreviewSheet from "@/components/RoutePreviewSheet";
import { sharePark } from "@/utils/share";
import {
  fetchDriveTimes,
  fetchRoute,
  fetchIsochrone,
  formatDurationShort,
  type RouteResult,
} from "@/services/mapboxRoutingApi";
import { getPreloadedParks, OUTDOOR_DESIGNATIONS } from "@/services/preloadService";
import MapboxGL from "@rnmapbox/maps";
import { detectRegion, formatDistance, formatElevation } from "@/services/regionDetection";
import type { AppRegion } from "@/constants/Regions";
import { getPreloadedSAParks, type SAPark } from "@/services/wdpaApi";
import { CURATED_SA_PARKS } from "@/constants/SouthAmericaParks";
import { DestinationsSection } from "@/components/DestinationsSection";

// ─── Mapbox init ─────────────────────────────────────────────────────────────

MapboxGL.setAccessToken(
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
    "pk.eyJ1IjoiZmlubnk2MTkiLCJhIjoiY21taTYzZHhxMDhpbzJxcTRxMDFuZW82aSJ9._JSEGDLmBGvl-7sB375Kbg"
);

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
    for (const s of items) if (s.species?.emoji) freq[s.species.emoji] = (freq[s.species.emoji] || 0) + 1;
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const emoji = sorted.length > 0 ? sorted[0][0] : "❓";

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
  let ms: number;
  if (typeof ts?.toMillis === "function") ms = ts.toMillis();
  else if (typeof ts?.seconds === "number") ms = ts.seconds * 1000;
  else if (typeof ts === "number") ms = ts;
  else if (ts instanceof Date) ms = ts.getTime();
  else return "unknown";
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

function thinCoords(
  coords: Array<{ latitude: number; longitude: number }>,
  maxPoints = 50
): Array<{ latitude: number; longitude: number }> {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  return coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
}

function haversineDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const { isPro, gateFeature } = useSubscription();
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
  const [showTrails, setShowTrails] = useState(false);
  const [showCampgrounds, setShowCampgrounds] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>(30);
  const [selectedSighting, setSelectedSighting] = useState<SightingDoc | null>(null);
  const [selectedTrail, setSelectedTrail] = useState<Trail | null>(null);
  const [selectedTrailPreview, setSelectedTrailPreview] = useState<TrailPreview | null>(null);
  const [trailDetailCache, setTrailDetailCache] = useState<Record<string, TrailDetail | null>>({});
  const [trailDetailLoading, setTrailDetailLoading] = useState(false);
  const [elevationCache, setElevationCache] = useState<Record<string, ElevationProfile | null>>({});
  const [selectedCampground, setSelectedCampground] = useState<Campground | null>(null);
  const [campContributions, setCampContributions] = useState<
    Record<string, CampgroundContribution | null>
  >({});
  const [ridbCache, setRidbCache] = useState<Record<string, RidbFacility | null>>({});
  const [ridbCampsites, setRidbCampsites] = useState<Record<string, RidbCampsite[]>>({});
  const [campsiteFilter, setCampsiteFilter] = useState<"all"|"tent"|"electric"|"hookup"|"walkin"|"ada">("all");
  const [campsitesExpanded, setCampsitesExpanded] = useState(false);
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
  const [activeActivities, setActiveActivities] = useState<string[]>([]);
  const [activityParks, setActivityParks] = useState<Park[]>([]);
  const [osmParks, setOsmParks] = useState<OsmPark[]>([]);
  const [showStateParks, setShowStateParks] = useState(true);
  const [osmParksLoading, setOsmParksLoading] = useState(false);
  const [selectedOsmPark, setSelectedOsmPark] = useState<OsmPark | null>(null);
  const [outdoorPois, setOutdoorPois] = useState<OutdoorPoi[]>([]);
  const [showDiscoverPois, setShowDiscoverPois] = useState(false);
  const [poisLoading, setPoisLoading] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState<OutdoorPoi | null>(null);
  const [show3D, setShow3D] = useState(false);
  const [useSatellite, setUseSatellite] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<AppRegion>("us");
  const [saParks, setSAParks] = useState<SAPark[]>([]);
  const [selectedSAPark, setSelectedSAPark] = useState<any>(null);
  // Auto-enable pro features when subscription activates, disable when it lapses
  useEffect(() => {
    if (isPro) {
      setShowTrails(true);
      setShowCampgrounds(true);
      setShowDiscoverPois(true);
      setShow3D(true);
    } else {
      setShowTrails(false);
      setShowCampgrounds(false);
      setShowDiscoverPois(false);
      setShow3D(false);
      setUseSatellite(false);
    }
  }, [isPro]);

  const [mapReady, setMapReady] = useState(false);
  const userStateCacheRef = useRef<string | undefined>(undefined);
  const trailFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const campFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewNonce = useRef(0);
  const campNonce = useRef(0);
  const driveTimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isochroneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osmParksFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osmParksNonce = useRef(0);
  const poiFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poiNonce = useRef(0);

  // ── Sync offline drafts on mount ─────────────────────────────────────────

  useEffect(() => {
    syncPendingDrafts().catch(() => {});
  }, []);

  // ── Load SA parks when region changes to South America ──────────────────

  useEffect(() => {
    if (currentRegion !== "sa") {
      setSAParks([]);
      return;
    }
    const preloaded = getPreloadedSAParks();
    if (preloaded && preloaded.length > 0) {
      setSAParks(preloaded);
    }
  }, [currentRegion]);

  // ── Load parks immediately on mount ──────────────────────────────────────

  useEffect(() => {
    loadParks();
  }, []);

  // ── Load activity-specific parks when filter changes ─────────────────────

  useEffect(() => {
    if (activeActivities.length === 0) {
      setActivityParks([]);
      return;
    }
    let cancelled = false;
    const stateCode = userStateCacheRef.current;
    const [uLon, uLat] = userLocation ?? [undefined, undefined];
    Promise.allSettled(
      activeActivities.map((name) => fetchParksByActivity(name, stateCode, uLat, uLon))
    ).then((results) => {
      if (cancelled) return;
      const merged: Park[] = [];
      const seen = new Set<string>();
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const p of r.value) {
            if (p.latitude && p.longitude && !seen.has(p.parkCode)) {
              seen.add(p.parkCode);
              merged.push(p);
            }
          }
        }
      }
      setActivityParks(merged);
    });
    return () => { cancelled = true; };
  }, [activeActivities]);

  // ── Location ──────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const lat = loc.coords.latitude;
          const lon = loc.coords.longitude;

          setUserLocation([lon, lat]);

          // Fly the Mapbox camera to user location with 3D tilt
          // (effects will fire trail/campground fetches once region state updates)
          cameraRef.current?.setCamera({
            centerCoordinate: [lon, lat],
            zoomLevel: 12,
            pitch: 45,
            animationDuration: 1800,
            animationMode: "flyTo",
          });
          // Keep region in sync for the Overpass debounce effects
          setRegion({
            latitude: lat,
            longitude: lon,
            latitudeDelta: 1.0,
            longitudeDelta: 1.0,
          });
          try {
            const [geo] = await Location.reverseGeocodeAsync({
              latitude: lat,
              longitude: lon,
            });
            const stateCode = geo?.region ? STATE_NAME_TO_CODE[geo.region] : undefined;
            userStateCacheRef.current = stateCode;
            if (stateCode) loadParks(stateCode);
          } catch {
            // reverse geocode failed — initial loadParks() already ran
          }
        } catch {
          // location failed — initial loadParks() already ran
        }
      } else {
        setLocationDenied(true);
      }
    })();
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────

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
        region.latitudeDelta < TRAILS_PREVIEW_MAX_ZOOM &&
        region.latitudeDelta < 15 // skip at continental zoom — wait for user location
      ) {
        loadTrailPreviews(region);
      } else if (region.latitudeDelta >= TRAILS_PREVIEW_MAX_ZOOM || region.latitudeDelta >= 15) {
        // Don't clear previews at continental zoom — keep any that were already loaded
      } else {
        setTrailPreviews([]);
      }
    }, 250);
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
    }, 350);
    return () => {
      if (trailFetchTimer.current) clearTimeout(trailFetchTimer.current);
    };
  }, [showTrails, region]);

  useEffect(() => {
    if (!showCampgrounds || region.latitudeDelta >= CAMPGROUNDS_ZOOM_THRESHOLD) {
      setCampgrounds([]);
      return;
    }
    if (campFetchTimer.current) clearTimeout(campFetchTimer.current);
    campFetchTimer.current = setTimeout(() => {
      loadCampgrounds(region);
    }, 300);
    return () => {
      if (campFetchTimer.current) clearTimeout(campFetchTimer.current);
    };
  }, [showCampgrounds, region]);

  useEffect(() => {
    if (!showStateParks || region.latitudeDelta >= OSM_PARKS_ZOOM_THRESHOLD) {
      setOsmParks([]);
      return;
    }
    if (osmParksFetchTimer.current) clearTimeout(osmParksFetchTimer.current);
    osmParksFetchTimer.current = setTimeout(() => {
      loadOsmParks(region);
    }, 400);
    return () => {
      if (osmParksFetchTimer.current) clearTimeout(osmParksFetchTimer.current);
    };
  }, [showStateParks, region]);

  useEffect(() => {
    if (!showDiscoverPois || region.latitudeDelta >= POI_ZOOM_THRESHOLD) {
      setOutdoorPois([]);
      return;
    }
    if (poiFetchTimer.current) clearTimeout(poiFetchTimer.current);
    poiFetchTimer.current = setTimeout(() => {
      loadPois(region);
    }, 350);
    return () => {
      if (poiFetchTimer.current) clearTimeout(poiFetchTimer.current);
    };
  }, [showDiscoverPois, region]);

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
    }, 600);
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
    // Use preloaded data for initial national view (no state filter)
    if (!stateCode) {
      const preloaded = getPreloadedParks();
      if (preloaded && preloaded.length > 0) {
        setParks(preloaded);
        setLoading(false);
        setMapReady(true);
        return;
      }
    }
    setLoading(true);
    setError(false);
    try {
      const PAGE = 500;
      const first = await fetchParks({ limit: PAGE, start: 0, stateCode });
      let allParks = first.data;
      const total = parseInt(first.total, 10);
      if (!stateCode && total > PAGE) {
        const second = await fetchParks({ limit: PAGE, start: PAGE, stateCode });
        allParks = [...allParks, ...second.data];
      }
      const filtered = allParks.filter(
        (p) => p.latitude && p.longitude && OUTDOOR_DESIGNATIONS.has(p.designation)
      );
      setParks(filtered);
      if (!mapReady) setMapReady(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      if (!mapReady) setMapReady(true);
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
    const myNonce = ++previewNonce.current;
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
      // Only update state if this is still the latest request (prevents stale overwrites)
      if (myNonce === previewNonce.current) {
        setTrailPreviews(data);
      }
    } catch {
      // non-fatal
    } finally {
      if (myNonce === previewNonce.current) {
        setTrailPreviewsLoading(false);
      }
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
      setCampsitesExpanded(false);
      setCampsiteFilter("all");
      return;
    }
    if (!(selectedCampground.id in campContributions)) {
      getCampgroundContribution(selectedCampground.id)
        .then((data) => {
          setCampContributions((prev) => ({ ...prev, [selectedCampground.id]: data }));
        })
        .catch(() => {});
    }
    if (currentRegion === "us" && !(selectedCampground.id in ridbCache)) {
      fetchRidbEnrichment(
        selectedCampground.name,
        selectedCampground.latitude,
        selectedCampground.longitude,
      ).then((data) => {
        setRidbCache((prev) => ({ ...prev, [selectedCampground.id]: data }));
        // Once we have a facility ID, pre-fetch campsites in background
        if (data?.facilityId && !(selectedCampground.id in ridbCampsites)) {
          fetchRidbCampsites(data.facilityId).then((sites) => {
            setRidbCampsites((prev) => ({ ...prev, [selectedCampground.id]: sites }));
          });
        }
      });
    }
  }, [selectedCampground]);

  // ── Fetch trail detail when a preview pin is tapped ─────────────────────
  useEffect(() => {
    if (!selectedTrailPreview) return;
    const id = selectedTrailPreview.id;
    if (id in trailDetailCache) return; // already fetched
    setTrailDetailLoading(true);
    fetchTrailDetail(id)
      .then((detail) => {
        setTrailDetailCache((prev) => ({ ...prev, [id]: detail }));
        // Fetch elevation for Pro users
        if (isPro && detail && detail.coordinates.length >= 2 && !(id in elevationCache)) {
          getElevationProfile(String(id), detail.coordinates)
            .then((profile) => setElevationCache((prev) => ({ ...prev, [String(id)]: profile })))
            .catch(() => {});
        }
      })
      .catch(() => {
        setTrailDetailCache((prev) => ({ ...prev, [id]: null }));
      })
      .finally(() => setTrailDetailLoading(false));
  }, [selectedTrailPreview]);

  // Also fetch elevation for directly-selected trails (from polyline tap)
  useEffect(() => {
    if (!selectedTrail || !isPro) return;
    const id = String(selectedTrail.id ?? selectedTrail.name);
    if (id in elevationCache || selectedTrail.coordinates.length < 2) return;
    getElevationProfile(id, selectedTrail.coordinates)
      .then((profile) => setElevationCache((prev) => ({ ...prev, [id]: profile })))
      .catch(() => {});
  }, [selectedTrail, isPro]);

  async function loadCampgrounds(r: Region) {
    const myNonce = ++campNonce.current;
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
      if (myNonce === campNonce.current) {
        setCampgrounds(data);
      }
    } catch {
      // non-fatal
    } finally {
      if (myNonce === campNonce.current) {
        setCampgroundsLoading(false);
      }
    }
  }

  async function loadPois(r: Region) {
    const myNonce = ++poiNonce.current;
    setPoisLoading(true);
    try {
      const half_lat = r.latitudeDelta / 2;
      const half_lng = r.longitudeDelta / 2;
      const data = await fetchOutdoorPois(
        r.latitude - half_lat,
        r.longitude - half_lng,
        r.latitude + half_lat,
        r.longitude + half_lng,
      );
      if (myNonce === poiNonce.current) setOutdoorPois(data);
    } catch {
      // non-fatal
    } finally {
      if (myNonce === poiNonce.current) setPoisLoading(false);
    }
  }

  async function loadOsmParks(r: Region) {
    const myNonce = ++osmParksNonce.current;
    setOsmParksLoading(true);
    try {
      const half_lat = r.latitudeDelta / 2;
      const half_lng = r.longitudeDelta / 2;
      const data = await fetchOsmParks(
        r.latitude - half_lat,
        r.longitude - half_lng,
        r.latitude + half_lat,
        r.longitude + half_lng,
      );
      if (myNonce === osmParksNonce.current) {
        setOsmParks(data);
      }
    } catch {
      // non-fatal
    } finally {
      if (myNonce === osmParksNonce.current) {
        setOsmParksLoading(false);
      }
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const clusters = useMemo(
    () => (showSightings ? buildClusters(sightings, region.latitudeDelta) : []),
    [sightings, region.latitudeDelta, showSightings]
  );

  const visibleParks = useMemo(() => {
    if (!showParks) return [];

    // Merge base parks + activity-specific parks (deduplicated)
    const allParks = activeActivities.length > 0
      ? (() => {
          const seen = new Set(parks.map((p) => p.parkCode));
          return [...parks, ...activityParks.filter((p) => !seen.has(p.parkCode))];
        })()
      : parks;

    // Activity filter: only parks that offer at least one selected activity
    const filtered = activeActivities.length === 0
      ? allParks.filter((p) => p.latitude && p.longitude)
      : allParks.filter(
          (p) =>
            p.latitude &&
            p.longitude &&
            activeActivities.some((act) =>
              p.activities.some((a) => a.name.toLowerCase().includes(act.toLowerCase()))
            )
        );

    return filtered
      .map((p) => ({
        park: p,
        dist: haversineDeg(
          region.latitude, region.longitude,
          parseFloat(p.latitude), parseFloat(p.longitude)
        ),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 25)
      .map(({ park }) => park);
  }, [parks, activityParks, activeActivities, showParks, region.latitude, region.longitude]);

  // Park marker accent color — follows the single selected activity's color
  const parkMarkerColor = useMemo(() => {
    if (activeActivities.length === 1) {
      return ACTIVITY_LIST.find((a) => a.name === activeActivities[0])?.accentColor ?? Colors.primary;
    }
    return Colors.primary;
  }, [activeActivities]);

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

  const visibleOsmParks = useMemo(() => {
    if (!showStateParks) return [];
    // Filter to viewport and deduplicate against NPS parks (fuzzy name match within 5km)
    const npsNames = new Set(parks.map((p) => p.fullName.toLowerCase()));
    return osmParks
      .filter((p) => inViewport(p.latitude, p.longitude, region))
      .filter((p) => {
        const nameLower = p.name.toLowerCase();
        // Skip if name closely matches an NPS park name
        for (const npsName of npsNames) {
          if (npsName.includes(nameLower) || nameLower.includes(npsName)) return false;
        }
        return true;
      })
      .slice(0, 60);
  }, [osmParks, parks, region, showStateParks]);

  const visiblePois = useMemo(() => {
    if (!showDiscoverPois) return [];
    return outdoorPois
      .filter((p) => inViewport(p.latitude, p.longitude, region))
      .slice(0, 80);
  }, [outdoorPois, region, showDiscoverPois]);

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


  const trailPreviewsGeoJSON = useMemo<GeoJSONFC>(() => {
    const seen = new Set<string>();
    const deduped = visibleTrailPreviews.filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });
    return {
      type: "FeatureCollection",
      features: deduped.map((p, idx) => ({
        type: "Feature",
        id: idx,
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
        properties: { id: String(p.id), name: p.name, difficulty: p.difficulty, color: p.color },
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
        .slice(0, 50)
        .map((trail, idx) => {
          const mid = trail.coordinates[Math.floor(trail.coordinates.length / 2)];
          if (!mid) return null;
          return {
            type: "Feature",
            id: idx,
            geometry: { type: "Point", coordinates: [mid.longitude, mid.latitude] },
            properties: { id: trail.id, name: trail.name, color: trail.color },
          };
        })
        .filter(Boolean),
    };
  }, [trails]);


  const clustersGeoJSON = useMemo<GeoJSONFC>(
    () => ({
      type: "FeatureCollection",
      features: clusters.map((c, idx) => ({
        type: "Feature",
        id: idx,
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        properties: {
          idx,
          count: c.count,
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

  // ── GeoJSON for native pin layers ─────────────────────────────────────────

  const parksGeoJSON = useMemo<GeoJSONFC>(() => ({
    type: "FeatureCollection",
    features: visibleParks.map((p, idx) => {
      const dt = driveTimes[p.parkCode];
      return {
        type: "Feature",
        id: idx,
        geometry: {
          type: "Point",
          coordinates: [parseFloat(p.longitude), parseFloat(p.latitude)],
        },
        properties: {
          parkCode: p.parkCode,
          name: p.name,
          fullName: p.fullName,
          color: parkMarkerColor,
          driveTime: dt != null ? formatDurationShort(dt) : "",
        },
      };
    }),
  }), [visibleParks, driveTimes, parkMarkerColor]);

  const saParksGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: saParks.map((p, idx) => ({
      type: "Feature" as const,
      id: idx + 10000,
      geometry: {
        type: "Point" as const,
        coordinates: [p.longitude, p.latitude],
      },
      properties: {
        id: p.id,
        name: p.name,
        country: p.country,
        designation: p.designation,
        areaKm2: p.areaKm2,
      },
    })),
  }), [saParks]);

  const campgroundsGeoJSON = useMemo<GeoJSONFC>(() => ({
    type: "FeatureCollection",
    features: visibleCampgrounds.map((c, idx) => ({
      type: "Feature",
      id: idx,
      geometry: {
        type: "Point",
        coordinates: [c.longitude, c.latitude],
      },
      properties: {
        id: c.id,
        name: c.name,
        color: CAMPGROUND_COLOR,
      },
    })),
  }), [visibleCampgrounds]);

  const osmParksGeoJSON = useMemo<GeoJSONFC>(() => ({
    type: "FeatureCollection",
    features: visibleOsmParks.map((p, idx) => ({
      type: "Feature",
      id: idx,
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      properties: {
        id: p.id,
        name: p.name,
        parkType: p.parkType,
        color: p.color,
      },
    })),
  }), [visibleOsmParks]);

  // ── Native GL layer press handlers ─────────────────────────────────────

  const handleParkPress = useCallback((e: any) => {
    const props = e.features?.[0]?.properties;
    if (!props?.parkCode) return;
    if (userLocation) {
      const park = visibleParks.find((p) => p.parkCode === props.parkCode);
      if (!park) return;
      setRouteTarget({ parkCode: park.parkCode, name: park.fullName });
      setActiveRoute(null);
      setRouteLoading(true);
      fetchRoute(userLocation, [parseFloat(park.longitude), parseFloat(park.latitude)])
        .then((route) => setActiveRoute(route))
        .catch(() => setActiveRoute(null))
        .finally(() => setRouteLoading(false));
    } else {
      router.push(`/park/${props.parkCode}`);
    }
  }, [userLocation, visibleParks]);

  const handleCampPress = useCallback((e: any) => {
    const id = e.features?.[0]?.properties?.id;
    if (!id) return;
    const camp = campgrounds.find((c) => c.id === String(id));
    if (camp) setSelectedCampground(camp);
  }, [campgrounds]);

  const handleTrailPreviewPress = useCallback((e: any) => {
    const id = e.features?.[0]?.properties?.id;
    if (!id) return;
    const preview = trailPreviews.find((p) => p.id === String(id));
    if (preview) setSelectedTrailPreview(preview);
  }, [trailPreviews]);

  const handleTrailLabelPress = useCallback((e: any) => {
    const id = e.features?.[0]?.properties?.id;
    if (!id) return;
    const trail = trails.find((t) => t.id === String(id));
    if (trail) setSelectedTrail(trail);
  }, [trails]);

  const handleClusterPress = useCallback((e: any) => {
    const props = e.features?.[0]?.properties;
    if (!props) return;
    const idx = props.idx;
    const cluster = clusters[idx];
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
  }, [clusters, currentZoom]);

  const handleOsmParkPress = useCallback((e: any) => {
    const id = e.features?.[0]?.properties?.id;
    if (!id) return;
    const park = osmParks.find((p) => p.id === String(id));
    if (park) setSelectedOsmPark(park);
  }, [osmParks]);

  const poisGeoJSON = useMemo<GeoJSONFC>(() => ({
    type: "FeatureCollection",
    features: visiblePois.map((p, idx) => ({
      type: "Feature",
      id: idx,
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      properties: { id: p.id, name: p.name, category: p.category, color: p.color, icon: ({ viewpoint: "marker-viewpoint", waterfall: "marker-waterfall", peak: "marker-peak", picnic: "marker-picnic", spring: "marker-spring" } as Record<string, string>)[p.category] ?? "marker-viewpoint" },
    })),
  }), [visiblePois]);

  const handlePoiPress = useCallback((e: any) => {
    const id = e.features?.[0]?.properties?.id;
    if (!id) return;
    const poi = outdoorPois.find((p) => p.id === String(id));
    if (poi) setSelectedPoi(poi);
  }, [outdoorPois]);

  // ── Fly to SA destination ────────────────────────────────────────────────

  const handleDestinationPress = (lat: number, lng: number) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: 7,
      animationDuration: 2000,
    });
  };

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
      {!mapReady && (
        <View style={[styles.map, { alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}
      {mapReady && <MapboxGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={useSatellite ? "mapbox://styles/mapbox/satellite-streets-v12" : "mapbox://styles/mapbox/outdoors-v12"}
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
          const zoom = props.zoom ?? currentZoom;
          setCurrentZoom(zoom);
          setRegion({
            latitude: lat,
            longitude: lon,
            latitudeDelta: Math.max(north - south, 0.001),
            longitudeDelta: Math.max(east - west, 0.001),
          });
          const detected = detectRegion(lat, lon);
          setCurrentRegion(detected);
        }}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: userLocation
              ? userLocation
              : [US_CENTER.longitude, US_CENTER.latitude],
            zoomLevel: userLocation ? 12 : 4,
            pitch: userLocation && show3D ? 45 : 0,
          }}
          followUserLocation={isNavigating}
          followUserMode={isNavigating ? MapboxGL.UserTrackingMode.FollowWithCourse : undefined}
          followZoomLevel={isNavigating ? 17 : undefined}
          followPitch={isNavigating ? 50 : undefined}
        />

        <MapboxGL.UserLocation visible animated />

        {/* ── Custom marker images ── */}
        <MapboxGL.Images
          images={{
            "marker-park": require("../../assets/markers/marker-park.png"),
            "marker-state-park": require("../../assets/markers/marker-state-park.png"),
            "marker-camp": require("../../assets/markers/marker-camp.png"),
            "marker-trail": require("../../assets/markers/marker-trail.png"),
            "marker-trail-label": require("../../assets/markers/marker-trail-label.png"),
            "marker-viewpoint": require("../../assets/markers/marker-viewpoint.png"),
            "marker-waterfall": require("../../assets/markers/marker-waterfall.png"),
            "marker-peak": require("../../assets/markers/marker-peak.png"),
            "marker-picnic": require("../../assets/markers/marker-picnic.png"),
            "marker-spring": require("../../assets/markers/marker-spring.png"),
            "marker-sighting": require("../../assets/markers/marker-sighting.png"),
          }}
        />

        {/* ── 3D Terrain + Sky atmosphere ── */}
        {show3D && (
          <MapboxGL.RasterDemSource
            id="mapbox-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={514}
            maxZoomLevel={14}
          >
            <MapboxGL.Terrain style={{ exaggeration: 1.5 }} />
          </MapboxGL.RasterDemSource>
        )}
        {show3D && (
          <MapboxGL.SkyLayer
            id="sky-layer"
            style={{
              skyType: "atmosphere",
              skyAtmosphereSun: [0.0, 90.0],
              skyAtmosphereSunIntensity: 15,
            }}
          />
        )}

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
            {/* Dark casing for contrast against any basemap */}
            <MapboxGL.LineLayer
              id="trail-casing"
              style={{
                lineColor: "rgba(0,0,0,0.55)",
                lineWidth: 7,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* Colored trail on top */}
            <MapboxGL.LineLayer
              id="trail-lines"
              aboveLayerID="trail-casing"
              style={{
                lineColor: ["get", "color"],
                lineWidth: 4,
                lineCap: "round",
                lineJoin: "round",
              }}
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

        {/* ── Active route polyline ── */}
        {activeRoute && (
          <MapboxGL.ShapeSource id="route-src" shape={activeRoute.geometry}>
            <MapboxGL.LineLayer
              id="route-casing"
              style={{
                lineColor: "#fff",
                lineWidth: 7,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <MapboxGL.LineLayer
              id="route-line"
              aboveLayerID="route-casing"
              style={{
                lineColor: Colors.primary,
                lineWidth: 4,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Discovery POIs — viewpoints, waterfalls, peaks (native GL) ── */}
        {showDiscoverPois && visiblePois.length > 0 && (
          <MapboxGL.ShapeSource id="poi-src" shape={poisGeoJSON} onPress={handlePoiPress}>
            <MapboxGL.SymbolLayer id="poi-label" style={{ iconImage: ["get", "icon"], iconSize: 0.22, iconAllowOverlap: true, textField: ["get", "name"], textSize: 10, textOffset: [0, 1.8], textColor: "#fff", textHaloColor: "rgba(0,0,0,0.65)", textHaloWidth: 1.2, textMaxWidth: 7, textOptional: true, textFont: ["DIN Pro Medium"] }} />
          </MapboxGL.ShapeSource>
        )}

        {/* ── OSM state/county/regional park pins (native GL) ── */}
        {showStateParks && visibleOsmParks.length > 0 && (
          <MapboxGL.ShapeSource id="osm-parks-src" shape={osmParksGeoJSON} onPress={handleOsmParkPress}>
            <MapboxGL.SymbolLayer id="osm-park-label" style={{ iconImage: "marker-state-park", iconSize: 0.2, iconAllowOverlap: true, textField: ["get", "name"], textSize: 10, textOffset: [0, 1.8], textColor: "#fff", textHaloColor: "rgba(0,0,0,0.65)", textHaloWidth: 1.2, textMaxWidth: 8, textOptional: true, textFont: ["DIN Pro Medium"] }} />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Campground pins (native GL) ── */}
        {showCampgrounds && visibleCampgrounds.length > 0 && (
          <MapboxGL.ShapeSource id="camp-src" shape={campgroundsGeoJSON} onPress={handleCampPress}>
            <MapboxGL.SymbolLayer id="camp-label" style={{ iconImage: "marker-camp", iconSize: 0.2, iconAllowOverlap: true, textField: ["get", "name"], textSize: 10, textOffset: [0, 1.8], textColor: "#fff", textHaloColor: "rgba(0,0,0,0.65)", textHaloWidth: 1.2, textMaxWidth: 7, textOptional: true, textFont: ["DIN Pro Medium"] }} />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Trail preview pins (native GL) ── */}
        {showTrails && region.latitudeDelta >= TRAILS_ZOOM_THRESHOLD && region.latitudeDelta < TRAILS_PREVIEW_MAX_ZOOM && visibleTrailPreviews.length > 0 && (
          <MapboxGL.ShapeSource id="tp-src" shape={trailPreviewsGeoJSON} onPress={handleTrailPreviewPress}>
            <MapboxGL.SymbolLayer id="tp-label" style={{ iconImage: "marker-trail", iconSize: 0.2, iconAllowOverlap: true, textField: ["get", "name"], textSize: 10, textOffset: [0, 1.8], textColor: "#fff", textHaloColor: "rgba(0,0,0,0.6)", textHaloWidth: 1.2, textMaxWidth: 7, textOptional: true, textFont: ["DIN Pro Medium"] }} />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Trail label pins (native GL) ── */}
        {showTrails && trails.length > 0 && region.latitudeDelta < TRAILS_ZOOM_THRESHOLD && (
          <MapboxGL.ShapeSource id="tl-src" shape={trailLabelsGeoJSON} onPress={handleTrailLabelPress}>
            <MapboxGL.SymbolLayer id="tl-name" style={{ iconImage: "marker-trail-label", iconSize: 0.18, iconAllowOverlap: true, textField: ["get", "name"], textSize: 12, textFont: ["DIN Pro Bold"], textOffset: [0, 1.6], textColor: ["get", "color"], textHaloColor: "rgba(0,0,0,0.75)", textHaloWidth: 1.5 }} />
          </MapboxGL.ShapeSource>
        )}

        {/* ── National Park pins (native GL — largest, always on top) ── */}
        {showParks && visibleParks.length > 0 && (
          <MapboxGL.ShapeSource id="parks-src" shape={parksGeoJSON} onPress={handleParkPress}>
            <MapboxGL.SymbolLayer id="park-label" style={{ iconImage: "marker-park", iconSize: 0.25, iconAllowOverlap: true, textAllowOverlap: true, textField: ["get", "name"], textSize: 11, textOffset: [0, 2.0], textColor: "#fff", textHaloColor: "rgba(0,0,0,0.7)", textHaloWidth: 1.5, textMaxWidth: 8, textFont: ["DIN Pro Medium"] }} />
          </MapboxGL.ShapeSource>
        )}

        {/* ── South America park pins ── */}
        {currentRegion === "sa" && saParks.length > 0 && (
          <MapboxGL.ShapeSource
            id="sa-parks-src"
            shape={saParksGeoJSON}
            onPress={(e: any) => {
              const feature = e.features?.[0];
              if (!feature) return;
              const props = feature.properties;
              if (gateFeature("Explore South America")) return;
              setSelectedSAPark(props);
            }}
          >
            <MapboxGL.SymbolLayer
              id="sa-park-label"
              style={{
                iconImage: "marker-park",
                iconSize: 0.25,
                iconAllowOverlap: true,
                textField: ["get", "name"],
                textSize: 11,
                textOffset: [0, 2.0],
                textColor: "#fff",
                textHaloColor: "rgba(0,0,0,0.7)",
                textHaloWidth: 1.5,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── Sighting cluster pins (native GL) ── */}
        {showSightings && clusters.length > 0 && (
          <MapboxGL.ShapeSource id="cluster-src" shape={clustersGeoJSON} onPress={handleClusterPress}>
            <MapboxGL.SymbolLayer id="cl-icon" filter={["==", ["get", "count"], 1]} style={{ iconImage: "marker-sighting", iconSize: 0.2, iconAllowOverlap: true }} />
            <MapboxGL.CircleLayer id="cl-halo" filter={[">", ["get", "count"], 1]} style={{ circleRadius: ["interpolate", ["linear"], ["get", "count"], 2, 12, 5, 14, 20, 18], circleColor: "#fff" }} />
            <MapboxGL.CircleLayer id="cl-dot" filter={[">", ["get", "count"], 1]} style={{ circleRadius: ["interpolate", ["linear"], ["get", "count"], 2, 10, 5, 12, 20, 16], circleColor: "#7c3aed" }} />
            <MapboxGL.SymbolLayer id="cl-count" filter={[">", ["get", "count"], 1]} style={{ textField: ["to-string", ["get", "count"]], textSize: 12, textColor: "#fff", textFont: ["DIN Pro Bold"], textAllowOverlap: true }} />
          </MapboxGL.ShapeSource>
        )}

      </MapboxGL.MapView>}


      {/* ── DEBUG overlay (remove before build) ── */}

      {/* ── Layer Panel ── */}
      {(() => {
        const activeCount = [
          showParks,
          showStateParks,
          showTrails,
          showCampgrounds,
          showDiscoverPois,
          show3D,
          useSatellite,
          showSightings,
          showIsochrone,
          activeActivities.length > 0,
        ].filter(Boolean).length;

        const trailZoomStatus = showTrails
          ? region.latitudeDelta >= TRAILS_PREVIEW_MAX_ZOOM
            ? "Zoom in to see trails"
            : region.latitudeDelta >= TRAILS_ZOOM_THRESHOLD
            ? `${trailPreviews.length} trail previews nearby`
            : `${trails.length} trails loaded`
          : undefined;

        const campZoomStatus = showCampgrounds
          ? region.latitudeDelta >= CAMPGROUNDS_ZOOM_THRESHOLD
            ? "Zoom in to see campgrounds"
            : campgroundsLoading
            ? "Loading campgrounds..."
            : campgrounds.length > 0
            ? `${campgrounds.length} campgrounds nearby`
            : "No campgrounds found nearby"
          : undefined;

        const sightingsZoomStatus = showSightings
          ? `${sightings.length} sighting${sightings.length !== 1 ? "s" : ""}`
          : undefined;

        const osmParksZoomStatus = showStateParks
          ? region.latitudeDelta >= OSM_PARKS_ZOOM_THRESHOLD
            ? "Zoom in to see state & local parks"
            : osmParksLoading
            ? "Loading parks..."
            : osmParks.length > 0
            ? `${visibleOsmParks.length} parks nearby`
            : "No state/local parks found nearby"
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
                onToggle: () => { if (gateFeature("Unlock Trail Routes")) return; setShowTrails((v) => !v); },
                zoomStatus: trailZoomStatus,
                isPro: !isPro,
              },
              {
                key: "stateParks",
                emoji: "🌳",
                name: "State & Local Parks",
                description: "State, county & regional parks",
                color: "#059669",
                active: showStateParks,
                onToggle: () => setShowStateParks((v) => !v),
                zoomStatus: osmParksZoomStatus,
              },
              {
                key: "campgrounds",
                emoji: "⛺",
                name: "Campgrounds",
                description: "Camp sites & RV parks",
                color: CAMPGROUND_COLOR,
                active: showCampgrounds,
                onToggle: () => { if (gateFeature("Unlock Campground Details")) return; setShowCampgrounds((v) => !v); },
                zoomStatus: campZoomStatus,
                isPro: !isPro,
              },
            ],
          },
          {
            title: "Discovery",
            layers: [
              {
                key: "discoverPois",
                emoji: "🔭",
                name: "Points of Interest",
                description: "Viewpoints, waterfalls, peaks & more",
                color: "#8b5cf6",
                active: showDiscoverPois,
                onToggle: () => { if (gateFeature("Unlock Hidden Gems")) return; setShowDiscoverPois((v) => !v); },
                isPro: !isPro,
                zoomStatus: showDiscoverPois
                  ? region.latitudeDelta >= POI_ZOOM_THRESHOLD
                    ? "Zoom in to discover POIs"
                    : poisLoading
                    ? "Searching for POIs..."
                    : visiblePois.length > 0
                    ? `${visiblePois.length} discoveries nearby`
                    : "No POIs found nearby"
                  : undefined,
              },
              {
                key: "terrain3d",
                emoji: "🏔️",
                name: "3D Terrain",
                description: "Elevation, hills & sky atmosphere",
                color: "#ea580c",
                active: show3D,
                isPro: !isPro,
                onToggle: () => {
                  if (gateFeature("Unlock 3D Terrain")) return;
                  setShow3D((v) => !v);
                  if (!show3D) {
                    cameraRef.current?.setCamera({
                      pitch: 50,
                      animationDuration: 600,
                      animationMode: "flyTo",
                    });
                  } else {
                    cameraRef.current?.setCamera({
                      pitch: 0,
                      animationDuration: 600,
                      animationMode: "flyTo",
                    });
                  }
                },
              },
              {
                key: "satellite",
                emoji: "🛰️",
                name: "Satellite Imagery",
                description: "Live satellite basemap with labels",
                color: "#1e40af",
                active: useSatellite,
                onToggle: () => { if (gateFeature("Unlock Satellite Imagery")) return; setUseSatellite((v) => !v); },
                isPro: !isPro,
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
                onToggle: () => { if (gateFeature("Unlock Drive Time Zones")) return; setShowIsochrone((v) => !v); },
                isPro: !isPro,
                zoomStatus: showIsochrone
                  ? isochroneGeoJSON
                    ? `${isochroneMinutes}‑min drive zone active`
                    : "Calculating…"
                  : undefined,
                extra: isochroneExtra,
              },
            ],
          },
          {
            title: "Activity Filter",
            layers: [
              {
                key: "activities",
                emoji: "🎯",
                name: "Filter by Activity",
                description: "Tap a chip to filter parks",
                color: "#10b981",
                active: activeActivities.length > 0,
                onToggle: () => setActiveActivities([]),
                alwaysShowExtra: true,
                zoomStatus:
                  activeActivities.length > 0
                    ? `${visibleParks.length} park${visibleParks.length !== 1 ? "s" : ""} · ${activeActivities.join(", ")}`
                    : undefined,
                extra: (
                  <ActivityChips
                    selected={activeActivities}
                    onChange={setActiveActivities}
                  />
                ),
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

      {/* ── 3D terrain toggle ── */}
      <Pressable
        style={[styles.threeDBtn, show3D && styles.threeDActive]}
        onPress={() => {
          setShow3D((v) => !v);
          if (!show3D) {
            cameraRef.current?.setCamera({
              pitch: 50,
              animationDuration: 600,
              animationMode: "flyTo",
            });
          } else {
            cameraRef.current?.setCamera({
              pitch: 0,
              animationDuration: 600,
              animationMode: "flyTo",
            });
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={show3D ? "Disable 3D terrain" : "Enable 3D terrain"}
      >
        <Text style={[styles.threeDText, show3D && styles.threeDTextActive]}>3D</Text>
      </Pressable>

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

      {/* ── SA Destinations Carousel ── */}
      {currentRegion === "us" && (
        <DestinationsSection onDestinationPress={handleDestinationPress} />
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

              {isPro ? (
                <>
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
                    {selectedTrail.distanceMiles != null && (
                      <View style={styles.trailDetailItem}>
                        <Ionicons name="resize-outline" size={16} color={Colors.textSecondary} />
                        <View>
                          <Text style={styles.trailDetailLabel}>Distance</Text>
                          <Text style={styles.trailDetailValue}>
                            {selectedTrail.distanceMiles} mi
                          </Text>
                        </View>
                      </View>
                    )}
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

                  {/* Elevation Profile */}
                  {(() => {
                    const trailKey = String(selectedTrail.id ?? selectedTrail.name);
                    const elev = elevationCache[trailKey];
                    if (!elev) return null;
                    const range = elev.maxElevation - elev.minElevation || 1;
                    return (
                      <View style={styles.elevationWrap}>
                        <Text style={styles.elevationTitle}>Elevation Profile</Text>
                        <View style={styles.elevationStats}>
                          <View style={styles.elevationStat}>
                            <Ionicons name="arrow-up" size={12} color="#22c55e" />
                            <Text style={styles.elevationStatText}>{elev.totalGain} ft gain</Text>
                          </View>
                          <View style={styles.elevationStat}>
                            <Ionicons name="arrow-down" size={12} color="#ef4444" />
                            <Text style={styles.elevationStatText}>{elev.totalLoss} ft loss</Text>
                          </View>
                          <View style={styles.elevationStat}>
                            <Ionicons name="trending-up" size={12} color={Colors.textSecondary} />
                            <Text style={styles.elevationStatText}>
                              {elev.minElevation}–{elev.maxElevation} ft
                            </Text>
                          </View>
                        </View>
                        <View style={styles.elevationChart}>
                          {elev.points.map((p, i) => {
                            const height = ((p.elevation - elev.minElevation) / range) * 60 + 4;
                            return (
                              <View
                                key={i}
                                style={{
                                  flex: 1,
                                  justifyContent: "flex-end",
                                  alignItems: "center",
                                }}
                              >
                                <View
                                  style={{
                                    width: "80%",
                                    height,
                                    backgroundColor: selectedTrail.color + "88",
                                    borderTopLeftRadius: 2,
                                    borderTopRightRadius: 2,
                                  }}
                                />
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })()}
                </>
              ) : (
                <TeaserCard
                  title="Full Trail Details"
                  emoji="🥾"
                  accentColor={selectedTrail.color}
                  statLine={selectedTrail.distanceMiles != null ? `${selectedTrail.distanceMiles} mi · ${DIFFICULTY_LABELS[selectedTrail.difficulty]}` : undefined}
                  bullets={[
                    "Route drawn on map",
                    "Elevation profile with gain/loss",
                    "Surface type & dog-friendly status",
                    "Directions to trailhead",
                  ]}
                  paywallContext="Unlock Trail Details"
                />
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Campground detail sheet ── */}
      {selectedCampground &&
        (() => {
          const contrib = campContributions[selectedCampground.id];
          const ridb = ridbCache[selectedCampground.id]; // undefined=loading, null=not found
          // Priority: community contribution > RIDB > OSM
          function pickField(
            contribVal: boolean | null | undefined,
            ridbVal: boolean | null | undefined,
            osmVal: boolean | null,
          ): boolean | null {
            if (contribVal !== undefined && contribVal !== null) return contribVal;
            if (ridbVal != null) return ridbVal;
            return osmVal;
          }
          const merged = {
            fee: pickField(contrib?.fee, ridb?.fee, selectedCampground.fee),
            showers: pickField(contrib?.showers, ridb?.showers, selectedCampground.showers),
            toilets: pickField(contrib?.toilets, ridb?.toilets, selectedCampground.toilets),
            tents: pickField(contrib?.tents, ridb?.tents, selectedCampground.tents),
            caravans: pickField(contrib?.caravans, ridb?.caravans, selectedCampground.caravans),
          };
          const hasGaps = Object.values(merged).some((v) => v === null);
          const communityFields = new Set(
            Object.keys(contrib ?? {}).filter((k) =>
              ["fee", "showers", "toilets", "tents", "caravans"].includes(k)
            )
          );
          const ridbFields = new Set(
            (["fee", "showers", "toilets", "tents", "caravans"] as const).filter((k) => {
              if (communityFields.has(k)) return false;
              return ridb?.[k] != null;
            })
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
                    {!isPro ? (
                      <TeaserCard
                        title="Campground Details"
                        emoji="⛺"
                        accentColor={CAMPGROUND_COLOR}
                        statLine={ridb ? `${ridb.campsiteCount || "?"} campsites` : undefined}
                        bullets={[
                          "Amenities & facilities",
                          "Individual campsite list",
                          "Photos & descriptions",
                          "Reserve on Recreation.gov",
                        ]}
                        paywallContext="Unlock Campground Details"
                      />
                    ) : (
                    <>
                    {/* ── Photo carousel ── */}
                    {ridb?.photos && ridb.photos.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.photoCarouselRow}
                        style={styles.photoCarousel}
                      >
                        {[...ridb.photos].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
                          .slice(0, 8)
                          .map((photo, i) => (
                          <Image
                            key={i}
                            source={{ uri: photo.url }}
                            style={[
                              styles.photoThumb,
                              i === 0 && styles.photoThumbFirst,
                            ]}
                            contentFit="cover"
                          />
                        ))}
                      </ScrollView>
                    )}
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
                            {ridbFields.has(key as any) && (
                              <Text style={styles.ridbTag}>recreation.gov</Text>
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
                      {(selectedCampground.phone ?? ridb?.phone) && (
                        <View style={styles.trailDetailItem}>
                          <Ionicons name="call-outline" size={16} color={Colors.textSecondary} />
                          <View>
                            <Text style={styles.trailDetailLabel}>Phone</Text>
                            <Text style={styles.trailDetailValue}>
                              {selectedCampground.phone ?? ridb?.phone}
                            </Text>
                          </View>
                        </View>
                      )}
                      {(selectedCampground.website ?? ridb?.email) && (
                        <View style={styles.trailDetailItem}>
                          <Ionicons name="globe-outline" size={16} color={Colors.textSecondary} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.trailDetailLabel}>
                              {selectedCampground.website ? "Website" : "Email"}
                            </Text>
                            <Pressable
                              onPress={() => {
                                const url = selectedCampground.website ?? (ridb?.email ? `mailto:${ridb.email}` : null);
                                if (url) Linking.openURL(url);
                              }}
                            >
                              <Text style={[styles.trailDetailValue, { color: "#3b82f6" }]} numberOfLines={1}>
                                {selectedCampground.website ?? ridb?.email}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      )}
                      {ridb?.stayLimit && (
                        <View style={styles.trailDetailItem}>
                          <Ionicons name="moon-outline" size={16} color={Colors.textSecondary} />
                          <View>
                            <Text style={styles.trailDetailLabel}>Stay Limit</Text>
                            <Text style={styles.trailDetailValue}>{ridb.stayLimit}</Text>
                          </View>
                        </View>
                      )}
                      {ridb?.adaAccess && (
                        <View style={styles.trailDetailItem}>
                          <Ionicons
                            name="accessibility-outline"
                            size={16}
                            color={Colors.textSecondary}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.trailDetailLabel}>Accessibility</Text>
                            <Text style={styles.trailDetailValue} numberOfLines={2}>
                              {ridb.adaAccess}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>

                    {/* RIDB description */}
                    {ridb?.description ? (
                      <View style={styles.ridbDescWrap}>
                        <Text style={styles.ridbDescText} numberOfLines={4}>
                          {ridb.description}
                        </Text>
                        <Text style={styles.ridbSource}>Source: Recreation.gov</Text>
                      </View>
                    ) : ridb === undefined ? (
                      <Text style={styles.ridbLoading}>Loading info…</Text>
                    ) : null}

                    {/* RIDB activity tags */}
                    {ridb?.activities && ridb.activities.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.activityTagRow}
                      >
                        {ridb.activities.slice(0, 10).map((a) => (
                          <View key={a} style={styles.activityTag}>
                            <Text style={styles.activityTagText}>{a}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    )}

                    {/* ── Campsite drill-down ── */}
                    {ridb && (ridb.campsiteCount > 0 || (ridbCampsites[selectedCampground.id]?.length ?? 0) > 0) && (() => {
                      const sites = ridbCampsites[selectedCampground.id] ?? [];
                      const FILTER_OPTIONS: { key: typeof campsiteFilter; label: string }[] = [
                        { key: "all", label: "All" },
                        { key: "tent", label: "Tent" },
                        { key: "electric", label: "Electric" },
                        { key: "hookup", label: "Full Hookup" },
                        { key: "walkin", label: "Walk-In" },
                        { key: "ada", label: "ADA" },
                      ];
                      const filtered = sites.filter((s) => {
                        if (campsiteFilter === "tent") return /tent only/i.test(s.type);
                        if (campsiteFilter === "electric") return s.electric != null || /electric/i.test(s.type);
                        if (campsiteFilter === "hookup") return /full hookup/i.test(s.type);
                        if (campsiteFilter === "walkin") return /walk.to|hike.to/i.test(s.type);
                        if (campsiteFilter === "ada") return s.accessible;
                        return true;
                      });
                      const count = ridb.campsiteCount || sites.length;
                      return (
                        <View style={styles.campsiteSection}>
                          <Pressable
                            style={styles.campsiteHeader}
                            onPress={() => setCampsitesExpanded((v) => !v)}
                          >
                            <Text style={styles.campsiteSectionTitle}>
                              🏕 {count} Individual Sites
                            </Text>
                            <Ionicons
                              name={campsitesExpanded ? "chevron-up" : "chevron-down"}
                              size={16}
                              color={Colors.textSecondary}
                            />
                          </Pressable>

                          {campsitesExpanded && (
                            <>
                              {/* Filter chips */}
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.siteFilterRow}
                              >
                                {FILTER_OPTIONS.map(({ key, label }) => (
                                  <Pressable
                                    key={key}
                                    style={[
                                      styles.siteFilterChip,
                                      campsiteFilter === key && {
                                        backgroundColor: CAMPGROUND_COLOR + "28",
                                        borderColor: CAMPGROUND_COLOR,
                                      },
                                    ]}
                                    onPress={() => setCampsiteFilter(key)}
                                  >
                                    <Text
                                      style={[
                                        styles.siteFilterText,
                                        campsiteFilter === key && { color: CAMPGROUND_COLOR },
                                      ]}
                                    >
                                      {label}
                                    </Text>
                                  </Pressable>
                                ))}
                              </ScrollView>

                              {sites.length === 0 ? (
                                <Text style={styles.ridbLoading}>Loading sites…</Text>
                              ) : filtered.length === 0 ? (
                                <Text style={styles.ridbLoading}>No sites match this filter</Text>
                              ) : (
                                filtered.slice(0, 30).map((site) => (
                                  <View key={site.campsiteId} style={styles.siteRow}>
                                    <View style={styles.siteRowTop}>
                                      <Text style={styles.siteName} numberOfLines={1}>
                                        {site.name || `Site ${site.campsiteId}`}
                                      </Text>
                                      {site.accessible && (
                                        <Ionicons name="accessibility" size={13} color={CAMPGROUND_COLOR} />
                                      )}
                                    </View>
                                    <View style={styles.siteBadgeRow}>
                                      <View style={styles.siteBadge}>
                                        <Text style={styles.siteBadgeText} numberOfLines={1}>
                                          {site.type}
                                        </Text>
                                      </View>
                                      {site.electric && (
                                        <View style={[styles.siteBadge, styles.siteBadgeElectric]}>
                                          <Text style={[styles.siteBadgeText, { color: "#f59e0b" }]}>
                                            ⚡ {site.electric}
                                          </Text>
                                        </View>
                                      )}
                                      {site.water && (
                                        <View style={[styles.siteBadge, styles.siteBadgeWater]}>
                                          <Text style={[styles.siteBadgeText, { color: "#38bdf8" }]}>
                                            💧 Water
                                          </Text>
                                        </View>
                                      )}
                                      {site.maxVehicleLength && (
                                        <View style={styles.siteBadge}>
                                          <Text style={styles.siteBadgeText}>
                                            🚐 {site.maxVehicleLength}ft
                                          </Text>
                                        </View>
                                      )}
                                      {site.shade && (
                                        <View style={styles.siteBadge}>
                                          <Text style={styles.siteBadgeText}>🌳 {site.shade}</Text>
                                        </View>
                                      )}
                                    </View>
                                    {site.loop ? (
                                      <Text style={styles.siteLoop}>Loop: {site.loop}</Text>
                                    ) : null}
                                  </View>
                                ))
                              )}
                            </>
                          )}
                        </View>
                      );
                    })()}

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
                      {ridb?.reservationUrl && (
                        <Pressable
                          style={[styles.directionsBtn, { borderColor: "#f59e0b", flex: 1.4 }]}
                          onPress={() => Linking.openURL(ridb.reservationUrl!)}
                          accessibilityRole="button"
                          accessibilityLabel="Book on Recreation.gov"
                        >
                          <Ionicons name="calendar-outline" size={15} color="#f59e0b" />
                          <Text style={[styles.directionsBtnText, { color: "#f59e0b" }]}>
                            Book on Rec.gov
                          </Text>
                        </Pressable>
                      )}
                    </View>

                    {campSavedOffline && (
                      <View style={styles.offlineBanner}>
                        <Ionicons name="cloud-offline-outline" size={14} color={Colors.star} />
                        <Text style={styles.offlineBannerText}>
                          Saved locally — will sync when back online
                        </Text>
                      </View>
                    )}
                    </>
                    )}
                  </ScrollView>
                )}
              </View>
            </View>
          );
        })()}

      {/* ── Discovery POI detail sheet ── */}
      {selectedPoi && (
        <View style={styles.detailOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedPoi(null)} />
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <View style={[styles.sheetHeader, { paddingHorizontal: 20 }]}>
              <View style={[styles.trailIconWrap, { backgroundColor: selectedPoi.color + "33" }]}>
                <Ionicons
                  name={
                    selectedPoi.category === "viewpoint" ? "eye" :
                    selectedPoi.category === "waterfall" ? "water" :
                    selectedPoi.category === "peak" ? "triangle" :
                    selectedPoi.category === "picnic" ? "restaurant" :
                    "water"
                  }
                  size={26}
                  color={selectedPoi.color}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetSpecies} numberOfLines={2}>
                  {selectedPoi.name}
                </Text>
                <View style={styles.difficultyBadgeRow}>
                  <View style={[styles.difficultyBadge, { backgroundColor: selectedPoi.color }]}>
                    <Text style={styles.difficultyBadgeText}>
                      {POI_LABELS[selectedPoi.category]}
                    </Text>
                  </View>
                  {selectedPoi.elevation && (
                    <View style={[styles.difficultyBadge, { backgroundColor: "#78716c" }]}>
                      <Text style={styles.difficultyBadgeText}>
                        {Math.round(parseFloat(selectedPoi.elevation) * 3.281)}ft
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <Pressable onPress={() => setSelectedPoi(null)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.sheetScrollContent}>
              {selectedPoi.description && (
                <Text style={[styles.trailDetailValue, { marginBottom: 12 }]}>
                  {selectedPoi.description}
                </Text>
              )}
              <View style={styles.sheetActionRow}>
                <Pressable
                  style={[styles.directionsBtn, { borderColor: selectedPoi.color }]}
                  onPress={() =>
                    openDirections(selectedPoi.latitude, selectedPoi.longitude, selectedPoi.name)
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Get directions"
                >
                  <Ionicons name="navigate-outline" size={15} color={selectedPoi.color} />
                  <Text style={[styles.directionsBtnText, { color: selectedPoi.color }]}>
                    Directions
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── OSM park detail sheet ── */}
      {selectedOsmPark && (
        <View style={styles.detailOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedOsmPark(null)} />
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <View style={[styles.sheetHeader, { paddingHorizontal: 20 }]}>
              <View style={[styles.trailIconWrap, { backgroundColor: selectedOsmPark.color + "33" }]}>
                <Ionicons name="leaf" size={26} color={selectedOsmPark.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetSpecies} numberOfLines={2}>
                  {selectedOsmPark.name}
                </Text>
                <View style={styles.difficultyBadgeRow}>
                  <View style={[styles.difficultyBadge, { backgroundColor: selectedOsmPark.color }]}>
                    <Text style={styles.difficultyBadgeText}>
                      {selectedOsmPark.parkType === "state"
                        ? "State Park"
                        : selectedOsmPark.parkType === "county"
                        ? "County Park"
                        : selectedOsmPark.parkType === "regional"
                        ? "Regional Park"
                        : selectedOsmPark.parkType === "nature_reserve"
                        ? "Nature Reserve"
                        : "Park"}
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={() => setSelectedOsmPark(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.sheetScrollContent}>
              {selectedOsmPark.operator && (
                <View style={styles.trailDetailItem}>
                  <Ionicons name="business-outline" size={16} color={Colors.textSecondary} />
                  <View>
                    <Text style={styles.trailDetailLabel}>Operator</Text>
                    <Text style={styles.trailDetailValue}>{selectedOsmPark.operator}</Text>
                  </View>
                </View>
              )}

              <View style={styles.sheetActionRow}>
                <Pressable
                  style={[styles.directionsBtn, { borderColor: selectedOsmPark.color }]}
                  onPress={() =>
                    openDirections(selectedOsmPark.latitude, selectedOsmPark.longitude, selectedOsmPark.name)
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Get directions"
                >
                  <Ionicons name="navigate-outline" size={15} color={selectedOsmPark.color} />
                  <Text style={[styles.directionsBtnText, { color: selectedOsmPark.color }]}>
                    Directions
                  </Text>
                </Pressable>
                {selectedOsmPark.website && (
                  <Pressable
                    style={[styles.directionsBtn, { borderColor: selectedOsmPark.color }]}
                    onPress={() => Linking.openURL(selectedOsmPark.website!)}
                    accessibilityRole="button"
                    accessibilityLabel="Visit website"
                  >
                    <Ionicons name="globe-outline" size={15} color={selectedOsmPark.color} />
                    <Text style={[styles.directionsBtnText, { color: selectedOsmPark.color }]}>
                      Website
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── Trail preview detail sheet ── */}
      {selectedTrailPreview && (() => {
        const td = trailDetailCache[selectedTrailPreview.id] ?? null;
        const color = td?.color ?? selectedTrailPreview.color;
        const diffLabel = DIFFICULTY_LABELS[td?.difficulty ?? selectedTrailPreview.difficulty];
        return (
          <View style={styles.detailOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setSelectedTrailPreview(null)}
            />
            <View style={styles.detailSheet}>
              <View style={styles.sheetHandle} />
              <View style={[styles.sheetHeader, { paddingHorizontal: 20 }]}>
                <View style={[styles.trailIconWrap, { backgroundColor: color + "33" }]}>
                  <Ionicons name="walk" size={26} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetSpecies} numberOfLines={2}>
                    {selectedTrailPreview.name}
                  </Text>
                  <View style={styles.difficultyBadgeRow}>
                    <View style={[styles.difficultyBadge, { backgroundColor: color }]}>
                      <Text style={styles.difficultyBadgeText}>{diffLabel}</Text>
                    </View>
                    {td?.distanceMiles != null && (
                      <Text style={{ color: Colors.textSecondary, fontSize: 13, marginLeft: 8 }}>
                        {td.distanceMiles} mi
                      </Text>
                    )}
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

              <ScrollView style={styles.sheetScrollContent} contentContainerStyle={{ paddingBottom: 32 }}>
                {/* ── Action buttons ── */}
                <View style={styles.sheetActionRow}>
                  <Pressable
                    style={[styles.directionsBtn, { borderColor: color, flex: 1 }]}
                    onPress={() =>
                      openDirections(
                        selectedTrailPreview.latitude,
                        selectedTrailPreview.longitude,
                        selectedTrailPreview.name
                      )
                    }
                    accessibilityRole="button"
                  >
                    <Ionicons name="navigate-outline" size={15} color={color} />
                    <Text style={[styles.directionsBtnText, { color }]}>Directions</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.directionsBtn, { borderColor: Colors.textSecondary, flex: 1 }]}
                    onPress={() => {
                      setSelectedTrailPreview(null);
                      cameraRef.current?.setCamera({
                        centerCoordinate: [selectedTrailPreview.longitude, selectedTrailPreview.latitude],
                        zoomLevel: 14,
                        animationDuration: 400,
                        animationMode: "flyTo",
                      });
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons name="search-outline" size={15} color={Colors.textSecondary} />
                    <Text style={[styles.directionsBtnText, { color: Colors.textSecondary }]}>Zoom In</Text>
                  </Pressable>
                  {td?.website && (
                    <Pressable
                      style={[styles.directionsBtn, { borderColor: "#3b82f6", flex: 1 }]}
                      onPress={() => Linking.openURL(td.website!)}
                      accessibilityRole="button"
                    >
                      <Ionicons name="globe-outline" size={15} color="#3b82f6" />
                      <Text style={[styles.directionsBtnText, { color: "#3b82f6" }]}>Website</Text>
                    </Pressable>
                  )}
                </View>

                {/* ── Loading indicator ── */}
                {trailDetailLoading && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <ActivityIndicator size="small" color={color} />
                    <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>Loading trail info...</Text>
                  </View>
                )}

                {/* ── Trail detail grid ── */}
                {td && (
                  <View style={{ marginTop: 16, gap: 12 }}>
                    {td.distanceMiles != null && (
                      <View style={styles.infoRow}>
                        <Ionicons name="resize-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.infoLabel}>Distance</Text>
                        <Text style={styles.infoValue}>{td.distanceMiles} miles</Text>
                      </View>
                    )}
                    <View style={styles.infoRow}>
                      <Ionicons name="footsteps-outline" size={16} color={Colors.textSecondary} />
                      <Text style={styles.infoLabel}>Surface</Text>
                      <Text style={styles.infoValue}>{td.surface}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Ionicons name="paw-outline" size={16} color={Colors.textSecondary} />
                      <Text style={styles.infoLabel}>Dogs</Text>
                      <Text style={styles.infoValue}>
                        {td.dogFriendly === true ? "Allowed" : td.dogFriendly === false ? "Not allowed" : "Unknown"}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Ionicons name="cash-outline" size={16} color={Colors.textSecondary} />
                      <Text style={styles.infoLabel}>Fee</Text>
                      <Text style={styles.infoValue}>
                        {td.fee === true ? "Required" : td.fee === false ? "Free" : "Unknown"}
                      </Text>
                    </View>
                    {td.wheelchair != null && (
                      <View style={styles.infoRow}>
                        <Ionicons name="accessibility-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.infoLabel}>Wheelchair</Text>
                        <Text style={styles.infoValue}>{td.wheelchair ? "Accessible" : "Not accessible"}</Text>
                      </View>
                    )}
                    {td.lit != null && (
                      <View style={styles.infoRow}>
                        <Ionicons name="flashlight-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.infoLabel}>Lit</Text>
                        <Text style={styles.infoValue}>{td.lit ? "Yes" : "No"}</Text>
                      </View>
                    )}
                    {td.openingHours && (
                      <View style={styles.infoRow}>
                        <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.infoLabel}>Hours</Text>
                        <Text style={styles.infoValue}>{td.openingHours}</Text>
                      </View>
                    )}
                    {td.operator && (
                      <View style={styles.infoRow}>
                        <Ionicons name="business-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.infoLabel}>Operator</Text>
                        <Text style={styles.infoValue}>{td.operator}</Text>
                      </View>
                    )}
                    {td.access && (
                      <View style={styles.infoRow}>
                        <Ionicons name="lock-open-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.infoLabel}>Access</Text>
                        <Text style={styles.infoValue}>{td.access}</Text>
                      </View>
                    )}
                    {td.incline && (
                      <View style={styles.infoRow}>
                        <Ionicons name="trending-up-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.infoLabel}>Incline</Text>
                        <Text style={styles.infoValue}>{td.incline}</Text>
                      </View>
                    )}
                    {td.mtbScale && (
                      <View style={styles.infoRow}>
                        <Ionicons name="bicycle-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.infoLabel}>MTB Scale</Text>
                        <Text style={styles.infoValue}>{td.mtbScale}</Text>
                      </View>
                    )}
                    {td.description && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={{ color: Colors.textSecondary, fontSize: 12, marginBottom: 4 }}>Description</Text>
                        <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 20 }} numberOfLines={6}>
                          {td.description}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* ── No detail fallback ── */}
                {!trailDetailLoading && !td && (
                  <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 12 }}>
                    Trail info unavailable — tap Zoom In to see the trail on the map.
                  </Text>
                )}
              </ScrollView>
            </View>
          </View>
        );
      })()}

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
        onShare={
          routeTarget
            ? () => {
                const park = visibleParks.find((p) => p.parkCode === routeTarget.parkCode);
                sharePark({
                  parkName: routeTarget.name,
                  parkState: park?.states ?? "",
                  parkCode: routeTarget.parkCode,
                  description: park?.description,
                });
              }
            : undefined
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
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  infoValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "right",
    flex: 1,
  },
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

  // 3D toggle
  threeDBtn: {
    position: "absolute",
    top: 155,
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  threeDActive: { backgroundColor: "#ea580c" },
  threeDText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  threeDTextActive: { color: "#fff" },

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
  ridbTag: {
    color: "#f59e0b",
    fontSize: 10,
    fontFamily: "Montserrat-Medium",
    marginTop: 1,
  },
  ridbDescWrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  ridbDescText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Montserrat-Medium",
    lineHeight: 19,
  },
  ridbSource: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: "Montserrat-Medium",
    marginTop: 5,
  },
  ridbLoading: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: "Montserrat-Medium",
    marginTop: 12,
    textAlign: "center",
  },
  activityTagRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 10,
  },
  activityTag: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activityTagText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Montserrat-Medium",
  },
  // Photo carousel
  photoCarousel: {
    marginHorizontal: -16,
    marginBottom: 14,
  },
  photoCarouselRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  photoThumb: {
    width: 130,
    height: 90,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  photoThumbFirst: {
    width: 200,
    height: 130,
  },
  // Campsite section
  campsiteSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  campsiteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  campsiteSectionTitle: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
  },
  siteFilterRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 10,
  },
  siteFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  siteFilterText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Montserrat-SemiBold",
  },
  siteRow: {
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  siteRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 5,
  },
  siteName: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Montserrat-SemiBold",
  },
  siteBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  siteBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  siteBadgeElectric: {
    backgroundColor: "rgba(245,158,11,0.12)",
  },
  siteBadgeWater: {
    backgroundColor: "rgba(56,189,248,0.12)",
  },
  siteBadgeText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Montserrat-Medium",
  },
  siteLoop: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: "Montserrat-Medium",
    marginTop: 4,
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

  // Elevation profile
  elevationWrap: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 14,
  },
  elevationTitle: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
    marginBottom: 8,
  },
  elevationStats: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  elevationStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  elevationStatText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Montserrat-Medium",
  },
  elevationChart: {
    flexDirection: "row",
    height: 68,
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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


