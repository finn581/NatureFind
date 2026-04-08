// services/offlineMapsService.ts
import MapboxGL from "@rnmapbox/maps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OFFLINE_REGIONS, type OfflineRegionDef } from "@/constants/OfflineRegions";

const STORAGE_KEY = "nf_offline_regions_v1";

export interface OfflineRegionStatus {
  id: string;
  state: "idle" | "downloading" | "complete" | "error";
  progress: number;
  sizeBytes: number;
}

type ProgressCallback = (id: string, progress: number) => void;

let _statuses: Record<string, OfflineRegionStatus> = {};
let _listeners: Set<() => void> = new Set();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function subscribeOfflineStatus(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getOfflineStatuses(): Record<string, OfflineRegionStatus> {
  return { ..._statuses };
}

export async function loadSavedStatuses(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, OfflineRegionStatus>;
      for (const [id, status] of Object.entries(saved)) {
        if (status.state === "complete") {
          _statuses[id] = status;
        }
      }
    }
  } catch {}
}

async function saveStatuses(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_statuses));
  } catch {}
}

export async function downloadRegion(
  regionDef: OfflineRegionDef,
  onProgress?: ProgressCallback,
): Promise<void> {
  const { id, bounds, minZoom, maxZoom } = regionDef;

  _statuses[id] = { id, state: "downloading", progress: 0, sizeBytes: 0 };
  notify();

  try {
    await MapboxGL.offlineManager.createPack(
      {
        name: id,
        styleURL: "mapbox://styles/mapbox/outdoors-v12",
        bounds: [bounds.sw, bounds.ne],
        minZoom,
        maxZoom,
      },
      (region: any, status: any) => {
        const pct = status.percentage ?? 0;
        _statuses[id] = {
          id,
          state: pct >= 100 ? "complete" : "downloading",
          progress: Math.round(pct),
          sizeBytes: status.completedTileSize ?? 0,
        };
        notify();
        onProgress?.(id, Math.round(pct));
        if (pct >= 100) saveStatuses();
      },
      (region: any, error: any) => {
        _statuses[id] = { id, state: "error", progress: 0, sizeBytes: 0 };
        notify();
      },
    );
  } catch {
    _statuses[id] = { id, state: "error", progress: 0, sizeBytes: 0 };
    notify();
  }
}

export async function deleteRegion(regionId: string): Promise<void> {
  try {
    await MapboxGL.offlineManager.deletePack(regionId);
  } catch {}
  delete _statuses[regionId];
  notify();
  await saveStatuses();
}

export function getRegionDef(regionId: string): OfflineRegionDef | undefined {
  return OFFLINE_REGIONS.find((r) => r.id === regionId);
}
