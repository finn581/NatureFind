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
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
  return npsGet<NPSResponse<Park>>("/parks", {
    stateCode: params.stateCode ?? "",
    q: params.q ?? "",
    limit: String(params.limit ?? 20),
    start: String(params.start ?? 0),
    parkCode: params.parkCode ?? "",
    fields: "images,addresses,entranceFees,operatingHours,activities",
  });
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

export async function fetchParksByActivity(activityName: string, stateCode?: string): Promise<Park[]> {
  const cacheKey = `activity_parks_${activityName.toLowerCase()}_${stateCode ?? "all"}`;
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

  // Step 2: Fetch parks for that activity — non-fatal
  if (activity) {
    try {
      const activityParksRes = await npsGet<NPSResponse<ActivityWithParks>>(
        "/activities/parks",
        { id: activity.id, limit: "200" }
      );
      const activityData = activityParksRes.data[0];
      if (activityData?.parks?.length) {
        let chosen = activityData.parks;

        // Prefer parks in the user's state; fall back to all if fewer than 3 matches
        if (stateCode) {
          const stateParks = chosen.filter((p) =>
            p.states.split(",").map((s) => s.trim()).includes(stateCode)
          );
          if (stateParks.length >= 3) chosen = stateParks;
        }

        const codes = chosen.slice(0, 20).map((p) => p.parkCode).join(",");
        const parksRes = await fetchParks({ parkCode: codes, limit: 20 });
        if (parksRes.data.length > 0) {
          setCache(cacheKey, parksRes.data);
          return parksRes.data;
        }
      }
    } catch {
      // Fall through to text search
    }
  }

  // Step 3: Text-search fallback — always tried if steps 1-2 fail or return nothing
  const res = await fetchParks({ q: activityName, stateCode: stateCode ?? "", limit: 20 });
  const result = res.data;
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
