import AsyncStorage from "@react-native-async-storage/async-storage";

const NPS_API_BASE = "https://developer.nps.gov/api/v1";
const API_KEY = process.env.EXPO_PUBLIC_NPS_API_KEY ?? "";

// --- Types ---

export interface ParkImage {
  credit: string;
  title: string;
  altText: string;
  caption: string;
  url: string;
}

export interface ParkAddress {
  postalCode: string;
  city: string;
  stateCode: string;
  line1: string;
  type: string;
}

export interface EntranceFee {
  cost: string;
  description: string;
  title: string;
}

export interface OperatingHours {
  description: string;
  name: string;
  standardHours: Record<string, string>;
}

export interface ParkActivity {
  id: string;
  name: string;
}

export interface Park {
  id: string;
  parkCode: string;
  fullName: string;
  name: string;
  description: string;
  designation: string;
  states: string;
  latitude: string;
  longitude: string;
  url: string;
  weatherInfo: string;
  directionsInfo: string;
  images: ParkImage[];
  addresses: ParkAddress[];
  entranceFees: EntranceFee[];
  operatingHours: OperatingHours[];
  activities: ParkActivity[];
}

export interface NPSResponse<T> {
  total: string;
  limit: string;
  start: string;
  data: T[];
}

export interface FetchParksParams {
  stateCode?: string;
  q?: string;
  limit?: number;
  start?: number;
  parkCode?: string;
}

// --- Cache ---

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes
const PARKS_STORE_PREFIX = "nf_parks_v1_";
const PARKS_STORE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — parks don't move

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() });
}

// --- API Functions ---

async function npsGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${NPS_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });

  const cacheKey = url.toString();
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "X-Api-Key": API_KEY },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`NPS API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as T;
  setCache(cacheKey, json);
  return json;
}

export async function fetchParks(params: FetchParksParams = {}): Promise<NPSResponse<Park>> {
  const canPersist = !params.parkCode && !params.q && !params.start;
  const storageKey = `${PARKS_STORE_PREFIX}${params.stateCode ?? "all"}`;

  if (canPersist) {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        const { data, ts } = JSON.parse(raw) as { data: NPSResponse<Park>; ts: number };
        if (Date.now() - ts < PARKS_STORE_TTL) return data;
      }
    } catch {}
  }

  const result = await npsGet<NPSResponse<Park>>("/parks", {
    stateCode: params.stateCode ?? "",
    q: params.q ?? "",
    limit: String(params.limit ?? 20),
    start: String(params.start ?? 0),
    parkCode: params.parkCode ?? "",
    fields: "images,addresses,entranceFees,operatingHours,activities",
  });

  if (canPersist) {
    AsyncStorage.setItem(storageKey, JSON.stringify({ data: result, ts: Date.now() })).catch(() => {});
  }

  return result;
}

export async function fetchParkById(parkCode: string): Promise<Park | null> {
  const res = await fetchParks({ parkCode, limit: 1 });
  return res.data[0] ?? null;
}

export async function fetchActivities(): Promise<ParkActivity[]> {
  const res = await npsGet<NPSResponse<ParkActivity>>("/activities");
  return res.data;
}

export interface ActivityParkEntry {
  parkCode: string;
  fullName: string;
  states: string;
  designation: string;
}

export interface ActivityWithParks {
  id: string;
  name: string;
  parks: ActivityParkEntry[];
}

// ── Designation-based relevance scoring ──────────────────────────────────────
// Parks that are primarily historical/urban/memorial should not show up for
// nature-focused activities like hiking, bird watching, climbing, etc.

/** Designations that are never relevant for outdoor recreation activities. */
const NON_NATURE_DESIGNATIONS = new Set([
  "National Historic Site",
  "National Historical Park",
  "National Historical Park and Preserve",
  "National Memorial",
  "National Battlefield",
  "National Battlefield Park",
  "National Military Park",
  "National Cemetery",
  "International Historic Site",
  "International Park",
  "Affiliated Area",
  "Other",
]);

/** Base designation scores — higher = more relevant for outdoor activities. */
const BASE_DESIGNATION_SCORE: Record<string, number> = {
  "National Park": 10,
  "National Park and Preserve": 10,
  "National Preserve": 8,
  "National Wilderness Area": 8,
  "National Recreation Area": 7,
  "National Forest": 7,
  "National Seashore": 7,
  "National Lakeshore": 7,
  "National Wildlife Refuge": 7,
  "National Scenic Trail": 6,
  "National River": 6,
  "National River and Recreation Area": 6,
  "Wild and Scenic River": 6,
  "National Grassland": 5,
  "National Reserve": 5,
  "National Monument": 4, // mixed — some are wilderness, some are urban
  "National Monument and Preserve": 7,
  "National Parkway": 3,
};

/**
 * Per-activity designation boosts — added on top of base score.
 * Only activities that strongly favor certain designations need entries.
 */
const ACTIVITY_DESIGNATION_BOOSTS: Record<string, Record<string, number>> = {
  "Bird Watching": {
    "National Wildlife Refuge": 6,
    "National Seashore": 5,
    "National Lakeshore": 5,
    "National Preserve": 4,
    "National Park": 2,
  },
  "Fishing": {
    "National River": 6,
    "National River and Recreation Area": 6,
    "Wild and Scenic River": 6,
    "National Lakeshore": 5,
    "National Seashore": 5,
    "National Recreation Area": 4,
  },
  "Kayaking": {
    "National Seashore": 6,
    "National Lakeshore": 6,
    "National River": 6,
    "National River and Recreation Area": 6,
    "Wild and Scenic River": 6,
    "National Recreation Area": 4,
  },
  "Swimming": {
    "National Seashore": 6,
    "National Lakeshore": 6,
    "National Recreation Area": 5,
    "National River": 4,
  },
  "Hiking": {
    "National Park": 3,
    "National Scenic Trail": 6,
    "National Preserve": 3,
    "National Wilderness Area": 4,
  },
  "Climbing": {
    "National Park": 5,
    "National Recreation Area": 3,
    "National Monument": 3,
  },
  "Stargazing": {
    "National Park": 4,
    "National Monument": 3,
    "National Preserve": 3,
    "National Grassland": 3,
  },
  "Camping": {
    "National Park": 3,
    "National Recreation Area": 3,
    "National Forest": 4,
    "National Seashore": 3,
  },
  "Mountain Biking": {
    "National Recreation Area": 4,
    "National Forest": 4,
    "National Preserve": 3,
    "National Grassland": 3,
  },
  "Snowshoeing": {
    "National Park": 4,
    "National Forest": 5,
    "National Recreation Area": 3,
  },
  "Wildlife Watching": {
    "National Wildlife Refuge": 6,
    "National Preserve": 5,
    "National Park": 3,
    "National Seashore": 3,
    "National Grassland": 3,
  },
};

/** Score a park's designation for a given activity. 0 = exclude. */
function scoreDesignation(designation: string, activityName: string): number {
  if (NON_NATURE_DESIGNATIONS.has(designation)) return 0;
  const base = BASE_DESIGNATION_SCORE[designation] ?? 2;
  const boost = ACTIVITY_DESIGNATION_BOOSTS[activityName]?.[designation] ?? 0;
  return base + boost;
}

/** Return the state code plus its geographic neighbors for broader park search. */
const NEIGHBOR_STATES: Record<string, string[]> = {
  AL: ["FL","GA","MS","TN"], AK: [], AZ: ["CA","CO","NM","NV","UT"],
  AR: ["LA","MO","MS","OK","TN","TX"], CA: ["AZ","NV","OR"],
  CO: ["AZ","KS","NE","NM","OK","UT","WY"], CT: ["MA","NY","RI"],
  DE: ["MD","NJ","PA"], FL: ["AL","GA"], GA: ["AL","FL","NC","SC","TN"],
  HI: [], ID: ["MT","NV","OR","UT","WA","WY"], IL: ["IN","IA","KY","MO","WI"],
  IN: ["IL","KY","MI","OH"], IA: ["IL","MN","MO","NE","SD","WI"],
  KS: ["CO","MO","NE","OK"], KY: ["IL","IN","MO","OH","TN","VA","WV"],
  LA: ["AR","MS","TX"], ME: ["NH"], MD: ["DE","PA","VA","WV"],
  MA: ["CT","NH","NY","RI","VT"], MI: ["IN","OH","WI"],
  MN: ["IA","ND","SD","WI"], MS: ["AL","AR","LA","TN"],
  MO: ["AR","IL","IA","KS","KY","NE","OK","TN"], MT: ["ID","ND","SD","WY"],
  NE: ["CO","IA","KS","MO","SD","WY"], NV: ["AZ","CA","ID","OR","UT"],
  NH: ["MA","ME","VT"], NJ: ["DE","NY","PA"], NM: ["AZ","CO","OK","TX","UT"],
  NY: ["CT","MA","NJ","PA","VT"], NC: ["GA","SC","TN","VA"],
  ND: ["MN","MT","SD"], OH: ["IN","KY","MI","PA","WV"],
  OK: ["AR","CO","KS","MO","NM","TX"], OR: ["CA","ID","NV","WA"],
  PA: ["DE","MD","NJ","NY","OH","WV"], RI: ["CT","MA"],
  SC: ["GA","NC"], SD: ["IA","MN","MT","NE","ND","WY"],
  TN: ["AL","AR","GA","KY","MO","MS","NC","VA"], TX: ["AR","LA","NM","OK"],
  UT: ["AZ","CO","ID","NV","NM","WY"], VT: ["MA","NH","NY"],
  VA: ["KY","MD","NC","TN","WV"], WA: ["ID","OR"],
  WV: ["KY","MD","OH","PA","VA"], WI: ["IA","IL","MI","MN"],
  WY: ["CO","ID","MT","NE","SD","UT"],
};

function getNeighborStates(code: string): string[] {
  return [code, ...(NEIGHBOR_STATES[code] ?? [])];
}

/** Approximate state code from lat/lon using state centroids. Fallback when reverse geocode fails. */
const STATE_CENTROIDS: [string, number, number][] = [
  ["AL",32.8,-86.8],["AK",64.2,-152.5],["AZ",34.3,-111.7],["AR",34.8,-92.2],
  ["CA",37.2,-119.5],["CO",39.0,-105.5],["CT",41.6,-72.7],["DE",39.0,-75.5],
  ["FL",28.6,-82.5],["GA",32.7,-83.5],["HI",20.8,-156.3],["ID",44.4,-114.6],
  ["IL",40.0,-89.2],["IN",39.8,-86.3],["IA",42.0,-93.5],["KS",38.5,-98.8],
  ["KY",37.8,-85.3],["LA",31.0,-92.0],["ME",45.3,-69.2],["MD",39.0,-76.8],
  ["MA",42.2,-71.8],["MI",44.3,-84.6],["MN",46.3,-94.3],["MS",32.7,-89.7],
  ["MO",38.4,-92.5],["MT",47.0,-109.6],["NE",41.5,-99.8],["NV",39.3,-116.6],
  ["NH",43.7,-71.6],["NJ",40.1,-74.7],["NM",34.4,-106.1],["NY",42.9,-75.5],
  ["NC",35.5,-79.8],["ND",47.5,-100.5],["OH",40.3,-82.8],["OK",35.5,-97.5],
  ["OR",43.8,-120.6],["PA",40.9,-77.8],["RI",41.7,-71.5],["SC",33.8,-80.9],
  ["SD",44.4,-100.2],["TN",35.8,-86.4],["TX",31.5,-99.4],["UT",39.3,-111.7],
  ["VT",44.0,-72.7],["VA",37.5,-78.8],["WA",47.4,-120.7],["WV",38.6,-80.6],
  ["WI",44.6,-89.8],["WY",43.0,-107.5],
];

function stateFromCoords(lat: number, lon: number): string {
  let best = "CA";
  let bestDist = Infinity;
  for (const [code, sLat, sLon] of STATE_CENTROIDS) {
    const d = (lat - sLat) ** 2 + (lon - sLon) ** 2;
    if (d < bestDist) { bestDist = d; best = code; }
  }
  return best;
}

/** Haversine distance in miles between two lat/lon points. */
function haversineDistMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchParksByActivity(
  activityName: string,
  stateCode?: string,
  userLat?: number,
  userLon?: number,
): Promise<Park[]> {
  const cacheKey = `activity_parks_${activityName.toLowerCase()}_${stateCode ?? "all"}_${userLat?.toFixed(1) ?? "x"}_${userLon?.toFixed(1) ?? "x"}`;
  const cached = getCached<Park[]>(cacheKey);
  if (cached) return cached;

  // Step 1: Find the activity ID — non-fatal if this fails
  let activity: ParkActivity | undefined;
  try {
    const activitiesRes = await npsGet<NPSResponse<ParkActivity>>("/activities");
    const nameLower = activityName.toLowerCase();
    activity = activitiesRes.data.find(
      (a) =>
        a.name.toLowerCase() === nameLower ||
        a.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(a.name.toLowerCase())
    );
  } catch {
    // Network/timeout — will fall through to text search
  }

  // Step 2a: If user location available, fetch nearby parks and filter by activity locally.
  // This avoids the /activities/parks endpoint which lacks coordinates, causing
  // distant parks to outrank nearby ones in pre-selection.
  if (userLat != null && userLon != null) {
    try {
      // Fetch parks from user's state (and neighboring states for border areas)
      // If reverse geocode failed, derive state from coordinates
      const effectiveState = stateCode ?? stateFromCoords(userLat, userLon);
      const stateCodes = getNeighborStates(effectiveState);
      const stateParam = stateCodes.join(",");

      const parksRes = await fetchParks({
        stateCode: stateParam,
        limit: 100,
      });

      if (parksRes.data.length > 0) {
        const actNameLower = activityName.toLowerCase();
        // Filter to parks that offer this activity and have nature designations
        let result = parksRes.data.filter((p) =>
          p.latitude && p.longitude &&
          !NON_NATURE_DESIGNATIONS.has(p.designation) &&
          p.activities.some((a) => {
            const n = a.name.toLowerCase();
            return n === actNameLower || n.includes(actNameLower) || actNameLower.includes(n);
          })
        );

        // Sort by distance from user
        result.sort((a, b) => {
          const dA = haversineDistMiles(userLat, userLon, parseFloat(a.latitude), parseFloat(a.longitude));
          const dB = haversineDistMiles(userLat, userLon, parseFloat(b.latitude), parseFloat(b.longitude));
          return dA - dB;
        });

        if (result.length >= 3) {
          result = result.slice(0, 20);
          setCache(cacheKey, result);
          return result;
        }
        // If fewer than 3 nearby results, fall through to nationwide search
      }
    } catch {
      // Fall through to activity-based search
    }
  }

  // Step 2b: Nationwide activity-based search (no user location, or not enough nearby results)
  if (activity) {
    try {
      const activityParksRes = await npsGet<NPSResponse<ActivityWithParks>>(
        "/activities/parks",
        { id: activity.id, limit: "200" }
      );
      const activityData = activityParksRes.data[0];
      if (activityData?.parks?.length) {
        // Filter out non-nature designations
        let scored = activityData.parks
          .map((p) => ({ ...p, score: scoreDesignation(p.designation, activityName) }))
          .filter((p) => p.score > 0)
          .sort((a, b) => b.score - a.score);

        // Prefer user's state if available
        if (stateCode) {
          const stateParks = scored.filter((p) =>
            p.states.split(",").map((s) => s.trim()).includes(stateCode)
          );
          if (stateParks.length >= 3) scored = stateParks;
        }

        const codes = scored.slice(0, 20).map((p) => p.parkCode).join(",");
        const parksRes = await fetchParks({ parkCode: codes, limit: 20 });
        if (parksRes.data.length > 0) {
          let result = parksRes.data;
          if (userLat != null && userLon != null) {
            result.sort((a, b) => {
              const dA = haversineDistMiles(userLat, userLon, parseFloat(a.latitude), parseFloat(a.longitude));
              const dB = haversineDistMiles(userLat, userLon, parseFloat(b.latitude), parseFloat(b.longitude));
              return dA - dB;
            });
          } else {
            const scoreMap = new Map(scored.map((p) => [p.parkCode, p.score]));
            result.sort((a, b) => (scoreMap.get(b.parkCode) ?? 0) - (scoreMap.get(a.parkCode) ?? 0));
          }
          setCache(cacheKey, result);
          return result;
        }
      }
    } catch {
      // Fall through to text search
    }
  }

  // Step 3: Text-search fallback — always tried if steps 1-2 fail or return nothing
  const res = await fetchParks({ q: activityName, stateCode: stateCode ?? "", limit: 20 });
  // Still filter out non-nature results from text search
  let result = res.data.filter((p) => !NON_NATURE_DESIGNATIONS.has(p.designation));
  if (result.length === 0) result = res.data;

  if (userLat != null && userLon != null) {
    result.sort((a, b) => {
      const dA = haversineDistMiles(userLat, userLon, parseFloat(a.latitude), parseFloat(a.longitude));
      const dB = haversineDistMiles(userLat, userLon, parseFloat(b.latitude), parseFloat(b.longitude));
      return dA - dB;
    });
  }

  setCache(cacheKey, result);
  return result;
}

// --- Alerts, Things To Do, Visitor Centers ---

export interface ParkAlert {
  id: string;
  title: string;
  description: string;
  category: string; // "Information" | "Caution" | "Danger" | "Park Closure"
  parkCode: string;
  url: string;
}

export interface ThingToDo {
  id: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  location: string;
  seasonDescription: string;
  durationDescription: string;
  images: ParkImage[];
  tags: string[];
  activities: ParkActivity[];
}

export interface VisitorCenter {
  id: string;
  name: string;
  description: string;
  directionsInfo: string;
  latLong: string; // NPS format: "lat:36.456, long:-112.836"
  operatingHours: OperatingHours[];
  addresses: ParkAddress[];
  contacts: {
    phoneNumbers: { phoneNumber: string; description: string; type: string }[];
    emailAddresses: { emailAddress: string; description: string }[];
  };
}

export async function fetchParkAlerts(parkCode: string): Promise<ParkAlert[]> {
  const res = await npsGet<NPSResponse<ParkAlert>>("/alerts", { parkCode, limit: "10" });
  return res.data;
}

export async function fetchThingsToDo(parkCode: string): Promise<ThingToDo[]> {
  const res = await npsGet<NPSResponse<ThingToDo>>("/thingstodo", { parkCode, limit: "20" });
  return res.data;
}

export async function fetchVisitorCenters(parkCode: string): Promise<VisitorCenter[]> {
  const res = await npsGet<NPSResponse<VisitorCenter>>("/visitorcenters", { parkCode, limit: "10" });
  return res.data;
}
