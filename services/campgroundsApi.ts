// Overpass API — OSM campground queries

import { overpassFetch } from "./overpassClient";

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

import { cacheGet, cacheSet, tilesForBbox } from "./spatialCache";

// Campgrounds are stable — 3 days is plenty before re-checking OSM
const CAMP_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days

const inFlight = new Set<string>();

function tileKey(s: number, w: number): string {
  return `camp2_${s.toFixed(0)}_${w.toFixed(0)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function _fetchCampgroundTile(
  s: number, w: number, n: number, e: number,
): Promise<Campground[]> {
  const key = tileKey(s, w);
  if (inFlight.has(key)) return [];

  const cached = await cacheGet<Campground[]>(key);
  if (cached) return cached;

  inFlight.add(key);
  try {
    const bbox = `${s},${w},${n},${e}`;
    const query = `
[out:json][timeout:12][maxsize:48000000];
(
  node["tourism"="camp_site"]["name"](${bbox});
  way["tourism"="camp_site"]["name"](${bbox});
  node["tourism"="caravan_site"]["name"](${bbox});
  way["tourism"="caravan_site"]["name"](${bbox});
  node["leisure"="camp_site"]["name"](${bbox});
);
out center qt 60;
`.trim();
    const json = await overpassFetch(query);
    const campgrounds: Campground[] = (json.elements as any[])
      .map((el) => {
        const tags: Record<string, string> = el.tags ?? {};
        const lat = el.type === "node" ? el.lat : el.center?.lat;
        const lon = el.type === "node" ? el.lon : el.center?.lon;
        if (!lat || !lon) return null;
        return {
          id: String(el.id), name: tags.name ?? "Unnamed Campground",
          fee: tristate(tags, "fee"), showers: tristate(tags, "shower", "showers"),
          toilets: tristate(tags, "toilets", "toilet"), tents: tristate(tags, "tents"),
          caravans: tristate(tags, "caravans"), operator: tags.operator ?? null,
          access: tags.access ?? null, phone: tags.phone ?? tags["contact:phone"] ?? null,
          website: tags.website ?? tags["contact:website"] ?? null,
          latitude: lat, longitude: lon,
        };
      })
      .filter(Boolean) as Campground[];
    await cacheSet(key, campgrounds, CAMP_TTL);
    return campgrounds;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Fetch named campgrounds within a bounding box.
 * Results cached per 1°×1° tile for 3 days — no re-fetch on pan or restart.
 * Only call when latitudeDelta < CAMPGROUNDS_ZOOM_THRESHOLD.
 */
export async function fetchCampgrounds(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<Campground[]> {
  // Cap viewport before splitting into tiles
  const latCenter = (south + north) / 2;
  const lonCenter = (west + east) / 2;
  const half = MAX_CAMP_BBOX_DEG / 2;
  south = Math.max(south, latCenter - half);
  north = Math.min(north, latCenter + half);
  west  = Math.max(west,  lonCenter - half);
  east  = Math.min(east,  lonCenter + half);

  // Check which tiles are already cached
  const tiles = tilesForBbox(south, west, north, east);
  const cachedResults: Campground[] = [];
  let allCached = true;
  for (const t of tiles) {
    const cached = await cacheGet<Campground[]>(tileKey(t.s, t.w));
    if (cached) {
      cachedResults.push(...cached);
    } else {
      allCached = false;
    }
  }
  if (allCached) {
    const seen = new Set<string>();
    return cachedResults.filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
  }

  // Fetch entire viewport in ONE query (avoids rate limiting)
  const bbox = `${south},${west},${north},${east}`;
  const query = `
[out:json][timeout:12][maxsize:48000000];
(
  node["tourism"="camp_site"]["name"](${bbox});
  way["tourism"="camp_site"]["name"](${bbox});
  node["tourism"="caravan_site"]["name"](${bbox});
  way["tourism"="caravan_site"]["name"](${bbox});
  node["leisure"="camp_site"]["name"](${bbox});
);
out center qt 100;
`.trim();
  try {
    const json = await overpassFetch(query);
    const campgrounds: Campground[] = (json.elements as any[])
      .map((el) => {
        const tags: Record<string, string> = el.tags ?? {};
        const lat = el.type === "node" ? el.lat : el.center?.lat;
        const lon = el.type === "node" ? el.lon : el.center?.lon;
        if (!lat || !lon) return null;
        return {
          id: String(el.id), name: tags.name ?? "Unnamed Campground",
          fee: tristate(tags, "fee"), showers: tristate(tags, "shower", "showers"),
          toilets: tristate(tags, "toilets", "toilet"), tents: tristate(tags, "tents"),
          caravans: tristate(tags, "caravans"), operator: tags.operator ?? null,
          access: tags.access ?? null, phone: tags.phone ?? tags["contact:phone"] ?? null,
          website: tags.website ?? tags["contact:website"] ?? null,
          latitude: lat, longitude: lon,
        };
      })
      .filter(Boolean) as Campground[];

    // Distribute into tile cache for future reuse
    for (const t of tiles) {
      const tileCamps = campgrounds.filter(
        (c) => c.latitude >= t.s && c.latitude < t.n && c.longitude >= t.w && c.longitude < t.e
      );
      await cacheSet(tileKey(t.s, t.w), tileCamps, CAMP_TTL);
    }
    return campgrounds;
  } catch {
    return cachedResults;
  }
}
