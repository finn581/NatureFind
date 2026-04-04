/**
 * Persistent spatial tile cache backed by AsyncStorage.
 *
 * Trails and campgrounds are essentially static — they don't move for months.
 * Instead of re-fetching from Overpass on every pan/restart, we:
 *  1. Snap bounding boxes to a fixed 1° tile grid → same area = same cache key
 *  2. Store results in AsyncStorage → survives app restarts
 *  3. Use long TTLs (days, not minutes)
 *
 * L1: in-memory Map  — instant, same session
 * L2: AsyncStorage   — persists across restarts, expires after TTL
 * L3: Overpass API   — only when tile genuinely not cached
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Tile grid ────────────────────────────────────────────────────────────────

const TILE_DEG = 1.0; // 1° × 1° tiles (~70 miles at mid-latitudes)

/** Snap a coordinate down to the nearest tile boundary. */
function snapToTile(v: number): number {
  return Math.floor(v / TILE_DEG) * TILE_DEG;
}

/**
 * Return all tile south-west corners that overlap the given bounding box.
 * A viewport spanning 2° lon × 2° lat = up to 4 tiles.
 */
export function tilesForBbox(
  south: number,
  west: number,
  north: number,
  east: number,
): Array<{ s: number; w: number; n: number; e: number }> {
  const tiles: Array<{ s: number; w: number; n: number; e: number }> = [];
  for (let lat = snapToTile(south); lat < north; lat += TILE_DEG) {
    for (let lon = snapToTile(west); lon < east; lon += TILE_DEG) {
      tiles.push({
        s: lat,
        w: lon,
        n: lat + TILE_DEG,
        e: lon + TILE_DEG,
      });
    }
  }
  return tiles;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

interface StoredEntry<T> {
  data: T;
  expiresAt: number; // unix ms
}

const PREFIX = "nf_spatial_";

// L1 in-memory cache — avoids AsyncStorage reads within the same session
const memCache = new Map<string, { data: unknown; expiresAt: number }>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  const now = Date.now();

  // L1
  const mem = memCache.get(key);
  if (mem) {
    if (mem.expiresAt > now) return mem.data as T;
    memCache.delete(key);
  }

  // L2
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: StoredEntry<T> = JSON.parse(raw);
    if (entry.expiresAt > now) {
      memCache.set(key, { data: entry.data, expiresAt: entry.expiresAt });
      return entry.data;
    }
    // Expired — clean up async, don't block
    AsyncStorage.removeItem(PREFIX + key).catch(() => {});
  } catch {
    // Storage read failure → treat as cache miss
  }
  return null;
}

export async function cacheSet<T>(key: string, data: T, ttlMs: number): Promise<void> {
  // Never persist empty results — likely a transient API failure.
  // Store in L1 with a short TTL so we retry soon instead of blocking for days.
  const isEmpty = Array.isArray(data) && data.length === 0;
  if (isEmpty) {
    memCache.set(key, { data, expiresAt: Date.now() + 60_000 }); // retry after 1 min
    return;
  }
  const expiresAt = Date.now() + ttlMs;
  memCache.set(key, { data, expiresAt });
  try {
    const entry: StoredEntry<T> = { data, expiresAt };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage write failure is non-fatal — L1 still works for this session
  }
}

/** Remove all NatureFind spatial cache entries from AsyncStorage. */
export async function clearSpatialCache(): Promise<void> {
  memCache.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ourKeys = keys.filter((k) => k.startsWith(PREFIX));
    if (ourKeys.length > 0) await AsyncStorage.multiRemove(ourKeys);
  } catch {}
}
