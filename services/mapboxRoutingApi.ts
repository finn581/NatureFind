/**
 * Mapbox Routing & Logistics APIs
 * Matrix, Directions, Isochrone, Optimization, Map Matching
 */

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

const BASE = "https://api.mapbox.com";

export type RoutingProfile = "driving" | "walking" | "cycling";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface RouteStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
}

export interface RouteResult {
  distance: number; // meters
  duration: number; // seconds
  geometry: { type: "LineString"; coordinates: [number, number][] };
  steps: RouteStep[];
}

export interface TripResult {
  totalDuration: number; // seconds
  totalDistance: number; // meters
  orderedIndices: number[]; // original input indices in visit order
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface MatchResult {
  confidence: number; // 0–1
  snappedCoords: [number, number][]; // [lon, lat]
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

// ─── Drive Time Cache ─────────────────────────────────────────────────────────

const _dtCache = new Map<string, { times: (number | null)[]; ts: number }>();
const DRIVE_TIME_TTL = 30 * 60 * 1000; // 30 min

function _dtKey(origin: [number, number], dests: [number, number][]): string {
  const o = `${origin[0].toFixed(2)},${origin[1].toFixed(2)}`;
  const d = dests.map(([ln, lt]) => `${ln.toFixed(3)},${lt.toFixed(3)}`).join("|");
  return `${o}:${d}`;
}

// ─── Matrix API ───────────────────────────────────────────────────────────────

/**
 * Fetch drive times (seconds) from one origin to multiple destinations.
 * Returns null for unreachable destinations.
 * Max 25 total coordinates.
 */
export async function fetchDriveTimes(
  origin: [number, number],
  destinations: [number, number][],
  profile: RoutingProfile = "driving"
): Promise<(number | null)[]> {
  if (!destinations.length) return [];

  const dests = destinations.slice(0, 24);
  const cacheKey = _dtKey(origin, dests);
  const cached = _dtCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DRIVE_TIME_TTL) return cached.times;

  const coords = [origin, ...dests].map((c) => c.join(",")).join(";");
  const destIndices = dests.map((_, i) => i + 1).join(";");

  const url =
    `${BASE}/directions-matrix/v1/mapbox/${profile}/${coords}` +
    `?sources=0&destinations=${destIndices}&annotations=duration&access_token=${TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Matrix API ${res.status}`);
  const json = await res.json();

  const row: (number | null)[] = json.durations?.[0] ?? [];
  _dtCache.set(cacheKey, { times: row, ts: Date.now() });
  return row;
}

// ─── Directions API ───────────────────────────────────────────────────────────

/**
 * Fetch a route between two coordinates.
 * Returns RouteResult with geometry, distance, duration, and steps.
 */
export async function fetchRoute(
  origin: [number, number],
  destination: [number, number],
  profile: RoutingProfile = "driving"
): Promise<RouteResult | null> {
  const coords = `${origin.join(",")};${destination.join(",")}`;
  const url =
    `${BASE}/directions/v5/mapbox/${profile}/${coords}` +
    `?geometries=geojson&steps=true&overview=full&access_token=${TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions API ${res.status}`);
  const json = await res.json();

  const route = json.routes?.[0];
  if (!route) return null;

  const steps: RouteStep[] = (route.legs?.[0]?.steps ?? []).map((s: any) => ({
    instruction: s.maneuver?.instruction ?? "",
    distance: s.distance ?? 0,
    duration: s.duration ?? 0,
  }));

  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry,
    steps,
  };
}

// ─── Isochrone API ────────────────────────────────────────────────────────────

/**
 * Fetch reachability polygon from a point within given minutes.
 * Returns GeoJSON FeatureCollection (polygons, largest first).
 */
export async function fetchIsochrone(
  origin: [number, number],
  minutes: number,
  profile: RoutingProfile = "driving"
): Promise<any | null> {
  const url =
    `${BASE}/isochrone/v1/mapbox/${profile}/${origin.join(",")}` +
    `?contours_minutes=${minutes}&polygons=true&access_token=${TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Isochrone API ${res.status}`);
  const json = await res.json();
  return json; // GeoJSON FeatureCollection
}

// ─── Optimization API ─────────────────────────────────────────────────────────

/**
 * Optimize visit order for a list of stops.
 * Keeps first stop as start, last as end.
 * Returns TripResult with orderedIndices = original input indices in visit order.
 * Max 12 coordinates.
 */
export async function optimizeTrip(
  stops: [number, number][],
  profile: RoutingProfile = "driving"
): Promise<TripResult | null> {
  if (stops.length < 2) return null;

  const capped = stops.slice(0, 12);
  const coords = capped.map((c) => c.join(",")).join(";");
  const url =
    `${BASE}/optimized-trips/v1/mapbox/${profile}/${coords}` +
    `?source=first&destination=last&roundtrip=false&geometries=geojson&access_token=${TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Optimization API ${res.status}`);
  const json = await res.json();

  const trip = json.trips?.[0];
  const waypoints: any[] = json.waypoints ?? [];
  if (!trip || !waypoints.length) return null;

  // Sort waypoints by waypoint_index to get visit order → map back to original input index
  const ordered = [...waypoints]
    .sort((a, b) => a.waypoint_index - b.waypoint_index)
    .map((w) => w.trips_index ?? w.waypoint_index); // original input index

  return {
    totalDuration: trip.duration,
    totalDistance: trip.distance,
    orderedIndices: ordered,
    geometry: trip.geometry,
  };
}

// ─── Map Matching API ─────────────────────────────────────────────────────────

/**
 * Snap a GPS trace to the road network.
 * Returns MatchResult with confidence and snapped coordinates.
 * radiusMeters: search radius per tracepoint (default 25m).
 */
export async function matchGPSTrace(
  coords: [number, number][],
  profile: RoutingProfile = "walking",
  radiusMeters = 25
): Promise<MatchResult | null> {
  if (coords.length < 2) return null;

  // Map Matching allows max 100 coordinates
  const capped = coords.slice(0, 100);
  const coordStr = capped.map((c) => c.join(",")).join(";");
  const radii = capped.map(() => radiusMeters).join(";");

  const url =
    `${BASE}/matching/v5/mapbox/${profile}/${coordStr}` +
    `?radiuses=${radii}&tidy=true&geometries=geojson&overview=full&access_token=${TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Map Matching API ${res.status}`);
  const json = await res.json();

  const matching = json.matchings?.[0];
  if (!matching) return null;

  const snappedCoords: [number, number][] = (json.tracepoints ?? [])
    .filter(Boolean)
    .map((tp: any) => tp.location as [number, number]);

  return {
    confidence: matching.confidence,
    snappedCoords,
    geometry: matching.geometry,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** "~15m", "~1h 20m", "~2h" */
export function formatDurationShort(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

/** "15 min", "1 hr 20 min", "2 hr" */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

/** "0.3 mi", "12.4 mi" */
export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return miles < 10
    ? `${miles.toFixed(1)} mi`
    : `${Math.round(miles)} mi`;
}
