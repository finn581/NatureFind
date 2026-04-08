// Overpass API — Direct OSM trail queries

import { overpassFetch } from "./overpassClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrailDifficulty = "easy" | "moderate" | "hard" | "expert" | "unknown";

export interface Trail {
  id: string;
  name: string;
  difficulty: TrailDifficulty;
  surface: string;
  dogFriendly: boolean | null;
  fee: boolean | null;
  access: string | null;
  coordinates: Array<{ latitude: number; longitude: number }>;
  color: string;
  distanceMiles: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DIFFICULTY_COLORS: Record<TrailDifficulty, string> = {
  easy:     "#52b788", // green
  moderate: "#f59e0b", // amber
  hard:     "#f97316", // orange
  expert:   "#ef4444", // red
  unknown:  "#60a5fa", // blue
};

export const DIFFICULTY_LABELS: Record<TrailDifficulty, string> = {
  easy:     "Easy",
  moderate: "Moderate",
  hard:     "Hard",
  expert:   "Expert",
  unknown:  "Unknown",
};

// Polyline detail only loads below this latitudeDelta (~zoom 11)
export const TRAILS_ZOOM_THRESHOLD = 0.2;
// Preview pins load below this latitudeDelta — set very high so pins show at any practical zoom
export const TRAILS_PREVIEW_MAX_ZOOM = 50;
// Maximum bounding box size sent to Overpass — prevents huge/slow queries
// 1.0° ≈ 70mi — one tile; 48MB maxsize is the sweet spot for dense areas
const MAX_PREVIEW_BBOX_DEG = 1.0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function difficultyFromTags(tags: Record<string, string>): TrailDifficulty {
  const sac = tags["sac_scale"];
  if (sac) {
    if (sac === "hiking") return "easy";
    if (sac === "mountain_hiking") return "moderate";
    if (sac === "demanding_mountain_hiking") return "hard";
    return "expert";
  }
  // Fallback: trail_difficulty tag
  const td = tags["trail_difficulty"] ?? tags["difficulty"];
  if (td) {
    if (/^(easy|beginner|green)/i.test(td)) return "easy";
    if (/^(moderate|intermediate|blue)/i.test(td)) return "moderate";
    if (/^(hard|difficult|black)/i.test(td)) return "hard";
    if (/^(expert|extreme|double.?black)/i.test(td)) return "expert";
  }
  // Fallback: tracktype (common in SA)
  const tt = tags.tracktype;
  if (tt) {
    if (tt === "grade1" || tt === "grade2") return "easy";
    if (tt === "grade3") return "moderate";
    if (tt === "grade4" || tt === "grade5") return "hard";
  }
  return "unknown";
}

// Street-address pattern: starts with a number, e.g. "123 Main St", "5th Avenue"
const ADDRESS_RE = /^\d+\s|\bstreet\b|\bavenue\b|\bdrive\b|\blane\b|\bboulevard\b|\broad\b/i;

/**
 * Returns true if this OSM way represents a real hiking/nature trail.
 * Filters out: unnamed ways and ways with street/address-style names.
 * Named paths without difficulty ratings are kept — they're still real trails.
 */
function isRealTrail(name: string): boolean {
  if (!name) return false;
  if (ADDRESS_RE.test(name)) return false;
  return true;
}

function surfaceLabel(tags: Record<string, string>): string {
  const s = tags["surface"];
  if (!s) return tags["tracktype"] ? `Track ${tags["tracktype"]}` : "Natural";
  const map: Record<string, string> = {
    paved: "Paved", asphalt: "Paved", concrete: "Paved",
    unpaved: "Dirt", dirt: "Dirt", ground: "Dirt",
    gravel: "Gravel", fine_gravel: "Gravel",
    grass: "Grass", sand: "Sand", rock: "Rock", stone: "Stone",
    wood: "Boardwalk", compacted: "Compacted",
  };
  return map[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Distance helpers ─────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDistanceMiles(
  coords: Array<{ latitude: number; longitude: number }>,
  tags: Record<string, string>,
): number | null {
  // Prefer OSM tag if present (handles out-and-back, loop corrections)
  const tagVal = tags["distance"] ?? tags["length"];
  if (tagVal) {
    const num = parseFloat(tagVal);
    if (!isNaN(num) && num > 0) {
      // OSM distance tag is typically in km; convert to miles
      return Math.round(num * 0.621371 * 10) / 10;
    }
  }
  if (coords.length < 2) return null;
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    km += haversineKm(
      coords[i - 1].latitude, coords[i - 1].longitude,
      coords[i].latitude, coords[i].longitude,
    );
  }
  return km < 0.05 ? null : Math.round(km * 0.621371 * 10) / 10;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

import { cacheGet, cacheSet, tilesForBbox } from "./spatialCache";

// Trails barely change — 7 days is safe. Recheck on next app open after that.
const TRAIL_TTL     = 7 * 24 * 60 * 60 * 1000;  // 7 days
const PREVIEW_TTL   = 3 * 24 * 60 * 60 * 1000;  // 3 days for preview pins

// In-flight dedup — prevent duplicate Overpass requests within a session
const inFlight = new Set<string>();

function tileKey(s: number, w: number, type: "trail" | "preview"): string {
  // v2: broadened query to include highway=footway + track with name
  return `${type}2_${s.toFixed(0)}_${w.toFixed(0)}`;
}

export interface TrailPreview {
  id: string;
  name: string;
  difficulty: TrailDifficulty;
  color: string;
  latitude: number;
  longitude: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch preview pins (center points) for trails in a bbox.
 * Results are cached per 1°×1° tile for 3 days — survives app restarts.
 */
async function _fetchPreviewTile(
  s: number, w: number, n: number, e: number,
): Promise<TrailPreview[]> {
  const key = tileKey(s, w, "preview");
  if (inFlight.has(key)) return [];

  // L1/L2 cache check
  const cached = await cacheGet<TrailPreview[]>(key);
  if (cached) return cached;

  inFlight.add(key);
  try {
    const bbox = `${s},${w},${n},${e}`;
    const query = `
[out:json][timeout:12][maxsize:48000000];
(
  way["highway"="path"]["name"]["access"!="private"](${bbox});
  way["highway"="path"]["sac_scale"]["access"!="private"](${bbox});
  way["highway"~"^(track|bridleway)$"]["sac_scale"]["access"!="private"](${bbox});
  way["highway"="track"]["tracktype"~"^(grade3|grade4|grade5)$"]["access"!="private"](${bbox});
);
out center qt 80;
`.trim();
    const json = await overpassFetch(query);
    const previews: TrailPreview[] = (json.elements as any[])
      .filter((el) => el.center)
      .map((el) => {
        const tags: Record<string, string> = el.tags ?? {};
        const difficulty = difficultyFromTags(tags);
        return {
          id: `prev_${el.id}`, name: tags.name ?? "", difficulty,
          color: DIFFICULTY_COLORS[difficulty],
          latitude: el.center.lat, longitude: el.center.lon,
        };
      })
      .filter((t) => isRealTrail(t.name));
    await cacheSet(key, previews, PREVIEW_TTL);
    return previews;
  } finally {
    inFlight.delete(key);
  }
}

export async function fetchTrailPreviews(
  south: number, west: number, north: number, east: number,
): Promise<TrailPreview[]> {
  // Cap viewport so we never send a massive query
  const latCenter = (south + north) / 2;
  const lonCenter = (west + east) / 2;
  const half = MAX_PREVIEW_BBOX_DEG / 2;
  south = Math.max(south, latCenter - half);
  north = Math.min(north, latCenter + half);
  west  = Math.max(west,  lonCenter - half);
  east  = Math.min(east,  lonCenter + half);

  // Check which tiles are already cached
  const tiles = tilesForBbox(south, west, north, east);
  const cachedResults: TrailPreview[] = [];
  let allCached = true;
  for (const t of tiles) {
    const cached = await cacheGet<TrailPreview[]>(tileKey(t.s, t.w, "preview"));
    if (cached) {
      cachedResults.push(...cached);
    } else {
      allCached = false;
    }
  }
  if (allCached) {
    const seen = new Set<string>();
    return cachedResults.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  }

  // Fetch entire viewport in ONE query (avoids rate limiting)
  const bbox = `${south},${west},${north},${east}`;
  const query = `
[out:json][timeout:12][maxsize:48000000];
(
  way["highway"="path"]["name"]["access"!="private"](${bbox});
  way["highway"="path"]["sac_scale"]["access"!="private"](${bbox});
  way["highway"~"^(track|bridleway)$"]["sac_scale"]["access"!="private"](${bbox});
  way["highway"="track"]["tracktype"~"^(grade3|grade4|grade5)$"]["access"!="private"](${bbox});
);
out center qt 200;
`.trim();
  try {
    const json = await overpassFetch(query);
    const previews: TrailPreview[] = (json.elements as any[])
      .filter((el) => el.center)
      .map((el) => {
        const tags: Record<string, string> = el.tags ?? {};
        const difficulty = difficultyFromTags(tags);
        return {
          id: `prev_${el.id}`, name: tags.name ?? "", difficulty,
          color: DIFFICULTY_COLORS[difficulty],
          latitude: el.center.lat, longitude: el.center.lon,
        };
      })
      .filter((t) => isRealTrail(t.name));

    // Distribute into tile cache for future reuse
    for (const t of tiles) {
      const tilePreviews = previews.filter(
        (p) => p.latitude >= t.s && p.latitude < t.n && p.longitude >= t.w && p.longitude < t.e
      );
      await cacheSet(tileKey(t.s, t.w, "preview"), tilePreviews, PREVIEW_TTL);
    }
    return previews;
  } catch {
    return cachedResults; // return whatever was cached
  }
}

/**
 * Fetch full trail polylines within a bounding box.
 * Only call when latitudeDelta < TRAILS_ZOOM_THRESHOLD.
 * Results cached per 1°×1° tile for 7 days — no re-fetch unless tile expires.
 */
async function _fetchTrailTile(
  s: number, w: number, n: number, e: number,
): Promise<Trail[]> {
  const key = tileKey(s, w, "trail");
  if (inFlight.has(key)) return [];

  // L1/L2 cache check
  const cached = await cacheGet<Trail[]>(key);
  if (cached) return cached;

  inFlight.add(key);
  try {
    const bbox = `${s},${w},${n},${e}`;
    const query = `
[out:json][timeout:20][maxsize:128000000];
(
  way["highway"="path"]["name"]["footway"!="sidewalk"]["footway"!="crossing"]["access"!="private"](${bbox});
  way["highway"="footway"]["name"]["footway"!="sidewalk"]["footway"!="crossing"]["access"!="private"](${bbox});
  way["highway"="path"]["sac_scale"]["access"!="private"](${bbox});
  way["highway"~"^(track|bridleway)$"]["name"]["access"!="private"](${bbox});
  way["highway"="track"]["tracktype"~"^(grade3|grade4|grade5)$"]["access"!="private"](${bbox});
);
out geom qt 80;
`.trim();
    const json = await overpassFetch(query);
    const trails: Trail[] = (json.elements as any[])
      .filter((el) => el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2)
      .map((el) => {
        const tags: Record<string, string> = el.tags ?? {};
        const difficulty = difficultyFromTags(tags);
        const coordinates = (el.geometry as any[]).map((pt) => ({
          latitude: pt.lat, longitude: pt.lon,
        }));
        return {
          id: String(el.id), name: tags.name ?? "", difficulty,
          surface: surfaceLabel(tags),
          dogFriendly: tags.dog === "yes" ? true : tags.dog === "no" ? false : null,
          fee: tags.fee === "yes" ? true : tags.fee === "no" ? false : null,
          access: tags.access ?? null,
          coordinates,
          color: DIFFICULTY_COLORS[difficulty],
          distanceMiles: computeDistanceMiles(coordinates, tags),
        };
      })
      .filter((t) => isRealTrail(t.name));
    await cacheSet(key, trails, TRAIL_TTL);
    return trails;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Fetch named hiking/walking trails within a bounding box.
 * Only call when latitudeDelta < TRAILS_ZOOM_THRESHOLD for performance.
 */
export async function fetchTrails(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<Trail[]> {
  // Cap bbox to 2° max before splitting into tiles
  const MAX_TRAIL_DEG = 2.0;
  const midLat = (south + north) / 2;
  const midLon = (west + east) / 2;
  south = Math.max(south, midLat - MAX_TRAIL_DEG / 2);
  north = Math.min(north, midLat + MAX_TRAIL_DEG / 2);
  west  = Math.max(west,  midLon - MAX_TRAIL_DEG / 2);
  east  = Math.min(east,  midLon + MAX_TRAIL_DEG / 2);

  const tiles = tilesForBbox(south, west, north, east);
  const results = await Promise.all(tiles.map((t) => _fetchTrailTile(t.s, t.w, t.n, t.e)));

  // Deduplicate trails that span tile boundaries
  const seen = new Set<string>();
  return results.flat().filter((trail) => {
    if (seen.has(trail.id)) return false;
    seen.add(trail.id);
    return true;
  });
}

// ─── Single trail detail (on-tap enrichment) ─────────────────────────────────

export interface TrailDetail {
  id: string;
  name: string;
  difficulty: TrailDifficulty;
  surface: string;
  dogFriendly: boolean | null;
  fee: boolean | null;
  access: string | null;
  color: string;
  distanceMiles: number | null;
  description: string | null;
  website: string | null;
  operator: string | null;
  wheelchair: boolean | null;
  lit: boolean | null;
  incline: string | null;
  mtbScale: string | null;
  openingHours: string | null;
  coordinates: Array<{ latitude: number; longitude: number }>;
}

const _detailCache = new Map<string, TrailDetail>();

/**
 * Fetch full detail for a single trail way by its OSM ID.
 * Used when user taps a preview pin — returns all available OSM tags + geometry.
 */
export async function fetchTrailDetail(previewId: string): Promise<TrailDetail | null> {
  // Strip "prev_" prefix to get the raw OSM way ID
  const wayId = previewId.replace(/^prev_/, "");

  if (_detailCache.has(wayId)) return _detailCache.get(wayId)!;

  try {
    const query = `
[out:json][timeout:10][maxsize:8000000];
way(${wayId});
out geom;
`.trim();
    const json = await overpassFetch(query);
    const el = json.elements?.[0];
    if (!el || !el.tags) return null;

    const tags: Record<string, string> = el.tags;
    const difficulty = difficultyFromTags(tags);
    const coordinates = Array.isArray(el.geometry)
      ? (el.geometry as any[]).map((pt: any) => ({ latitude: pt.lat, longitude: pt.lon }))
      : [];

    const detail: TrailDetail = {
      id: wayId,
      name: tags.name ?? "Unnamed Trail",
      difficulty,
      surface: surfaceLabel(tags),
      dogFriendly: tags.dog === "yes" ? true : tags.dog === "no" ? false : null,
      fee: tags.fee === "yes" ? true : tags.fee === "no" ? false : null,
      access: tags.access ?? null,
      color: DIFFICULTY_COLORS[difficulty],
      distanceMiles: computeDistanceMiles(coordinates, tags),
      description: tags.description ?? tags.note ?? null,
      website: tags.website ?? tags["contact:website"] ?? tags.url ?? null,
      operator: tags.operator ?? null,
      wheelchair: tags.wheelchair === "yes" ? true : tags.wheelchair === "no" ? false : null,
      lit: tags.lit === "yes" ? true : tags.lit === "no" ? false : null,
      incline: tags.incline ?? null,
      mtbScale: tags["mtb:scale"] ?? null,
      openingHours: tags.opening_hours ?? null,
      coordinates,
    };
    _detailCache.set(wayId, detail);
    return detail;
  } catch {
    return null;
  }
}
