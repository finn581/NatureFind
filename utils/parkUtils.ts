import type { OperatingHours, ParkActivity } from "@/services/npsApi";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseTime12h(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return h * 60 + min;
}

/**
 * Returns true (open), false (closed), or null (cannot determine).
 * Checks the first OperatingHours entry that has a value for today.
 */
export function isOpenNow(operatingHours: OperatingHours[]): boolean | null {
  if (!operatingHours?.length) return null;

  const now = new Date();
  const dayKey = DAYS[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const oh of operatingHours) {
    const hours = oh.standardHours?.[dayKey];
    if (!hours) continue;

    const normalized = hours.trim();

    if (normalized.toLowerCase() === "all day") return true;
    if (normalized.toLowerCase() === "closed") return false;
    // "Sunrise - Sunset" and similar: treat as open
    if (normalized.toLowerCase().includes("sunrise")) return true;

    // Parse "H:MMAM - H:MMPM" (e.g. "9:00AM - 5:00PM")
    const parts = normalized.split(" - ");
    if (parts.length === 2) {
      const open = parseTime12h(parts[0].trim());
      const close = parseTime12h(parts[1].trim());
      if (open === null || close === null) return null;

      if (close < open) {
        // Overnight: open if current >= open OR current < close
        return currentMinutes >= open || currentMinutes < close;
      }
      return currentMinutes >= open && currentMinutes < close;
    }

    return null;
  }

  return null;
}

/**
 * Returns true if the park allows leashed pets (dog-friendly).
 * Checks for activity names containing "pet" or "leash".
 */
export function isDogFriendly(activities: ParkActivity[]): boolean {
  return activities.some((a) => /pet|leash/i.test(a.name));
}
