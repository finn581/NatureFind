# NatureFind South America Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NatureFind's map seamlessly global — users pan to South America and parks, trails, and offline maps load automatically, gated behind the existing subscription.

**Architecture:** Region detection via bounding box check on map center coordinates. SA parks from WDPA Protected Planet API + curated static JSON fallback. Trails via existing Overpass API with expanded tags. Offline maps via Mapbox offline tile packs. Premium gating uses existing `gateFeature()` from SubscriptionContext. No new subscription tiers.

**Tech Stack:** React Native (Expo SDK 54), @rnmapbox/maps, Overpass API, WDPA Protected Planet API, Mapbox Offline Tiles, AsyncStorage caching, TypeScript

---

## File Map

### New Files
- `constants/Regions.ts` — region bounding boxes, SA country codes, metric/imperial config
- `constants/SouthAmericaParks.ts` — curated static JSON of top SA parks with descriptions and photos
- `constants/OfflineRegions.ts` — downloadable offline region definitions (bounds, names, sizes)
- `services/wdpaApi.ts` — WDPA Protected Planet API client
- `services/regionDetection.ts` — detect region from coordinates, unit selection
- `services/offlineMapsService.ts` — Mapbox offline region download/management
- `components/DestinationCard.tsx` — individual destination card
- `components/DestinationsSection.tsx` — horizontal scroll destinations carousel
- `components/OfflineMapsManager.tsx` — Settings tab UI for offline map downloads

### Modified Files
- `services/preloadService.ts` — add SA park preloading alongside NPS
- `services/trailsApi.ts` — add `highway=track` + `tracktype` tags for SA trail coverage
- `app/(tabs)/index.tsx` — region-aware data loading, SA parks, destinations section, unit switching
- `components/LayerPanel.tsx` — no changes (layers work globally)
- `app/(tabs)/settings.tsx` — add Offline Maps section, unit preference

---

### Task 1: Region Detection

**Files:**
- Create: `constants/Regions.ts`
- Create: `services/regionDetection.ts`

- [ ] **Step 1: Create constants/Regions.ts**

```typescript
// constants/Regions.ts

export interface RegionBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export type AppRegion = "us" | "sa" | "other";

export const US_BOUNDS: RegionBounds = {
  minLat: 24,
  maxLat: 50,
  minLng: -125,
  maxLng: -66,
};

export const SA_BOUNDS: RegionBounds = {
  minLat: -56,
  maxLat: 13,
  minLng: -82,
  maxLng: -34,
};

export const SA_COUNTRIES = [
  { code: "CL", iso3: "CHL", name: "Chile", flag: "🇨🇱" },
  { code: "AR", iso3: "ARG", name: "Argentina", flag: "🇦🇷" },
  { code: "PE", iso3: "PER", name: "Peru", flag: "🇵🇪" },
  { code: "CO", iso3: "COL", name: "Colombia", flag: "🇨🇴" },
  { code: "EC", iso3: "ECU", name: "Ecuador", flag: "🇪🇨" },
  { code: "BR", iso3: "BRA", name: "Brazil", flag: "🇧🇷" },
] as const;

export type SACountryISO3 = (typeof SA_COUNTRIES)[number]["iso3"];

export const SA_CENTER = {
  latitude: -15.0,
  longitude: -60.0,
  latitudeDelta: 50,
  longitudeDelta: 40,
};
```

- [ ] **Step 2: Create services/regionDetection.ts**

```typescript
// services/regionDetection.ts
import { US_BOUNDS, SA_BOUNDS, type AppRegion, type RegionBounds } from "@/constants/Regions";

function inBounds(lat: number, lng: number, bounds: RegionBounds): boolean {
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

export function detectRegion(lat: number, lng: number): AppRegion {
  if (inBounds(lat, lng, SA_BOUNDS)) return "sa";
  if (inBounds(lat, lng, US_BOUNDS)) return "us";
  return "other";
}

export function isMetricRegion(region: AppRegion): boolean {
  return region === "sa" || region === "other";
}

export function formatDistance(meters: number, region: AppRegion): string {
  if (isMetricRegion(region)) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }
  const miles = meters * 0.000621371;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles.toFixed(1)} mi`;
}

export function formatElevation(meters: number, region: AppRegion): string {
  if (isMetricRegion(region)) return `${Math.round(meters)} m`;
  return `${Math.round(meters * 3.28084)} ft`;
}
```

- [ ] **Step 3: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to new files (existing errors may be present)

- [ ] **Step 4: Commit**

```bash
git add constants/Regions.ts services/regionDetection.ts
git commit -m "feat: region detection service and SA constants"
```

---

### Task 2: WDPA API Client

**Files:**
- Create: `services/wdpaApi.ts`

- [ ] **Step 1: Create services/wdpaApi.ts**

```typescript
// services/wdpaApi.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SA_COUNTRIES, type SACountryISO3 } from "@/constants/Regions";

const BASE_URL = "https://api.protectedplanet.net/v3";
const API_KEY = process.env.EXPO_PUBLIC_WDPA_API_KEY ?? "";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface WDPAPark {
  id: number;
  wdpa_id: number;
  name: string;
  original_name: string;
  designation: { name: string };
  iucn_category: { name: string };
  reported_area: number; // km2
  country: { iso_3: string; name: string };
  geolocation: { latitude: number; longitude: number };
  legal_status: string;
  management_authority: string;
  link: string;
}

export interface SAPark {
  id: string;
  name: string;
  designation: string;
  iucnCategory: string;
  areaKm2: number;
  country: string;
  countryISO3: string;
  latitude: number;
  longitude: number;
  managementAuthority: string;
  link: string;
}

interface WDPAResponse {
  protected_areas: WDPAPark[];
}

function toSAPark(w: WDPAPark): SAPark {
  return {
    id: `wdpa_${w.wdpa_id}`,
    name: w.original_name || w.name,
    designation: w.designation?.name ?? "Protected Area",
    iucnCategory: w.iucn_category?.name ?? "",
    areaKm2: w.reported_area ?? 0,
    country: w.country?.name ?? "",
    countryISO3: w.country?.iso_3 ?? "",
    latitude: w.geolocation?.latitude ?? 0,
    longitude: w.geolocation?.longitude ?? 0,
    managementAuthority: w.management_authority ?? "",
    link: w.link ?? "",
  };
}

async function fetchCountryParks(iso3: string, page: number = 1): Promise<WDPAPark[]> {
  const url = `${BASE_URL}/protected_areas?token=${API_KEY}&country=${iso3}&per_page=50&page=${page}&with_geometry=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WDPA ${res.status}`);
  const data: WDPAResponse = await res.json();
  return data.protected_areas ?? [];
}

export async function fetchSAParks(): Promise<SAPark[]> {
  const cacheKey = "nf_sa_parks_v1";
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch {}

  const all: SAPark[] = [];
  for (const country of SA_COUNTRIES) {
    try {
      const page1 = await fetchCountryParks(country.iso3);
      const parks = page1
        .filter((p) => p.geolocation?.latitude && p.geolocation?.longitude)
        .filter((p) => p.reported_area > 10) // skip tiny reserves
        .map(toSAPark);
      all.push(...parks);
    } catch {
      // Skip failed country, continue with others
    }
  }

  if (all.length > 0) {
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: all, ts: Date.now() }));
    } catch {}
  }

  return all;
}

// In-memory cache for quick access after first load
let _saParks: SAPark[] | null = null;

export function getPreloadedSAParks(): SAPark[] | null {
  return _saParks;
}

export function setSAParksCache(parks: SAPark[]): void {
  _saParks = parks;
}
```

- [ ] **Step 2: Add WDPA API key to .env**

Add to `.env`:
```
EXPO_PUBLIC_WDPA_API_KEY=your_wdpa_api_key_here
```

Register for free API key at https://api.protectedplanet.net/

- [ ] **Step 3: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 4: Commit**

```bash
git add services/wdpaApi.ts
git commit -m "feat: WDPA Protected Planet API client for SA parks"
```

---

### Task 3: Curated SA Parks Data

**Files:**
- Create: `constants/SouthAmericaParks.ts`

- [ ] **Step 1: Create constants/SouthAmericaParks.ts**

This is the static fallback with curated descriptions and photos for the top SA parks. The full file will have ~50-80 entries across 6 countries. Here is the structure with the first entries per country:

```typescript
// constants/SouthAmericaParks.ts
import type { SAPark } from "@/services/wdpaApi";

export interface CuratedParkData {
  description: string;
  photoUrl: string;
  highlights: string[];
}

export const CURATED_SA_PARKS: Record<string, CuratedParkData> = {
  // Chile
  "Torres del Paine": {
    description: "Iconic Patagonian park with granite towers, glaciers, lakes, and world-class trekking including the W Trek and O Circuit.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Cuernos_del_Paine_from_Lake_Peho%C3%A9.jpg/1280px-Cuernos_del_Paine_from_Lake_Peho%C3%A9.jpg",
    highlights: ["W Trek", "Grey Glacier", "Base de las Torres"],
  },
  "Lauca": {
    description: "High-altitude altiplano park near Bolivia with Lake Chungara, vicuna herds, and snow-capped volcanoes Parinacota and Pomerape.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Parinacota_volcano.jpg/1280px-Parinacota_volcano.jpg",
    highlights: ["Lake Chungara", "Parinacota Volcano", "Vicuna herds"],
  },
  "Vicente Perez Rosales": {
    description: "Chile's oldest national park in the Lake District, featuring Osorno Volcano, Petrohue Falls, and Todos los Santos Lake.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Volc%C3%A1n_Osorno.jpg/1280px-Volc%C3%A1n_Osorno.jpg",
    highlights: ["Osorno Volcano", "Petrohue Falls", "Lake crossing"],
  },

  // Argentina
  "Los Glaciares": {
    description: "UNESCO World Heritage site home to Perito Moreno Glacier, Mount Fitz Roy, and Cerro Torre. Gateway to world-class mountaineering and ice trekking.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Perito_Moreno_Glacier_Patagonia_Argentina_Luca_Galuzzi_2005.JPG/1280px-Perito_Moreno_Glacier_Patagonia_Argentina_Luca_Galuzzi_2005.JPG",
    highlights: ["Perito Moreno Glacier", "Fitz Roy Trek", "Cerro Torre"],
  },
  "Nahuel Huapi": {
    description: "Argentina's first national park in the Andes lake district. Features Cerro Tronador, pristine lakes, and the town of Bariloche.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Nahuel_Huapi_lake%2C_Neuquen%2C_Argentina_-_panoramio.jpg/1280px-Nahuel_Huapi_lake%2C_Neuquen%2C_Argentina_-_panoramio.jpg",
    highlights: ["Cerro Tronador", "Circuito Chico", "Refugio Frey"],
  },
  "Iguazu": {
    description: "275 waterfalls along the Iguazu River at the Brazil-Argentina border. The Devil's Throat is one of the most powerful waterfalls on Earth.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Iguazu_D%C3%A9cembre_2007_-_Panorama_3.jpg/1280px-Iguazu_D%C3%A9cembre_2007_-_Panorama_3.jpg",
    highlights: ["Devil's Throat", "Upper Circuit", "Lower Circuit"],
  },

  // Peru
  "Huascaran": {
    description: "Home to Peru's highest peak (6,768m) and the stunning Cordillera Blanca. World-class trekking including the Santa Cruz Trek.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Huascar%C3%A1n2.jpg/1280px-Huascar%C3%A1n2.jpg",
    highlights: ["Santa Cruz Trek", "Laguna 69", "Pastoruri Glacier"],
  },
  "Manu": {
    description: "One of Earth's most biodiverse places, spanning Andean cloud forest to Amazon lowlands. Over 1,000 bird species and giant otters.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Manu_National_Park-71.jpg/1280px-Manu_National_Park-71.jpg",
    highlights: ["Macaw clay lick", "Giant otters", "Cloud forest"],
  },

  // Colombia
  "Tayrona": {
    description: "Caribbean coast park with pristine beaches, coral reefs, and jungle trails leading to the ancient Pueblito ruins.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Tayrona_01.jpg/1280px-Tayrona_01.jpg",
    highlights: ["Cabo San Juan", "Pueblito ruins", "Snorkeling"],
  },
  "Cocuy": {
    description: "Colombia's premier mountain park with glaciated peaks, paramo ecosystems, and challenging high-altitude treks above 5,000m.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Sierra_Nevada_del_Cocuy_01.jpg/1280px-Sierra_Nevada_del_Cocuy_01.jpg",
    highlights: ["Laguna Grande de la Sierra", "Pulpito del Diablo", "Paramo hiking"],
  },

  // Ecuador
  "Galapagos": {
    description: "Volcanic archipelago 1,000km off Ecuador's coast. Unique wildlife evolved in isolation — giant tortoises, marine iguanas, blue-footed boobies.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Gal%C3%A1pagos_Giant_Tortoise_%28Chelonoidis_nigra%29.jpg/1280px-Gal%C3%A1pagos_Giant_Tortoise_%28Chelonoidis_nigra%29.jpg",
    highlights: ["Giant tortoises", "Marine iguanas", "Darwin Station"],
  },
  "Cotopaxi": {
    description: "One of the world's highest active volcanoes at 5,897m. Snow-capped peak visible from Quito on clear days. Popular for climbing and mountain biking.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Cotopaxi_volcano_2008-06-27T1322.jpg/1280px-Cotopaxi_volcano_2008-06-27T1322.jpg",
    highlights: ["Summit climb", "Laguna Limpiopungo", "Mountain biking"],
  },

  // Brazil
  "Chapada Diamantina": {
    description: "Tabletop mountains, caves, waterfalls, and swimming holes in Bahia's interior. The Vale do Pati is one of Brazil's best multi-day treks.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Cachoeira_da_Fuma%C3%A7a_-_Chapada_Diamantina.jpg/800px-Cachoeira_da_Fuma%C3%A7a_-_Chapada_Diamantina.jpg",
    highlights: ["Vale do Pati", "Fumaca Waterfall", "Poco Azul cave pool"],
  },
  "Lencois Maranhenses": {
    description: "Surreal landscape of white sand dunes dotted with seasonal freshwater lagoons. Best visited June-September when lagoons are full.",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Len%C3%A7%C3%B3is_Maranhenses_-_Brasil.jpg/1280px-Len%C3%A7%C3%B3is_Maranhenses_-_Brasil.jpg",
    highlights: ["Lagoa Azul", "Lagoa Bonita", "Dune trekking"],
  },
};

// Fallback parks when WDPA API fails — pre-positioned with coordinates
export const FALLBACK_SA_PARKS: SAPark[] = [
  // Chile
  { id: "sa_tdp", name: "Torres del Paine", designation: "National Park", iucnCategory: "II", areaKm2: 2422, country: "Chile", countryISO3: "CHL", latitude: -51.0, longitude: -73.1, managementAuthority: "CONAF", link: "" },
  { id: "sa_lauca", name: "Lauca", designation: "National Park", iucnCategory: "II", areaKm2: 1379, country: "Chile", countryISO3: "CHL", latitude: -18.2, longitude: -69.3, managementAuthority: "CONAF", link: "" },
  { id: "sa_vpr", name: "Vicente Perez Rosales", designation: "National Park", iucnCategory: "II", areaKm2: 2536, country: "Chile", countryISO3: "CHL", latitude: -41.1, longitude: -72.0, managementAuthority: "CONAF", link: "" },
  { id: "sa_atacama", name: "Pan de Azucar", designation: "National Park", iucnCategory: "II", areaKm2: 438, country: "Chile", countryISO3: "CHL", latitude: -26.1, longitude: -70.6, managementAuthority: "CONAF", link: "" },
  // Argentina
  { id: "sa_glaciares", name: "Los Glaciares", designation: "National Park", iucnCategory: "II", areaKm2: 7269, country: "Argentina", countryISO3: "ARG", latitude: -49.3, longitude: -73.0, managementAuthority: "APN", link: "" },
  { id: "sa_nahuel", name: "Nahuel Huapi", designation: "National Park", iucnCategory: "II", areaKm2: 7171, country: "Argentina", countryISO3: "ARG", latitude: -41.1, longitude: -71.3, managementAuthority: "APN", link: "" },
  { id: "sa_iguazu_ar", name: "Iguazu", designation: "National Park", iucnCategory: "II", areaKm2: 677, country: "Argentina", countryISO3: "ARG", latitude: -25.7, longitude: -54.4, managementAuthority: "APN", link: "" },
  { id: "sa_talampaya", name: "Talampaya", designation: "National Park", iucnCategory: "III", areaKm2: 2138, country: "Argentina", countryISO3: "ARG", latitude: -29.8, longitude: -68.0, managementAuthority: "APN", link: "" },
  // Peru
  { id: "sa_huascaran", name: "Huascaran", designation: "National Park", iucnCategory: "II", areaKm2: 3400, country: "Peru", countryISO3: "PER", latitude: -9.2, longitude: -77.6, managementAuthority: "SERNANP", link: "" },
  { id: "sa_manu", name: "Manu", designation: "National Park", iucnCategory: "II", areaKm2: 17163, country: "Peru", countryISO3: "PER", latitude: -12.0, longitude: -71.5, managementAuthority: "SERNANP", link: "" },
  { id: "sa_machupicchu", name: "Machu Picchu Historical Sanctuary", designation: "Historical Sanctuary", iucnCategory: "III", areaKm2: 326, country: "Peru", countryISO3: "PER", latitude: -13.2, longitude: -72.5, managementAuthority: "SERNANP", link: "" },
  // Colombia
  { id: "sa_tayrona", name: "Tayrona", designation: "National Park", iucnCategory: "II", areaKm2: 150, country: "Colombia", countryISO3: "COL", latitude: 11.3, longitude: -74.0, managementAuthority: "PNN", link: "" },
  { id: "sa_cocuy", name: "El Cocuy", designation: "National Park", iucnCategory: "II", areaKm2: 3060, country: "Colombia", countryISO3: "COL", latitude: 6.4, longitude: -72.3, managementAuthority: "PNN", link: "" },
  { id: "sa_cocora", name: "Los Nevados", designation: "National Park", iucnCategory: "II", areaKm2: 583, country: "Colombia", countryISO3: "COL", latitude: 4.8, longitude: -75.4, managementAuthority: "PNN", link: "" },
  // Ecuador
  { id: "sa_galapagos", name: "Galapagos", designation: "National Park", iucnCategory: "II", areaKm2: 7995, country: "Ecuador", countryISO3: "ECU", latitude: -0.8, longitude: -91.1, managementAuthority: "DPNG", link: "" },
  { id: "sa_cotopaxi", name: "Cotopaxi", designation: "National Park", iucnCategory: "II", areaKm2: 334, country: "Ecuador", countryISO3: "ECU", latitude: -0.7, longitude: -78.4, managementAuthority: "MAE", link: "" },
  { id: "sa_yasuni", name: "Yasuni", designation: "National Park", iucnCategory: "II", areaKm2: 9820, country: "Ecuador", countryISO3: "ECU", latitude: -1.0, longitude: -75.9, managementAuthority: "MAE", link: "" },
  // Brazil
  { id: "sa_chapada", name: "Chapada Diamantina", designation: "National Park", iucnCategory: "II", areaKm2: 1524, country: "Brazil", countryISO3: "BRA", latitude: -12.6, longitude: -41.4, managementAuthority: "ICMBio", link: "" },
  { id: "sa_lencois", name: "Lencois Maranhenses", designation: "National Park", iucnCategory: "II", areaKm2: 1550, country: "Brazil", countryISO3: "BRA", latitude: -2.5, longitude: -43.1, managementAuthority: "ICMBio", link: "" },
  { id: "sa_iguazu_br", name: "Iguacu", designation: "National Park", iucnCategory: "II", areaKm2: 1852, country: "Brazil", countryISO3: "BRA", latitude: -25.6, longitude: -54.3, managementAuthority: "ICMBio", link: "" },
  { id: "sa_aparados", name: "Aparados da Serra", designation: "National Park", iucnCategory: "II", areaKm2: 102, country: "Brazil", countryISO3: "BRA", latitude: -29.2, longitude: -50.1, managementAuthority: "ICMBio", link: "" },
];
```

- [ ] **Step 2: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 3: Commit**

```bash
git add constants/SouthAmericaParks.ts
git commit -m "feat: curated SA parks data with descriptions and fallback coordinates"
```

---

### Task 4: Offline Region Definitions

**Files:**
- Create: `constants/OfflineRegions.ts`

- [ ] **Step 1: Create constants/OfflineRegions.ts**

```typescript
// constants/OfflineRegions.ts

export interface OfflineRegionDef {
  id: string;
  name: string;
  country: string;
  countryFlag: string;
  bounds: { sw: [number, number]; ne: [number, number] }; // [lng, lat]
  minZoom: number;
  maxZoom: number;
  estimatedSizeMB: number;
}

export const OFFLINE_REGIONS: OfflineRegionDef[] = [
  // Chile / Argentina
  {
    id: "tdp_patagonia_south",
    name: "Torres del Paine & Patagonia South",
    country: "Chile",
    countryFlag: "🇨🇱",
    bounds: { sw: [-75.0, -52.5], ne: [-70.0, -50.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 120,
  },
  {
    id: "fitz_roy_glaciares",
    name: "Fitz Roy & Los Glaciares",
    country: "Argentina",
    countryFlag: "🇦🇷",
    bounds: { sw: [-73.5, -50.5], ne: [-72.0, -49.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 80,
  },
  // Peru
  {
    id: "cusco_inca_trail",
    name: "Cusco, Sacred Valley & Inca Trail",
    country: "Peru",
    countryFlag: "🇵🇪",
    bounds: { sw: [-73.0, -14.0], ne: [-71.5, -13.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 70,
  },
  {
    id: "cordillera_blanca",
    name: "Cordillera Blanca & Huayhuash",
    country: "Peru",
    countryFlag: "🇵🇪",
    bounds: { sw: [-78.0, -10.5], ne: [-76.5, -8.5] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 75,
  },
  // Chile
  {
    id: "atacama",
    name: "Atacama Desert",
    country: "Chile",
    countryFlag: "🇨🇱",
    bounds: { sw: [-69.5, -24.5], ne: [-67.5, -22.5] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 60,
  },
  // Colombia
  {
    id: "ciudad_perdida",
    name: "Ciudad Perdida & Sierra Nevada",
    country: "Colombia",
    countryFlag: "🇨🇴",
    bounds: { sw: [-74.5, 10.5], ne: [-73.0, 11.5] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 70,
  },
  {
    id: "cocora_coffee",
    name: "Cocora Valley & Coffee Region",
    country: "Colombia",
    countryFlag: "🇨🇴",
    bounds: { sw: [-76.0, 4.2], ne: [-75.0, 5.2] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 55,
  },
  // Ecuador
  {
    id: "galapagos",
    name: "Galapagos Islands",
    country: "Ecuador",
    countryFlag: "🇪🇨",
    bounds: { sw: [-92.0, -1.5], ne: [-89.0, 0.8] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 40,
  },
  {
    id: "cotopaxi_volcanoes",
    name: "Cotopaxi & Avenue of Volcanoes",
    country: "Ecuador",
    countryFlag: "🇪🇨",
    bounds: { sw: [-79.0, -1.5], ne: [-78.0, 0.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 65,
  },
  // Brazil
  {
    id: "chapada_diamantina",
    name: "Chapada Diamantina",
    country: "Brazil",
    countryFlag: "🇧🇷",
    bounds: { sw: [-42.0, -13.3], ne: [-40.8, -12.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 70,
  },
  // Brazil / Argentina
  {
    id: "iguazu_atlantic",
    name: "Iguazu & Atlantic Forest",
    country: "Brazil",
    countryFlag: "🇧🇷",
    bounds: { sw: [-55.0, -26.0], ne: [-53.5, -25.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 55,
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add constants/OfflineRegions.ts
git commit -m "feat: offline download region definitions for 11 SA areas"
```

---

### Task 5: Trail Query Expansion for SA

**Files:**
- Modify: `services/trailsApi.ts`

- [ ] **Step 1: Add highway=track queries to trail previews and full trails**

In `services/trailsApi.ts`, find the Overpass query string for previews. The current query includes:
```
way["highway"~"^(track|bridleway)$"]["sac_scale"]["access"!="private"]
```

This already includes `highway=track` but only when `sac_scale` is present. SA trails often have `tracktype` instead of `sac_scale`. Add an additional line to catch these:

In the preview query, after the `sac_scale` track line, add:
```
way["highway"="track"]["tracktype"~"^(grade3|grade4|grade5)$"]["access"!="private"](${south},${west},${north},${east});
```

In the full trail query, add the same line in the `out geom` section:
```
way["highway"="track"]["tracktype"~"^(grade3|grade4|grade5)$"]["access"!="private"](${south},${west},${north},${east});
```

- [ ] **Step 2: Add tracktype-based difficulty mapping**

Find the difficulty mapping function (maps `sac_scale` to `TrailDifficulty`). Add a fallback for `tracktype`:

```typescript
function parseDifficulty(tags: Record<string, string>): TrailDifficulty {
  const sac = tags.sac_scale;
  if (sac) {
    if (sac.startsWith("hiking")) return "easy";
    if (sac.startsWith("mountain_hiking")) return "moderate";
    if (sac.startsWith("demanding_mountain")) return "hard";
    if (sac.startsWith("alpine") || sac.startsWith("difficult_alpine")) return "expert";
  }
  // Fallback: tracktype (common in SA)
  const tt = tags.tracktype;
  if (tt) {
    if (tt === "grade1" || tt === "grade2") return "easy";
    if (tt === "grade3") return "moderate";
    if (tt === "grade4" || tt === "grade5") return "hard";
  }
  const td = tags.trail_difficulty;
  if (td) {
    // existing trail_difficulty mapping...
  }
  return "unknown";
}
```

- [ ] **Step 3: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 4: Commit**

```bash
git add services/trailsApi.ts
git commit -m "feat: expand trail queries with highway=track + tracktype for SA coverage"
```

---

### Task 6: SA Park Preloading

**Files:**
- Modify: `services/preloadService.ts`

- [ ] **Step 1: Add SA park preloading alongside NPS**

Add imports at the top of `services/preloadService.ts`:
```typescript
import { fetchSAParks, setSAParksCache, type SAPark } from "./wdpaApi";
import { FALLBACK_SA_PARKS } from "@/constants/SouthAmericaParks";
```

Add a new function after the existing `preloadParks()`:
```typescript
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
```

- [ ] **Step 2: Call preloadSAParks from app layout**

In `app/_layout.tsx`, find where `preloadParks()` is called and add `preloadSAParks()` alongside it:

```typescript
import { preloadParks, preloadSAParks } from "@/services/preloadService";

// In the useEffect or top-level call:
preloadParks();
preloadSAParks();
```

- [ ] **Step 3: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 4: Commit**

```bash
git add services/preloadService.ts app/_layout.tsx
git commit -m "feat: preload SA parks from WDPA with fallback to curated data"
```

---

### Task 7: Map Tab — Region-Aware Data Loading & SA Parks

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Add imports and region state**

At the top of `app/(tabs)/index.tsx`, add:
```typescript
import { detectRegion, formatDistance, formatElevation, type AppRegion } from "@/services/regionDetection";
import { getPreloadedSAParks, type SAPark } from "@/services/wdpaApi";
import { CURATED_SA_PARKS } from "@/constants/SouthAmericaParks";
```

Add state variable alongside existing state:
```typescript
const [currentRegion, setCurrentRegion] = useState<AppRegion>("us");
const [saParks, setSAParks] = useState<SAPark[]>([]);
```

- [ ] **Step 2: Update region detection in onMapIdle**

In the `onMapIdle` handler, after `setRegion(...)`, add:
```typescript
const detected = detectRegion(lat, lon);
setCurrentRegion(detected);
```

- [ ] **Step 3: Load SA parks when region is SA**

Add a new useEffect:
```typescript
useEffect(() => {
  if (currentRegion !== "sa") {
    setSAParks([]);
    return;
  }
  const preloaded = getPreloadedSAParks();
  if (preloaded && preloaded.length > 0) {
    setSAParks(preloaded);
  }
}, [currentRegion]);
```

- [ ] **Step 4: Render SA park pins on the map**

Create the SA parks GeoJSON (add alongside existing `parksGeoJSON` useMemo):
```typescript
const saParksGeoJSON = useMemo(() => ({
  type: "FeatureCollection" as const,
  features: saParks.map((p, idx) => ({
    type: "Feature" as const,
    id: idx + 10000, // offset to avoid collision with US park IDs
    geometry: {
      type: "Point" as const,
      coordinates: [p.longitude, p.latitude],
    },
    properties: {
      id: p.id,
      name: p.name,
      country: p.country,
      designation: p.designation,
      areaKm2: p.areaKm2,
    },
  })),
}), [saParks]);
```

Add the MapboxGL layer after the existing parks layer:
```typescript
{currentRegion === "sa" && saParks.length > 0 && (
  <MapboxGL.ShapeSource
    id="sa-parks-src"
    shape={saParksGeoJSON}
    onPress={(e: any) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties;
      if (gateFeature("South America Parks")) return;
      // Handle SA park selection
      setSelectedSAPark(props);
    }}
  >
    <MapboxGL.SymbolLayer
      id="sa-park-label"
      style={{
        iconImage: "marker-park",
        iconSize: 0.25,
        iconAllowOverlap: true,
        textField: ["get", "name"],
        textSize: 11,
        textOffset: [0, 2.0],
        textColor: "#fff",
        textHaloColor: "rgba(0,0,0,0.7)",
        textHaloWidth: 1.5,
      }}
    />
  </MapboxGL.ShapeSource>
)}
```

- [ ] **Step 5: Add SA park detail sheet**

Add state for selected SA park:
```typescript
const [selectedSAPark, setSelectedSAPark] = useState<any>(null);
```

Add a bottom sheet or modal for SA park details (after existing park sheet):
```typescript
{selectedSAPark && (
  <View style={styles.saParkSheet}>
    <Text style={styles.saParkName}>{selectedSAPark.name}</Text>
    <Text style={styles.saParkCountry}>{selectedSAPark.country} · {selectedSAPark.designation}</Text>
    {CURATED_SA_PARKS[selectedSAPark.name] && (
      <>
        <Text style={styles.saParkDesc}>{CURATED_SA_PARKS[selectedSAPark.name].description}</Text>
        {CURATED_SA_PARKS[selectedSAPark.name].highlights.map((h: string) => (
          <Text key={h} style={styles.saParkHighlight}>• {h}</Text>
        ))}
      </>
    )}
    <Text style={styles.saParkArea}>
      {formatDistance(selectedSAPark.areaKm2 * 1000000, "sa")}² protected area
    </Text>
  </View>
)}
```

- [ ] **Step 6: Suppress RIDB enrichment for SA campgrounds**

In the `useEffect` that triggers RIDB enrichment on campground selection, wrap the RIDB call:
```typescript
// Only fetch RIDB for US campgrounds
if (currentRegion === "us" && !(selectedCampground.id in ridbCache)) {
  fetchRidbEnrichment(/* ... */);
}
```

- [ ] **Step 7: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 8: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: region-aware map loading with SA park pins and detail sheets"
```

---

### Task 8: Destinations Section

**Files:**
- Create: `components/DestinationCard.tsx`
- Create: `components/DestinationsSection.tsx`
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Create components/DestinationCard.tsx**

```typescript
// components/DestinationCard.tsx
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "@/constants/Colors";

interface DestinationCardProps {
  name: string;
  country: string;
  flag: string;
  photoUrl: string;
  parkCount: number;
  trailHint: string;
  onPress: () => void;
}

export function DestinationCard({ name, country, flag, photoUrl, parkCount, trailHint, onPress }: DestinationCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <Image source={{ uri: photoUrl }} style={styles.image} />
      <View style={styles.overlay}>
        <Text style={styles.flag}>{flag}</Text>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>{country} · {parkCount} parks</Text>
        <Text style={styles.hint}>{trailHint}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 200,
    height: 140,
    borderRadius: 14,
    overflow: "hidden",
    marginRight: 12,
  },
  image: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  flag: { fontSize: 18, position: "absolute", top: 8, right: 8 },
  name: { color: "#fff", fontSize: 15, fontWeight: "700" },
  subtitle: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 },
  hint: { color: "rgba(255,255,255,0.6)", fontSize: 10, marginTop: 1 },
});
```

- [ ] **Step 2: Create components/DestinationsSection.tsx**

```typescript
// components/DestinationsSection.tsx
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { DestinationCard } from "./DestinationCard";
import { Colors } from "@/constants/Colors";

interface Destination {
  name: string;
  country: string;
  flag: string;
  photoUrl: string;
  parkCount: number;
  trailHint: string;
  latitude: number;
  longitude: number;
}

const DESTINATIONS: Destination[] = [
  {
    name: "Patagonia",
    country: "Chile / Argentina",
    flag: "🇨🇱",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Cuernos_del_Paine_from_Lake_Peho%C3%A9.jpg/640px-Cuernos_del_Paine_from_Lake_Peho%C3%A9.jpg",
    parkCount: 8,
    trailHint: "W Trek · Fitz Roy · Grey Glacier",
    latitude: -50.5,
    longitude: -73.0,
  },
  {
    name: "Inca Trail & Cusco",
    country: "Peru",
    flag: "🇵🇪",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/640px-Machu_Picchu%2C_Peru.jpg",
    parkCount: 4,
    trailHint: "Machu Picchu · Sacred Valley · Salkantay",
    latitude: -13.2,
    longitude: -72.5,
  },
  {
    name: "Colombian Highlands",
    country: "Colombia",
    flag: "🇨🇴",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Tayrona_01.jpg/640px-Tayrona_01.jpg",
    parkCount: 5,
    trailHint: "Ciudad Perdida · Cocora Valley · Tayrona",
    latitude: 6.0,
    longitude: -74.0,
  },
  {
    name: "Galapagos",
    country: "Ecuador",
    flag: "🇪🇨",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Gal%C3%A1pagos_Giant_Tortoise_%28Chelonoidis_nigra%29.jpg/640px-Gal%C3%A1pagos_Giant_Tortoise_%28Chelonoidis_nigra%29.jpg",
    parkCount: 2,
    trailHint: "Giant tortoises · Marine iguanas · Volcanic",
    latitude: -0.8,
    longitude: -91.1,
  },
  {
    name: "Brazilian Chapada",
    country: "Brazil",
    flag: "🇧🇷",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Cachoeira_da_Fuma%C3%A7a_-_Chapada_Diamantina.jpg/640px-Cachoeira_da_Fuma%C3%A7a_-_Chapada_Diamantina.jpg",
    parkCount: 4,
    trailHint: "Vale do Pati · Fumaca Falls · Cave pools",
    latitude: -12.6,
    longitude: -41.4,
  },
  {
    name: "Atacama Desert",
    country: "Chile",
    flag: "🇨🇱",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Parinacota_volcano.jpg/640px-Parinacota_volcano.jpg",
    parkCount: 3,
    trailHint: "Driest desert · Salt flats · Stargazing",
    latitude: -23.5,
    longitude: -68.0,
  },
];

interface Props {
  onDestinationPress: (lat: number, lng: number) => void;
}

export function DestinationsSection({ onDestinationPress }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Explore South America</Text>
      <Text style={styles.subtitle}>Premium destinations with trails & offline maps</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {DESTINATIONS.map((d) => (
          <DestinationCard
            key={d.name}
            name={d.name}
            country={d.country}
            flag={d.flag}
            photoUrl={d.photoUrl}
            parkCount={d.parkCount}
            trailHint={d.trailHint}
            onPress={() => onDestinationPress(d.latitude, d.longitude)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 16, paddingBottom: 8 },
  title: { color: "#fff", fontSize: 17, fontWeight: "700", paddingHorizontal: 16, marginBottom: 2 },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: 12, paddingHorizontal: 16, marginBottom: 10 },
  scroll: { paddingHorizontal: 16 },
});
```

- [ ] **Step 3: Wire destinations into the map tab**

In `app/(tabs)/index.tsx`, import and add the destinations section. Add it inside the map view as an overlay at the bottom, or below the map in the scroll layout:

```typescript
import { DestinationsSection } from "@/components/DestinationsSection";

// Add fly-to handler
const handleDestinationPress = (lat: number, lng: number) => {
  mapRef.current?.setCamera({
    centerCoordinate: [lng, lat],
    zoomLevel: 7,
    animationDuration: 2000,
  });
};

// Render destinations section when user is NOT already in SA
// Add near the bottom of the map tab, after the layer panel
{currentRegion === "us" && (
  <DestinationsSection onDestinationPress={handleDestinationPress} />
)}
```

- [ ] **Step 4: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 5: Commit**

```bash
git add components/DestinationCard.tsx components/DestinationsSection.tsx app/(tabs)/index.tsx
git commit -m "feat: curated SA destinations carousel with fly-to navigation"
```

---

### Task 9: Premium Gating for SA Content

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Gate SA trail detail taps**

Find the trail tap handler. When a trail is tapped and `currentRegion === "sa"`, gate it:

```typescript
// In the trail tap handler (handleTrailPress or similar)
const handleTrailTap = (trailId: string) => {
  if (currentRegion === "sa" && gateFeature("Explore South America Trails")) return;
  // ... existing trail detail fetch
};
```

- [ ] **Step 2: Gate SA park detail taps**

Already handled in Task 7 Step 4 with `gateFeature("South America Parks")` in the SA parks ShapeSource `onPress`.

- [ ] **Step 3: Verify free user sees pins but gets paywall on tap**

Manual test: Sign out of subscription, pan map to SA, verify park pins visible, tap one → paywall appears.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: premium gate for SA park and trail interactions"
```

---

### Task 10: Unit Switching

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Use formatDistance and formatElevation in trail display**

Find where trail distances are displayed (trail detail sheet, trail list). Replace hardcoded mile/feet formatting:

```typescript
// Before:
<Text>{trail.distanceMiles?.toFixed(1)} mi</Text>

// After:
<Text>{trail.distanceMiles != null ? formatDistance(trail.distanceMiles * 1609.34, currentRegion) : "—"}</Text>
```

For elevation:
```typescript
// Before:
<Text>{elevation} ft</Text>

// After:
<Text>{formatElevation(elevationMeters, currentRegion)}</Text>
```

- [ ] **Step 2: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: auto unit switching — metric in SA, imperial in US"
```

---

### Task 11: Offline Maps Service

**Files:**
- Create: `services/offlineMapsService.ts`

- [ ] **Step 1: Create services/offlineMapsService.ts**

```typescript
// services/offlineMapsService.ts
import MapboxGL from "@rnmapbox/maps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OFFLINE_REGIONS, type OfflineRegionDef } from "@/constants/OfflineRegions";

const STORAGE_KEY = "nf_offline_regions_v1";

export interface OfflineRegionStatus {
  id: string;
  state: "idle" | "downloading" | "complete" | "error";
  progress: number; // 0-100
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
      // Only keep "complete" entries — downloading ones need to restart
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
  const { id, name, bounds, minZoom, maxZoom } = regionDef;

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
        // Progress callback from Mapbox
        const pct = status.percentage ?? 0;
        _statuses[id] = {
          id,
          state: pct >= 100 ? "complete" : "downloading",
          progress: Math.round(pct),
          sizeBytes: status.completedTileSize ?? 0,
        };
        notify();
        onProgress?.(id, Math.round(pct));

        if (pct >= 100) {
          saveStatuses();
        }
      },
      (region: any, error: any) => {
        _statuses[id] = { id, state: "error", progress: 0, sizeBytes: 0 };
        notify();
      },
    );
  } catch (err) {
    _statuses[id] = { id, state: "error", progress: 0, sizeBytes: 0 };
    notify();
    throw err;
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
```

- [ ] **Step 2: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 3: Commit**

```bash
git add services/offlineMapsService.ts
git commit -m "feat: Mapbox offline map download service with progress tracking"
```

---

### Task 12: Offline Maps UI

**Files:**
- Create: `components/OfflineMapsManager.tsx`
- Modify: `app/(tabs)/settings.tsx` (or equivalent settings screen)

- [ ] **Step 1: Create components/OfflineMapsManager.tsx**

```typescript
// components/OfflineMapsManager.tsx
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { OFFLINE_REGIONS, type OfflineRegionDef } from "@/constants/OfflineRegions";
import {
  downloadRegion,
  deleteRegion,
  getOfflineStatuses,
  subscribeOfflineStatus,
  loadSavedStatuses,
  type OfflineRegionStatus,
} from "@/services/offlineMapsService";
import { useSubscription } from "@/context/SubscriptionContext";
import { Colors } from "@/constants/Colors";

export function OfflineMapsManager() {
  const { gateFeature } = useSubscription();
  const [statuses, setStatuses] = useState<Record<string, OfflineRegionStatus>>({});

  useEffect(() => {
    loadSavedStatuses().then(() => setStatuses(getOfflineStatuses()));
    const unsub = subscribeOfflineStatus(() => setStatuses(getOfflineStatuses()));
    return unsub;
  }, []);

  const grouped = OFFLINE_REGIONS.reduce<Record<string, OfflineRegionDef[]>>((acc, r) => {
    (acc[r.country] ??= []).push(r);
    return acc;
  }, {});

  const handleDownload = (region: OfflineRegionDef) => {
    if (gateFeature("Offline Maps")) return;
    downloadRegion(region);
  };

  const handleDelete = (region: OfflineRegionDef) => {
    Alert.alert("Delete Offline Map", `Remove ${region.name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteRegion(region.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Offline Maps</Text>
      <Text style={styles.sectionSubtitle}>Download maps for areas with no cell service</Text>

      {Object.entries(grouped).map(([country, regions]) => (
        <View key={country}>
          <Text style={styles.countryHeader}>{regions[0].countryFlag} {country}</Text>
          {regions.map((r) => {
            const status = statuses[r.id];
            const isComplete = status?.state === "complete";
            const isDownloading = status?.state === "downloading";

            return (
              <View key={r.id} style={styles.regionRow}>
                <View style={styles.regionInfo}>
                  <Text style={styles.regionName}>{r.name}</Text>
                  <Text style={styles.regionSize}>~{r.estimatedSizeMB} MB</Text>
                </View>
                {isComplete ? (
                  <TouchableOpacity onPress={() => handleDelete(r)}>
                    <Text style={styles.deleteBtn}>Delete</Text>
                  </TouchableOpacity>
                ) : isDownloading ? (
                  <Text style={styles.progress}>{status.progress}%</Text>
                ) : (
                  <TouchableOpacity onPress={() => handleDownload(r)}>
                    <Text style={styles.downloadBtn}>Download</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 2 },
  sectionSubtitle: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 16 },
  countryHeader: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  regionInfo: { flex: 1 },
  regionName: { color: "#fff", fontSize: 14 },
  regionSize: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 },
  downloadBtn: { color: Colors.primary, fontSize: 14, fontWeight: "600" },
  deleteBtn: { color: "#ff6b6b", fontSize: 14, fontWeight: "600" },
  progress: { color: Colors.primary, fontSize: 14, fontWeight: "600" },
});
```

- [ ] **Step 2: Add OfflineMapsManager to Settings tab**

In the settings screen, add the offline maps section:

```typescript
import { OfflineMapsManager } from "@/components/OfflineMapsManager";

// In the settings ScrollView, add after existing settings:
<OfflineMapsManager />
```

- [ ] **Step 3: Build and verify**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -5`
Expected: Bundle export succeeds

- [ ] **Step 4: Commit**

```bash
git add components/OfflineMapsManager.tsx app/(tabs)/settings.tsx
git commit -m "feat: offline maps UI with download/delete per region"
```

---

### Task 13: Final Integration Build & Test

**Files:**
- Verify all new and modified files

- [ ] **Step 1: Full bundle export**

Run: `cd ~/Desktop/workplaces/NatureFind && npx expo export --platform ios 2>&1 | tail -10`
Expected: Bundle export succeeds with no errors

- [ ] **Step 2: Verify no TypeScript errors in new files**

Run: `cd ~/Desktop/workplaces/NatureFind && npx tsc --noEmit 2>&1 | grep -E "Regions|wdpa|regionDetection|SouthAmerica|OfflineRegion|Destination|offlineMaps" | head -20`
Expected: No errors in the new files (existing codebase errors are acceptable)

- [ ] **Step 3: Manual integration test checklist**

1. Open app → map loads at US center → existing parks visible ✓
2. Pan map south to South America → SA park pins appear ✓
3. Tap SA park pin (not subscribed) → paywall appears ✓
4. Tap SA park pin (subscribed) → park detail sheet with description ✓
5. Zoom into Patagonia → trail lines appear ✓
6. Tap trail (not subscribed) → paywall ✓
7. Destinations section visible on US map view ✓
8. Tap "Patagonia" destination → map flies to SA ✓
9. Settings → Offline Maps → regions listed by country ✓
10. Download a region (subscribed) → progress shown ✓
11. All existing US functionality unchanged ✓

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: NatureFind South America expansion — Phase 1 complete"
```
