// Geoapify Places API — reliable OSM-based park search
// Free tier: 3,000 requests/day. Get a key at https://myprojects.geoapify.com/

const GEOAPIFY_PLACES = "https://api.geoapify.com/v2/places";
const GEOAPIFY_GEOCODE = "https://api.geoapify.com/v1/geocode/search";
const GEOAPIFY_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_KEY ?? "";

export interface OverpassPark {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: "state" | "local";
}

interface GeoapifyFeature {
  properties: {
    place_id: string;
    name?: string;
    lat: number;
    lon: number;
    city?: string;
    state?: string;
    categories?: string[];
    formatted?: string;
  };
}

interface GeoapifyResponse {
  features: GeoapifyFeature[];
}

// --- Geocoding ---

interface GeocodedLocation {
  lat: number;
  lon: number;
}

export async function geocode(query: string): Promise<GeocodedLocation | null> {
  const url = `${GEOAPIFY_GEOCODE}?text=${encodeURIComponent(query)}&format=json&limit=1&apiKey=${GEOAPIFY_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const result = json.results?.[0];
  if (!result) return null;
  return { lat: result.lat, lon: result.lon };
}

// --- Places search ---

async function searchPlaces(
  lat: number,
  lon: number,
  radiusMeters: number,
  categories: string,
  limit: number = 50,
): Promise<GeoapifyFeature[]> {
  const url = `${GEOAPIFY_PLACES}?categories=${categories}&filter=circle:${lon},${lat},${radiusMeters}&conditions=named&limit=${limit}&apiKey=${GEOAPIFY_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoapify error: ${res.status}`);
  const json: GeoapifyResponse = await res.json();
  return json.features?.filter((f) => f.properties.name) ?? [];
}

function toParks(features: GeoapifyFeature[], type: "state" | "local"): OverpassPark[] {
  return features.map((f) => ({
    id: f.properties.place_id,
    name: f.properties.name!,
    latitude: f.properties.lat,
    longitude: f.properties.lon,
    type,
  }));
}

// --- Public API ---

export async function fetchStateParks(
  lat: number,
  lon: number,
  radiusMiles: number = 100,
  searchQuery?: string,
): Promise<OverpassPark[]> {
  // If user typed a location, geocode it and search there instead
  let searchLat = lat;
  let searchLon = lon;
  if (searchQuery?.trim()) {
    const geo = await geocode(searchQuery);
    if (geo) {
      searchLat = geo.lat;
      searchLon = geo.lon;
    }
  }

  const r = Math.round(radiusMiles * 1609.34);
  const features = await searchPlaces(
    searchLat,
    searchLon,
    r,
    "leisure.park,national_park,natural.forest",
    50,
  );
  // Filter for state parks by name
  const stateParks = features.filter((f) =>
    /state\s+(park|recreation|reserve|forest|beach|historic)/i.test(f.properties.name ?? "")
  );
  return toParks(stateParks, "state");
}

export async function fetchLocalParks(
  lat: number,
  lon: number,
  radiusMiles: number = 30,
  searchQuery?: string,
): Promise<OverpassPark[]> {
  let searchLat = lat;
  let searchLon = lon;
  if (searchQuery?.trim()) {
    const geo = await geocode(searchQuery);
    if (geo) {
      searchLat = geo.lat;
      searchLon = geo.lon;
    }
  }

  const r = Math.round(radiusMiles * 1609.34);
  const features = await searchPlaces(
    searchLat,
    searchLon,
    r,
    "leisure.park",
    50,
  );
  // Exclude state/national parks
  const localParks = features.filter((f) =>
    !/state\s+(park|recreation|reserve|forest)|national\s+(park|forest)/i.test(f.properties.name ?? "")
  );
  return toParks(localParks, "local");
}
