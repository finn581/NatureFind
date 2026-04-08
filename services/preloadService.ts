/**
 * Pre-loads static map data at app startup so pins appear instantly
 * when the map tab mounts.
 *
 * Parks are fetched from the NPS API (or AsyncStorage cache) and stored
 * in a module-level variable. The map tab reads this synchronously on mount
 * via getPreloadedParks() — no loading spinner needed.
 */

import { fetchParks, type Park } from "./npsApi";
import { fetchSAParks, setSAParksCache } from "./wdpaApi";
import { FALLBACK_SA_PARKS } from "@/constants/SouthAmericaParks";

export const OUTDOOR_DESIGNATIONS = new Set([
  "National Park",
  "National Forest",
  "National Recreation Area",
  "National Seashore",
  "National Lakeshore",
  "National Preserve",
  "National Reserve",
  "National River",
  "National Scenic Trail",
  "National Wildlife Refuge",
  "National Grassland",
  "National Wilderness Area",
  "Wild and Scenic River",
]);

let _parks: Park[] | null = null;
let _promise: Promise<void> | null = null;

/** Returns preloaded parks synchronously, or null if not yet ready. */
export function getPreloadedParks(): Park[] | null {
  return _parks;
}

/**
 * Fire-and-forget: kicks off park data fetch.
 * Safe to call multiple times — deduplicates internally.
 * Called from _layout.tsx as early as possible.
 */
export function preloadParks(): void {
  if (_promise) return;
  _promise = (async () => {
    try {
      const PAGE = 500;
      const first = await fetchParks({ limit: PAGE, start: 0 });
      let all = first.data;
      const total = parseInt(first.total, 10);
      if (total > PAGE) {
        const second = await fetchParks({ limit: PAGE, start: PAGE });
        all = [...all, ...second.data];
      }
      _parks = all.filter(
        (p) => p.latitude && p.longitude && OUTDOOR_DESIGNATIONS.has(p.designation),
      );
    } catch {
      // Non-fatal — map tab will retry via its own loadParks()
    }
  })();
}

let _saPromise: Promise<void> | null = null;

export function preloadSAParks(): void {
  if (_saPromise) return;
  _saPromise = (async () => {
    try {
      const parks = await fetchSAParks();
      if (parks.length > 0) {
        setSAParksCache(parks);
      } else {
        setSAParksCache(FALLBACK_SA_PARKS);
      }
    } catch {
      setSAParksCache(FALLBACK_SA_PARKS);
    }
  })();
}
