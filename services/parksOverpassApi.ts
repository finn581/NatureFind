// Overpass API — OSM state/county/regional park queries

import { overpassFetch } from "./overpassClient";
import { cacheGet, cacheSet, tilesForBbox } from "./spatialCache";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OsmParkType = "state" | "county" | "regional" | "nature_reserve" | "other";

export interface OsmPark {
  id: string;
  name: string;
  parkType: OsmParkType;
  operator: string | null;
  website: string | null;
  latitude: number;
  longitude: number;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const OSM_PARKS_ZOOM_THRESHOLD = 4.0;

const OSM_PARK_COLORS: Record<OsmParkType, string> = {
  state: "#059669",
  county: "#6366f1",
  regional: "#0284c7",
  nature_reserve: "#047857",
  other: "#6b7280",
};

const MAX_OSM_PARKS_BBOX_DEG = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyParkType(name: string, tags: Record<string, string>): OsmParkType {
  if (/state\s+(park|forest|recreation|reserve|beach)/i.test(name)) return "state";
  if (/county\s+(park|open\s*space)/i.test(name)) return "county";
  if (/(regional|district|open\s*space|preserve)/i.test(name)) return "regional";
  if (tags.leisure === "nature_reserve" || tags.boundary === "protected_area") return "nature_reserve";
  return "other";
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const OSM_PARKS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const inFlight = new Set<string>();

function tileKey(s: number, w: number): string {
  return `osmpark2_${s.toFixed(0)}_${w.toFixed(0)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchOsmParks(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<OsmPark[]> {
  // Cap viewport
  const latCenter = (south + north) / 2;
  const lonCenter = (west + east) / 2;
  const half = MAX_OSM_PARKS_BBOX_DEG / 2;
  south = Math.max(south, latCenter - half);
  north = Math.min(north, latCenter + half);
  west = Math.max(west, lonCenter - half);
  east = Math.min(east, lonCenter + half);

  // Check which tiles are already cached
  const tiles = tilesForBbox(south, west, north, east);
  const cachedResults: OsmPark[] = [];
  let allCached = true;
  for (const t of tiles) {
    const cached = await cacheGet<OsmPark[]>(tileKey(t.s, t.w));
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

  // Fetch entire viewport in ONE query
  const bbox = `${south},${west},${north},${east}`;
  const query = `
[out:json][timeout:12][maxsize:48000000];
(
  way["leisure"="nature_reserve"]["name"](${bbox});
  relation["leisure"="nature_reserve"]["name"](${bbox});
  way["leisure"="park"]["name"](${bbox});
  relation["leisure"="park"]["name"](${bbox});
  way["boundary"="protected_area"]["name"]["protect_class"~"^[2-5]$"](${bbox});
  way["boundary"="national_park"]["name"](${bbox});
  relation["boundary"="national_park"]["name"](${bbox});
);
out center qt 150;
`.trim();

  // Deduplicate in-flight
  const flightKey = `${south.toFixed(1)}_${west.toFixed(1)}`;
  if (inFlight.has(flightKey)) return cachedResults;
  inFlight.add(flightKey);

  try {
    const json = await overpassFetch(query);
    const parks: OsmPark[] = (json.elements as any[])
      .map((el) => {
        const tags: Record<string, string> = el.tags ?? {};
        const lat = el.type === "node" ? el.lat : el.center?.lat;
        const lon = el.type === "node" ? el.lon : el.center?.lon;
        if (!lat || !lon) return null;
        const name = tags.name ?? "";
        if (!name) return null;
        const parkType = classifyParkType(name, tags);
        return {
          id: `osm_${el.id}`,
          name,
          parkType,
          operator: tags.operator ?? null,
          website: tags.website ?? tags["contact:website"] ?? null,
          latitude: lat,
          longitude: lon,
          color: OSM_PARK_COLORS[parkType],
        };
      })
      .filter(Boolean) as OsmPark[];

    // Distribute into tile cache
    for (const t of tiles) {
      const tileParks = parks.filter(
        (p) => p.latitude >= t.s && p.latitude < t.n && p.longitude >= t.w && p.longitude < t.e,
      );
      await cacheSet(tileKey(t.s, t.w), tileParks, OSM_PARKS_TTL);
    }
    return parks;
  } catch {
    return cachedResults;
  } finally {
    inFlight.delete(flightKey);
  }
}
