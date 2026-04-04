// Google Places API (New) — Nearby amenities for parks and campgrounds
// Docs: https://developers.google.com/maps/documentation/places/web-service

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? "";
const BASE = "https://places.googleapis.com/v1/places:searchNearby";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NearbyPlace {
  id: string;
  name: string;
  type: "gas" | "food" | "restroom" | "store" | "lodging";
  address: string;
  distance?: number; // miles
  rating?: number;
  isOpen?: boolean;
  icon: string; // Ionicons name
}

const TYPE_MAP: Record<string, { type: NearbyPlace["type"]; icon: string }> = {
  gas_station: { type: "gas", icon: "car-outline" },
  restaurant: { type: "food", icon: "restaurant-outline" },
  cafe: { type: "food", icon: "cafe-outline" },
  convenience_store: { type: "store", icon: "cart-outline" },
  grocery_store: { type: "store", icon: "cart-outline" },
  lodging: { type: "lodging", icon: "bed-outline" },
  rest_stop: { type: "restroom", icon: "medical-outline" },
};

// ─── Cache ───────────────────────────────────────────────────────────────────

const cache = new Map<string, { places: NearbyPlace[]; at: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

// ─── Haversine ───────────────────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

// ─── Activity-Specific Search ────────────────────────────────────────────────

export interface ActivityPlace {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance?: number;
  rating?: number;
  isOpen?: boolean;
  icon: string;
}

export async function searchForActivity(
  config: { googleTypes: string[]; keyword: string | null; icon: string },
  latitude: number,
  longitude: number,
  radiusMeters: number = 40000,
): Promise<ActivityPlace[]> {
  if (!API_KEY) return [];

  const key = `activity_${config.keyword ?? config.googleTypes.join(",")}_${latitude.toFixed(2)}_${longitude.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.places as unknown as ActivityPlace[];
  }

  const isNearby = config.googleTypes.length > 0;
  const url = isNearby
    ? "https://places.googleapis.com/v1/places:searchNearby"
    : "https://places.googleapis.com/v1/places:searchText";

  const body = isNearby
    ? {
        includedTypes: config.googleTypes,
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude, longitude }, radius: radiusMeters } },
      }
    : {
        textQuery: config.keyword,
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationBias: { circle: { center: { latitude, longitude }, radius: radiusMeters } },
      };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.shortFormattedAddress,places.rating,places.currentOpeningHours,places.location",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) return [];

    const data = await resp.json();
    const rawPlaces = data.places ?? [];

    const results: ActivityPlace[] = rawPlaces
      .map((p: any) => {
        const pLat = p.location?.latitude;
        const pLon = p.location?.longitude;
        if (!pLat || !pLon) return null;

        return {
          id: p.id,
          name: p.displayName?.text ?? "Unknown",
          address: p.shortFormattedAddress ?? "",
          latitude: pLat,
          longitude: pLon,
          distance: haversine(latitude, longitude, pLat, pLon),
          rating: p.rating,
          isOpen: p.currentOpeningHours?.openNow,
          icon: config.icon,
        };
      })
      .filter(Boolean) as ActivityPlace[];

    results.sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));
    return results;
  } catch (e) {
    console.warn("[Places] activity search failed:", e);
    return [];
  }
}

// ─── Place Details ───────────────────────────────────────────────────────────

export interface PlaceDetails {
  name: string;
  address?: string;
  rating?: number;
  userRatingCount?: number;
  phone?: string;
  website?: string;
  editorialSummary?: string;
  isOpenNow?: boolean;
  weekdayHours: string[];
  photoReferences: string[];
  reviews: { authorName: string; rating: number; text: string; relativeTime: string }[];
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!API_KEY) return null;

  try {
    const resp = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,rating,userRatingCount,currentOpeningHours,nationalPhoneNumber,websiteUri,editorialSummary,photos,reviews,googleMapsUri",
      },
    });

    if (!resp.ok) return null;
    const p = await resp.json();

    return {
      name: p.displayName?.text ?? "",
      address: p.formattedAddress,
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      phone: p.nationalPhoneNumber,
      website: p.websiteUri,
      editorialSummary: p.editorialSummary?.text,
      isOpenNow: p.currentOpeningHours?.openNow,
      weekdayHours: p.currentOpeningHours?.weekdayDescriptions ?? [],
      photoReferences: (p.photos ?? []).slice(0, 5).map((ph: any) => ph.name).filter(Boolean),
      reviews: (p.reviews ?? []).slice(0, 5).map((r: any) => ({
        authorName: r.authorAttribution?.displayName ?? "Anonymous",
        rating: r.rating ?? 0,
        text: r.text?.text ?? "",
        relativeTime: r.relativePublishTimeDescription ?? "",
      })).filter((r: any) => r.text),
    };
  } catch (e) {
    console.warn("[Places] detail fetch failed:", e);
    return null;
  }
}

export function placePhotoUrl(reference: string, maxWidth: number = 800): string {
  return `https://places.googleapis.com/v1/${reference}/media?maxWidthPx=${maxWidth}&key=${API_KEY}`;
}

// ─── Nearby Amenities ────────────────────────────────────────────────────────

export async function getNearbyAmenities(
  latitude: number,
  longitude: number,
  radiusMeters: number = 16000, // ~10 miles
): Promise<NearbyPlace[]> {
  if (!API_KEY) return [];

  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.places;

  try {
    const resp = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.shortFormattedAddress,places.primaryType,places.rating,places.currentOpeningHours,places.location",
      },
      body: JSON.stringify({
        includedTypes: [
          "gas_station",
          "restaurant",
          "cafe",
          "convenience_store",
          "grocery_store",
          "lodging",
        ],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: radiusMeters,
          },
        },
        rankPreference: "DISTANCE",
      }),
    });

    if (!resp.ok) {
      console.warn("[Places] API error:", resp.status);
      return [];
    }

    const data = await resp.json();
    const rawPlaces = data.places ?? [];

    const places: NearbyPlace[] = rawPlaces
      .map((p: any) => {
        const primaryType = p.primaryType ?? "";
        const mapped = TYPE_MAP[primaryType];
        if (!mapped) return null;

        const dist = p.location
          ? haversine(latitude, longitude, p.location.latitude, p.location.longitude)
          : undefined;

        return {
          id: p.id,
          name: p.displayName?.text ?? "Unknown",
          type: mapped.type,
          address: p.shortFormattedAddress ?? "",
          distance: dist ? Math.round(dist * 10) / 10 : undefined,
          rating: p.rating,
          isOpen: p.currentOpeningHours?.openNow,
          icon: mapped.icon,
        } as NearbyPlace;
      })
      .filter(Boolean) as NearbyPlace[];

    // Sort by distance
    places.sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));

    cache.set(key, { places, at: Date.now() });
    return places;
  } catch (e) {
    console.warn("[Places] fetch failed:", e);
    return [];
  }
}
