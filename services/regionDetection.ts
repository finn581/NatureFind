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
