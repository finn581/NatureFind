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
  { code: "CL", iso3: "CHL", name: "Chile", flag: "\u{1F1E8}\u{1F1F1}" },
  { code: "AR", iso3: "ARG", name: "Argentina", flag: "\u{1F1E6}\u{1F1F7}" },
  { code: "PE", iso3: "PER", name: "Peru", flag: "\u{1F1F5}\u{1F1EA}" },
  { code: "CO", iso3: "COL", name: "Colombia", flag: "\u{1F1E8}\u{1F1F4}" },
  { code: "EC", iso3: "ECU", name: "Ecuador", flag: "\u{1F1EA}\u{1F1E8}" },
  { code: "BR", iso3: "BRA", name: "Brazil", flag: "\u{1F1E7}\u{1F1F7}" },
] as const;

export type SACountryISO3 = (typeof SA_COUNTRIES)[number]["iso3"];

export const SA_CENTER = {
  latitude: -15.0,
  longitude: -60.0,
  latitudeDelta: 50,
  longitudeDelta: 40,
};
