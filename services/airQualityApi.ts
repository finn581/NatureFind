// Google Air Quality API — AQI for park locations
// Docs: https://developers.google.com/maps/documentation/air-quality

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_AIR_QUALITY_KEY ?? "";
const BASE = "https://airquality.googleapis.com/v1/currentConditions:lookup";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AirQualityData {
  aqi: number; // 0-500 US AQI
  category: string; // "Good", "Moderate", etc.
  color: string; // hex color for badge
  dominantPollutant: string;
  healthRecommendation: string;
  fetchedAt: number;
}

type AqiLevel = { max: number; label: string; color: string };

const AQI_LEVELS: AqiLevel[] = [
  { max: 50, label: "Good", color: "#22c55e" },
  { max: 100, label: "Moderate", color: "#f59e0b" },
  { max: 150, label: "Unhealthy for Sensitive", color: "#f97316" },
  { max: 200, label: "Unhealthy", color: "#ef4444" },
  { max: 300, label: "Very Unhealthy", color: "#9333ea" },
  { max: 500, label: "Hazardous", color: "#7f1d1d" },
];

function aqiLevel(aqi: number): { label: string; color: string } {
  for (const level of AQI_LEVELS) {
    if (aqi <= level.max) return { label: level.label, color: level.color };
  }
  return { label: "Hazardous", color: "#7f1d1d" };
}

// ─── Cache (1hr per rounded location) ────────────────────────────────────────

const cache = new Map<string, AirQualityData>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function getAirQuality(
  latitude: number,
  longitude: number,
): Promise<AirQualityData | null> {
  if (!API_KEY) return null;

  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;

  try {
    const resp = await fetch(`${BASE}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: { latitude, longitude },
        extraComputations: ["HEALTH_RECOMMENDATIONS", "DOMINANT_POLLUTANT_CONCENTRATION"],
        languageCode: "en",
      }),
    });

    if (!resp.ok) {
      console.warn("[AirQuality] API error:", resp.status);
      return null;
    }

    const data = await resp.json();
    const indexes = data.indexes;
    if (!indexes || indexes.length === 0) return null;

    // Prefer US AQI (uaqi), fall back to first available
    const usAqi = indexes.find((i: any) => i.code === "uaqi") ?? indexes[0];
    const aqi = Math.round(usAqi.aqi ?? 0);
    const { label, color } = aqiLevel(aqi);

    const healthRecs = data.healthRecommendations;
    const recommendation =
      healthRecs?.generalPopulation ??
      healthRecs?.athletes ??
      "No specific recommendations.";

    const result: AirQualityData = {
      aqi,
      category: label,
      color,
      dominantPollutant: usAqi.dominantPollutant ?? "Unknown",
      healthRecommendation: recommendation,
      fetchedAt: Date.now(),
    };

    cache.set(key, result);
    return result;
  } catch (e) {
    console.warn("[AirQuality] fetch failed:", e);
    return null;
  }
}
