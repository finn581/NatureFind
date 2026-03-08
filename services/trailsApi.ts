// Overpass API — Direct OSM trail queries via Private.coffee (no rate limits, free)

const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";

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

// Polyline detail only loads below this latitudeDelta
export const TRAILS_ZOOM_THRESHOLD = 0.8;
// Preview pins load below this latitudeDelta — set very high so pins show at any practical zoom
export const TRAILS_PREVIEW_MAX_ZOOM = 50;
// Maximum bounding box size sent to Overpass — prevents huge/slow queries
const MAX_PREVIEW_BBOX_DEG = 5;

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

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry { trails: Trail[]; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function cacheKey(s: number, w: number, n: number, e: number): string {
  return `${s.toFixed(3)},${w.toFixed(3)},${n.toFixed(3)},${e.toFixed(3)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
 * Lightweight preview query — returns only center point of each trail.
 * Fast enough to run at wider zoom levels so users can see where trails exist
 * before zooming in for full polyline geometry.
 * Show at latDelta < 5 (regional zoom).
 */
export async function fetchTrailPreviews(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<TrailPreview[]> {
  // Cap bbox so wide-zoom viewports don't send huge queries to Overpass
  const latCenter = (south + north) / 2;
  const lonCenter = (west + east) / 2;
  const half = MAX_PREVIEW_BBOX_DEG / 2;
  south  = Math.max(south,  latCenter - half);
  north  = Math.min(north,  latCenter + half);
  west   = Math.max(west,   lonCenter - half);
  east   = Math.min(east,   lonCenter + half);

  const key = `preview_${cacheKey(south, west, north, east)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.trails as unknown as TrailPreview[];

  const bbox = `${south},${west},${north},${east}`;
  // Only natural footpaths — exclude sidewalks, crossings, and farm/service tracks.
  // Require a name AND at least one of: sac_scale, trail_difficulty, or path-type highway.
  const query = `
[out:json][timeout:15][maxsize:4000000];
(
  way["highway"="path"]["name"]["footway"!="sidewalk"]["footway"!="crossing"]["access"!="private"](${bbox});
  way["highway"="path"]["sac_scale"]["access"!="private"](${bbox});
  way["highway"~"^(track|bridleway)$"]["sac_scale"]["access"!="private"](${bbox});
);
out center qt 80;
`.trim();

  const res = await fetch(OVERPASS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);

  const json = await res.json();
  const previews: TrailPreview[] = (json.elements as any[])
    .filter((el) => el.center)
    .map((el) => {
      const tags: Record<string, string> = el.tags ?? {};
      const difficulty = difficultyFromTags(tags);
      return {
        id: `prev_${el.id}`,
        name: tags.name ?? "",
        difficulty,
        color: DIFFICULTY_COLORS[difficulty],
        latitude: el.center.lat,
        longitude: el.center.lon,
      };
    })
    .filter((t) => isRealTrail(t.name));

  cache.set(key, { trails: previews as any, ts: Date.now() });
  return previews;
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
  const key = cacheKey(south, west, north, east);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.trails;

  const bbox = `${south},${west},${north},${east}`;

  // Only natural footpaths with known difficulty — excludes sidewalks, farm tracks,
  // private access roads, and any way that isn't explicitly a hiking/nature trail.
  const query = `
[out:json][timeout:20][maxsize:16000000];
(
  way["highway"="path"]["name"]["footway"!="sidewalk"]["footway"!="crossing"]["access"!="private"](${bbox});
  way["highway"="path"]["sac_scale"]["access"!="private"](${bbox});
  way["highway"~"^(track|bridleway)$"]["sac_scale"]["access"!="private"](${bbox});
);
out geom qt 80;
`.trim();

  const res = await fetch(OVERPASS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);

  const json = await res.json();

  const trails: Trail[] = (json.elements as any[])
    .filter((el) => el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2)
    .map((el) => {
      const tags: Record<string, string> = el.tags ?? {};
      const difficulty = difficultyFromTags(tags);
      return {
        id: String(el.id),
        name: tags.name ?? "",
        difficulty,
        surface: surfaceLabel(tags),
        dogFriendly: tags.dog === "yes" ? true : tags.dog === "no" ? false : null,
        fee: tags.fee === "yes" ? true : tags.fee === "no" ? false : null,
        access: tags.access ?? null,
        coordinates: (el.geometry as any[]).map((pt) => ({
          latitude: pt.lat,
          longitude: pt.lon,
        })),
        color: DIFFICULTY_COLORS[difficulty],
      };
    })
    .filter((t) => isRealTrail(t.name));

  cache.set(key, { trails, ts: Date.now() });
  return trails;
}
