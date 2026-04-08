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
  reported_area: number;
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
        .filter((p) => p.reported_area > 10)
        .map(toSAPark);
      all.push(...parks);
    } catch {}
  }

  if (all.length > 0) {
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: all, ts: Date.now() }));
    } catch {}
  }

  return all;
}

let _saParks: SAPark[] | null = null;

export function getPreloadedSAParks(): SAPark[] | null {
  return _saParks;
}

export function setSAParksCache(parks: SAPark[]): void {
  _saParks = parks;
}
