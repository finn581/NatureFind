// Open-Meteo — free, no API key required
// https://open-meteo.com/en/docs

const BASE = "https://api.open-meteo.com/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CurrentWeather {
  temperature_2m: number;
  weathercode: number;
  precipitation: number;
  windspeed_10m: number;
}

interface DailyWeather {
  precipitation_probability_max: number[];
  windspeed_10m_max: number[];
}

interface WeatherData {
  current: CurrentWeather;
  daily: DailyWeather;
}

export interface ConditionScore {
  score: number;                         // 0-100
  label: "Great" | "Good" | "Fair" | "Poor";
  color: string;                         // accent hex
  bgColor: string;                       // dark tint hex for badges
  summary: string;                       // "72°F · Calm · Clear"
  tempF: number;
  windMph: number;
  precipChance: number;
  weatherCode: number;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry { data: WeatherData; ts: number }
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ─── WMO weather code helpers ─────────────────────────────────────────────────

function skyDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 55) return "Light drizzle";
  if (code <= 67) return "Rainy";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  return "Thunderstorm";
}

function windDescription(mph: number): string {
  if (mph < 5) return "Calm";
  if (mph < 15) return "Light breeze";
  if (mph < 25) return "Breezy";
  return "Windy";
}

// ─── Score algorithm ──────────────────────────────────────────────────────────
// Total 100 pts: temp (35) + weather code (35) + wind (15) + precip chance (15)

export function computeConditionScore(weather: WeatherData): ConditionScore {
  const { temperature_2m, weathercode, windspeed_10m } = weather.current;
  const precipChance = weather.daily.precipitation_probability_max[0] ?? 0;
  const windMax = weather.daily.windspeed_10m_max[0] ?? windspeed_10m;

  // Temperature (0-35)
  let tempScore = 35;
  if (temperature_2m < 20 || temperature_2m > 105) tempScore = 0;
  else if (temperature_2m < 32 || temperature_2m > 95) tempScore = 8;
  else if (temperature_2m < 45 || temperature_2m > 88) tempScore = 18;
  else if (temperature_2m < 55 || temperature_2m > 80) tempScore = 28;
  // 55–80°F stays 35

  // Weather code (0-35)
  let codeScore = 35;
  if (weathercode === 0) codeScore = 35;
  else if (weathercode <= 3) codeScore = 32;
  else if (weathercode <= 48) codeScore = 22;  // fog
  else if (weathercode <= 67) codeScore = 10;  // rain / drizzle
  else if (weathercode <= 77) codeScore = 8;   // snow
  else if (weathercode <= 82) codeScore = 12;  // showers
  else codeScore = 0;                           // thunderstorm / hail

  // Wind (0-15) — use daily max for planning purposes
  let windScore = 15;
  if (windMax > 30) windScore = 0;
  else if (windMax > 20) windScore = 5;
  else if (windMax > 12) windScore = 10;

  // Precipitation probability (0-15)
  let precipScore = 15;
  if (precipChance > 70) precipScore = 0;
  else if (precipChance > 50) precipScore = 5;
  else if (precipChance > 30) precipScore = 10;

  const score = Math.max(0, Math.min(100, tempScore + codeScore + windScore + precipScore));

  let label: ConditionScore["label"];
  let color: string;
  let bgColor: string;
  if (score >= 75) {
    label = "Great"; color = "#4ade80"; bgColor = "#052e16";
  } else if (score >= 50) {
    label = "Good"; color = "#a3e635"; bgColor = "#1a2e05";
  } else if (score >= 25) {
    label = "Fair"; color = "#fb923c"; bgColor = "#2b1200";
  } else {
    label = "Poor"; color = "#f87171"; bgColor = "#2b0707";
  }

  return {
    score,
    label,
    color,
    bgColor,
    summary: `${Math.round(temperature_2m)}°F · ${windDescription(windMax)} · ${skyDescription(weathercode)}`,
    tempF: Math.round(temperature_2m),
    windMph: Math.round(windMax),
    precipChance: Math.round(precipChance),
    weatherCode: weathercode,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weathercode,precipitation,windspeed_10m",
    daily: "precipitation_probability_max,windspeed_10m_max",
    temperature_unit: "fahrenheit",
    windspeed_unit: "mph",
    forecast_days: "1",
    timezone: "auto",
  });

  const res = await fetch(`${BASE}/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

// ─── 7-day Forecast ───────────────────────────────────────────────────────────

export interface ForecastDay {
  dateLabel: string;   // "Today", "Mon", "Tue" …
  high: number;        // °F
  low: number;         // °F
  precipChance: number; // 0–100
  weatherCode: number;
}

export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}

interface ForecastCache { data: ForecastDay[]; ts: number }
const _forecastCache = new Map<string, ForecastCache>();

export async function getParkForecast(
  latitude: number | string,
  longitude: number | string,
): Promise<ForecastDay[]> {
  const lat = parseFloat(String(latitude));
  const lon = parseFloat(String(longitude));
  if (isNaN(lat) || isNaN(lon)) return [];

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = _forecastCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const params = new URLSearchParams({
    latitude: String(lat.toFixed(2)),
    longitude: String(lon.toFixed(2)),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode",
    temperature_unit: "fahrenheit",
    forecast_days: "7",
    timezone: "auto",
  });

  const res = await fetch(`${BASE}/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo forecast ${res.status}`);
  const json = await res.json();
  const { time, temperature_2m_max, temperature_2m_min, precipitation_probability_max, weathercode } = json.daily;

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const result: ForecastDay[] = time.map((date: string, i: number) => {
    const d = new Date(date + "T12:00:00");
    return {
      dateLabel: i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_LABELS[d.getDay()],
      high: Math.round(temperature_2m_max[i] ?? 0),
      low: Math.round(temperature_2m_min[i] ?? 0),
      precipChance: Math.round(precipitation_probability_max[i] ?? 0),
      weatherCode: weathercode[i] ?? 0,
    };
  });

  _forecastCache.set(key, { data: result, ts: Date.now() });
  return result;
}

/**
 * Fetch weather + compute condition score for a park coordinate.
 * Results cached 1 hour per 0.01° grid (~0.7 mile). Returns null on any error.
 */
export async function getParkCondition(
  latitude: number | string,
  longitude: number | string,
): Promise<ConditionScore | null> {
  const lat = parseFloat(String(latitude));
  const lon = parseFloat(String(longitude));
  if (isNaN(lat) || isNaN(lon)) return null;

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return computeConditionScore(cached.data);
  }

  try {
    const data = await fetchWeather(lat, lon);
    _cache.set(key, { data, ts: Date.now() });
    return computeConditionScore(data);
  } catch {
    return null;
  }
}
