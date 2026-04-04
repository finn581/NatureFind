// Google Maps Elevation API — trail elevation profiles
// Docs: https://developers.google.com/maps/documentation/elevation

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_ELEVATION_KEY ?? "";
const BASE = "https://maps.googleapis.com/maps/api/elevation/json";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ElevationProfile {
  points: { distance: number; elevation: number }[]; // distance in miles, elevation in feet
  minElevation: number;
  maxElevation: number;
  totalGain: number;
  totalLoss: number;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const cache = new Map<string, ElevationProfile>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToFeet(m: number): number {
  return Math.round(m * 3.28084);
}

// Sample up to maxSamples evenly-spaced points from the coordinate array
function sampleCoords(
  coords: { latitude: number; longitude: number }[],
  maxSamples: number,
): { latitude: number; longitude: number }[] {
  if (coords.length <= maxSamples) return coords;
  const step = (coords.length - 1) / (maxSamples - 1);
  const result: { latitude: number; longitude: number }[] = [];
  for (let i = 0; i < maxSamples; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  return result;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function getElevationProfile(
  trailId: string,
  coordinates: { latitude: number; longitude: number }[],
): Promise<ElevationProfile | null> {
  if (!API_KEY || coordinates.length < 2) return null;

  const cached = cache.get(trailId);
  if (cached) return cached;

  // Sample max 100 points (API limit is 512 per request, but keep costs low)
  const sampled = sampleCoords(coordinates, 100);

  // Build locations param: lat,lng|lat,lng|...
  const locations = sampled.map((c) => `${c.latitude},${c.longitude}`).join("|");

  try {
    const resp = await fetch(`${BASE}?locations=${encodeURIComponent(locations)}&key=${API_KEY}`);
    if (!resp.ok) {
      console.warn("[Elevation] API error:", resp.status);
      return null;
    }

    const data = await resp.json();
    if (data.status !== "OK" || !data.results) return null;

    // Calculate cumulative distance and build profile
    let cumulativeDistance = 0;
    let totalGain = 0;
    let totalLoss = 0;
    let minElev = Infinity;
    let maxElev = -Infinity;

    const points: { distance: number; elevation: number }[] = data.results.map(
      (r: any, i: number) => {
        const elevFt = metersToFeet(r.elevation);
        if (elevFt < minElev) minElev = elevFt;
        if (elevFt > maxElev) maxElev = elevFt;

        if (i > 0) {
          const prev = sampled[i - 1];
          const curr = sampled[i];
          cumulativeDistance += haversineDistance(
            prev.latitude, prev.longitude,
            curr.latitude, curr.longitude,
          );
          const prevElev = metersToFeet(data.results[i - 1].elevation);
          const diff = elevFt - prevElev;
          if (diff > 0) totalGain += diff;
          else totalLoss += Math.abs(diff);
        }

        return { distance: cumulativeDistance, elevation: elevFt };
      },
    );

    const profile: ElevationProfile = {
      points,
      minElevation: minElev,
      maxElevation: maxElev,
      totalGain: Math.round(totalGain),
      totalLoss: Math.round(totalLoss),
    };

    cache.set(trailId, profile);
    return profile;
  } catch (e) {
    console.warn("[Elevation] fetch failed:", e);
    return null;
  }
}
