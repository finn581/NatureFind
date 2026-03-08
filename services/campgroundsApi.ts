// Overpass API — OSM campground queries via Private.coffee (no rate limits, free)

const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Campground {
  id: string;
  name: string;
  fee: boolean | null;
  showers: boolean | null;
  toilets: boolean | null;
  tents: boolean | null;
  caravans: boolean | null;
  operator: string | null;
  access: string | null;
  phone: string | null;
  website: string | null;
  latitude: number;
  longitude: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Show campground pins below this latitudeDelta (above → show nudge, no fetch)
export const CAMPGROUNDS_ZOOM_THRESHOLD = 8.0;

export const CAMPGROUND_COLOR = "#0891b2"; // cyan

// Maximum bounding box sent to Overpass to prevent slow wide-zoom queries
const MAX_CAMP_BBOX_DEG = 4;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tristate(tags: Record<string, string>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    if (tags[key] === "yes") return true;
    if (tags[key] === "no") return false;
  }
  return null;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry { data: Campground[]; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function cacheKey(s: number, w: number, n: number, e: number): string {
  return `camp_${s.toFixed(3)},${w.toFixed(3)},${n.toFixed(3)},${e.toFixed(3)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch named campgrounds (tent sites, RV parks, camp sites) within a bounding box.
 * Only call when latitudeDelta < CAMPGROUNDS_ZOOM_THRESHOLD.
 */
export async function fetchCampgrounds(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<Campground[]> {
  // Cap bbox so wide-zoom viewports don't send huge queries to Overpass
  const latCenter = (south + north) / 2;
  const lonCenter = (west + east) / 2;
  const half = MAX_CAMP_BBOX_DEG / 2;
  south  = Math.max(south,  latCenter - half);
  north  = Math.min(north,  latCenter + half);
  west   = Math.max(west,   lonCenter - half);
  east   = Math.min(east,   lonCenter + half);

  const key = cacheKey(south, west, north, east);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const bbox = `${south},${west},${north},${east}`;
  const query = `
[out:json][timeout:20][maxsize:8000000];
(
  node["tourism"="camp_site"]["name"](${bbox});
  way["tourism"="camp_site"]["name"](${bbox});
  node["tourism"="caravan_site"]["name"](${bbox});
  way["tourism"="caravan_site"]["name"](${bbox});
  node["leisure"="camp_site"]["name"](${bbox});
);
out center qt 60;
`.trim();

  const res = await fetch(OVERPASS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);

  const json = await res.json();

  const campgrounds: Campground[] = (json.elements as any[])
    .map((el) => {
      const tags: Record<string, string> = el.tags ?? {};
      const lat = el.type === "node" ? el.lat : el.center?.lat;
      const lon = el.type === "node" ? el.lon : el.center?.lon;
      if (!lat || !lon) return null;
      return {
        id: String(el.id),
        name: tags.name ?? "Unnamed Campground",
        fee: tristate(tags, "fee"),
        showers: tristate(tags, "shower", "showers"),
        toilets: tristate(tags, "toilets", "toilet"),
        tents: tristate(tags, "tents"),
        caravans: tristate(tags, "caravans"),
        operator: tags.operator ?? null,
        access: tags.access ?? null,
        phone: tags.phone ?? tags["contact:phone"] ?? null,
        website: tags.website ?? tags["contact:website"] ?? null,
        latitude: lat,
        longitude: lon,
      };
    })
    .filter(Boolean) as Campground[];

  cache.set(key, { data: campgrounds, ts: Date.now() });
  return campgrounds;
}
