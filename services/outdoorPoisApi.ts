// Overpass API — Outdoor points of interest (viewpoints, waterfalls, peaks, etc.)

import { overpassFetch } from "./overpassClient";
import { cacheGet, cacheSet, tilesForBbox } from "./spatialCache";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PoiCategory = "viewpoint" | "waterfall" | "peak" | "picnic" | "spring";

export interface OutdoorPoi {
  id: string;
  name: string;
  category: PoiCategory;
  elevation: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const POI_ZOOM_THRESHOLD = 0.8;

export const POI_COLORS: Record<PoiCategory, string> = {
  viewpoint: "#8b5cf6",
  waterfall: "#06b6d4",
  peak: "#ef4444",
  picnic: "#22c55e",
  spring: "#3b82f6",
};

export const POI_LABELS: Record<PoiCategory, string> = {
  viewpoint: "Scenic Viewpoint",
  waterfall: "Waterfall",
  peak: "Summit",
  picnic: "Picnic Area",
  spring: "Water Source",
};

// ─── Cache ────────────────────────────────────────────────────────────────────

const POI_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_POI_BBOX_DEG = 1.5;
const inFlight = new Set<string>();

function tileKey(s: number, w: number): string {
  return `poi2_${s.toFixed(0)}_${w.toFixed(0)}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyPoi(tags: Record<string, string>): PoiCategory | null {
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.natural === "waterfall" || tags.waterway === "waterfall") return "waterfall";
  if (tags.natural === "peak" || tags.natural === "volcano") return "peak";
  if (tags.tourism === "picnic_site") return "picnic";
  if (
    tags.natural === "spring" ||
    tags.amenity === "drinking_water" ||
    (tags.man_made === "water_well" && tags.drinking_water === "yes")
  )
    return "spring";
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchOutdoorPois(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<OutdoorPoi[]> {
  // Cap viewport
  const latCenter = (south + north) / 2;
  const lonCenter = (west + east) / 2;
  const half = MAX_POI_BBOX_DEG / 2;
  south = Math.max(south, latCenter - half);
  north = Math.min(north, latCenter + half);
  west = Math.max(west, lonCenter - half);
  east = Math.min(east, lonCenter + half);

  // Check tile cache
  const tiles = tilesForBbox(south, west, north, east);
  const cachedResults: OutdoorPoi[] = [];
  let allCached = true;
  for (const t of tiles) {
    const cached = await cacheGet<OutdoorPoi[]>(tileKey(t.s, t.w));
    if (cached) {
      cachedResults.push(...cached);
    } else {
      allCached = false;
    }
  }
  if (allCached) {
    const seen = new Set<string>();
    return cachedResults.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }

  const bbox = `${south},${west},${north},${east}`;
  const query = `
[out:json][timeout:12][maxsize:48000000];
(
  node["tourism"="viewpoint"](${bbox});
  node["natural"="waterfall"](${bbox});
  way["natural"="waterfall"](${bbox});
  node["waterway"="waterfall"](${bbox});
  way["waterway"="waterfall"](${bbox});
  node["natural"="peak"]["name"](${bbox});
  node["natural"="volcano"]["name"](${bbox});
  node["tourism"="picnic_site"](${bbox});
  node["natural"="spring"](${bbox});
  node["amenity"="drinking_water"](${bbox});
);
out center qt 120;
`.trim();

  const flightKey = `${south.toFixed(1)}_${west.toFixed(1)}`;
  if (inFlight.has(flightKey)) return cachedResults;
  inFlight.add(flightKey);

  try {
    const json = await overpassFetch(query);
    const pois: OutdoorPoi[] = (json.elements as any[])
      .map((el) => {
        const tags: Record<string, string> = el.tags ?? {};
        const lat = el.type === "node" ? el.lat : el.center?.lat;
        const lon = el.type === "node" ? el.lon : el.center?.lon;
        if (!lat || !lon) return null;

        const category = classifyPoi(tags);
        if (!category) return null;

        const name = tags.name ?? POI_LABELS[category];
        return {
          id: `poi_${el.id}`,
          name,
          category,
          elevation: tags.ele ?? null,
          description: tags.description ?? tags.note ?? null,
          latitude: lat,
          longitude: lon,
          color: POI_COLORS[category],
        };
      })
      .filter(Boolean) as OutdoorPoi[];

    // Distribute into tile cache
    for (const t of tiles) {
      const tilePois = pois.filter(
        (p) => p.latitude >= t.s && p.latitude < t.n && p.longitude >= t.w && p.longitude < t.e,
      );
      await cacheSet(tileKey(t.s, t.w), tilePois, POI_TTL);
    }
    return pois;
  } catch {
    return cachedResults;
  } finally {
    inFlight.delete(flightKey);
  }
}
