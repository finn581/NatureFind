// Recreation.gov RIDB API — facility enrichment for campground detail sheets
// Docs: https://ridb.recreation.gov/docs
// Auth: apikey header (free, self-serve from recreation.gov account)

const RIDB_BASE = "https://ridb.recreation.gov/api/v1";
const RIDB_KEY = process.env.EXPO_PUBLIC_RIDB_API_KEY ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RidbPhoto {
  url: string;
  title: string;
  isPrimary: boolean;
}

export interface RidbFacility {
  facilityId: string;
  name: string;
  description: string;
  typeDescription: string;
  phone: string | null;
  email: string | null;
  reservationUrl: string | null;
  directions: string | null;
  adaAccess: string | null;
  feeDescription: string | null;
  stayLimit: string | null;
  campsiteCount: number;
  activities: string[];
  photos: RidbPhoto[];
  // Derived amenity booleans — used to fill sheet fields
  fee: boolean | null;
  showers: boolean | null;
  toilets: boolean | null;
  tents: boolean | null;
  caravans: boolean | null;
}

export interface RidbCampsite {
  campsiteId: string;
  name: string;
  type: string;
  typeOfUse: string;
  loop: string;
  accessible: boolean;
  latitude: number | null;
  longitude: number | null;
  // Derived from ATTRIBUTES
  electric: string | null;       // "50 Amp" | "30 Amp" | "Yes" | null
  water: boolean | null;
  sewer: boolean | null;
  firePit: boolean | null;
  campfireAllowed: boolean | null;
  shade: string | null;          // "Full Shade" | "Partial Shade" | "No Shade"
  maxVehicleLength: number | null; // feet
  drivewaySurface: string | null;
  drivewayEntry: string | null;  // "Pull-through" | "Back-in"
  maxPeople: number | null;
  permittedEquipment: Array<{ name: string; maxLength: number | null }>;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry { data: RidbFacility | null; ts: number }
const _cache = new Map<string, CacheEntry>();
const _inFlight = new Set<string>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — RIDB data changes infrequently

interface SitesCacheEntry { data: RidbCampsite[]; ts: number }
const _sitesCache = new Map<string, SitesCacheEntry>();
const _sitesInFlight = new Set<string>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function nameScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wa = na.split(" ").filter((w) => w.length > 2);
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  const common = wa.filter((w) => wb.has(w)).length;
  if (wa.length === 0 || wb.size === 0) return 0;
  return common / Math.max(wa.length, wb.size);
}

function parseFee(feeDesc: string | null, description: string): boolean | null {
  const text = ((feeDesc ?? "") + " " + description).toLowerCase();
  if (!text.trim()) return null;
  if (/no fee|free of charge|no charge|no cost/.test(text)) return false;
  if (/\$\s?\d|fee required|fees apply|camping fee|entrance fee|day use fee/.test(text)) return true;
  if (text.includes("fee") && !text.includes("no fee")) return true;
  return null;
}

function deriveAmenities(activities: string[], description: string): {
  showers: boolean | null;
  toilets: boolean | null;
  tents: boolean | null;
  caravans: boolean | null;
} {
  const combined = (activities.join(" ") + " " + description).toLowerCase();
  return {
    showers: /shower|bath house|bathhouse/.test(combined) ? true : null,
    toilets: /toilet|restroom|vault toilet|pit toilet|flush toilet|latrine/.test(combined) ? true : null,
    tents: /\btent\b|primitive camp|backcountry camp|walk.in camp/.test(combined)
      ? true
      : /no tent/.test(combined)
      ? false
      : null,
    caravans: /\brv\b|hookup|electric.amp|sewer|full hookup|pull.through|caravan|motor.?home/.test(combined)
      ? true
      : null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch RIDB facility data for a campground by name + coordinates.
 * Searches a 0.5-mile radius, picks best name match (score ≥ 0.25).
 * Returns null if no API key, no match found, or request fails.
 * Results are cached 24 hours — RIDB data is very stable.
 */
export async function fetchRidbEnrichment(
  name: string,
  latitude: number,
  longitude: number,
): Promise<RidbFacility | null> {
  if (!RIDB_KEY) return null;

  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (_inFlight.has(cacheKey)) return null;

  _inFlight.add(cacheKey);
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      radius: "0.5",
      limit: "5",
      full: "true",
    });

    const res = await fetch(`${RIDB_BASE}/facilities?${params}`, {
      headers: { apikey: RIDB_KEY, Accept: "application/json" },
    });

    if (!res.ok) {
      _cache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    const json = await res.json();
    const facilities: any[] = json.RECDATA ?? [];

    if (facilities.length === 0) {
      _cache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    // Pick best name match
    const best = facilities
      .map((f) => ({ f, score: nameScore(name, f.FacilityName ?? "") }))
      .sort((a, b) => b.score - a.score)[0];

    if (best.score < 0.25) {
      _cache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    const f = best.f;
    const description = stripHtml(f.FacilityDescription ?? "");
    const activities: string[] = (f.ACTIVITY ?? []).map((a: any) => String(a.ActivityName));
    const photos: RidbPhoto[] = (f.MEDIA ?? [])
      .filter((m: any) => m.URL && /\.(jpg|jpeg|png|webp)/i.test(m.URL))
      .map((m: any) => ({
        url: m.URL as string,
        title: (m.Title ?? "") as string,
        isPrimary: Boolean(m.IsPrimary),
      }));

    const feeDescription = f.FacilityUseFeeDescription
      ? stripHtml(f.FacilityUseFeeDescription)
      : null;

    const result: RidbFacility = {
      facilityId: String(f.FacilityID),
      name: f.FacilityName ?? name,
      description,
      typeDescription: f.FacilityTypeDescription ?? "Campground",
      phone: f.FacilityPhone || null,
      email: f.FacilityEmail || null,
      reservationUrl: f.FacilityReservationURL || null,
      directions: f.FacilityDirections ? stripHtml(f.FacilityDirections) : null,
      adaAccess: f.FacilityAdaAccess || null,
      feeDescription,
      stayLimit: f.StayLimit || null,
      campsiteCount: Array.isArray(f.CAMPSITE) ? f.CAMPSITE.length : 0,
      activities,
      photos,
      fee: parseFee(feeDescription, description),
      ...deriveAmenities(activities, description),
    };

    _cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    _cache.set(cacheKey, { data: null, ts: Date.now() });
    return null;
  } finally {
    _inFlight.delete(cacheKey);
  }
}

// ─── Campsite helpers ─────────────────────────────────────────────────────────

function attr(attributes: any[], name: string): string | null {
  const found = attributes.find(
    (a: any) => String(a.AttributeName).toLowerCase() === name.toLowerCase(),
  );
  return found ? String(found.AttributeValue) : null;
}

function attrBool(attributes: any[], name: string): boolean | null {
  const v = attr(attributes, name);
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower === "yes" || lower === "true") return true;
  if (lower === "no" || lower === "none" || lower === "false") return false;
  return null;
}

function attrNum(attributes: any[], name: string): number | null {
  const v = attr(attributes, name);
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * Fetch all individual campsites for a RIDB facility.
 * Cached 24h per facilityId.
 */
export async function fetchRidbCampsites(facilityId: string): Promise<RidbCampsite[]> {
  if (!RIDB_KEY) return [];

  const cached = _sitesCache.get(facilityId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (_sitesInFlight.has(facilityId)) return [];

  _sitesInFlight.add(facilityId);
  try {
    const res = await fetch(
      `${RIDB_BASE}/facilities/${facilityId}/campsites?limit=50`,
      { headers: { apikey: RIDB_KEY, Accept: "application/json" } },
    );
    if (!res.ok) {
      _sitesCache.set(facilityId, { data: [], ts: Date.now() });
      return [];
    }

    const json = await res.json();
    const raw: any[] = json.RECDATA ?? [];

    const sites: RidbCampsite[] = raw.map((c: any) => {
      const attributes: any[] = c.ATTRIBUTES ?? [];
      const equipment: any[] = c.PERMITTEDEQUIPMENT ?? [];

      const electricRaw = attr(attributes, "Electric Hookup");
      const electric = electricRaw && electricRaw.toLowerCase() !== "no" ? electricRaw : null;

      const shadeRaw = attr(attributes, "Shade");
      const shade = shadeRaw && shadeRaw.toLowerCase() !== "unknown" ? shadeRaw : null;

      const fireRaw = attr(attributes, "Campfire Allowed") ?? attr(attributes, "Fire Pit");
      const campfireAllowed = fireRaw
        ? !/no campfire|not allowed|none/i.test(fireRaw)
        : null;

      const firePitRaw = attr(attributes, "Fire Pit") ?? attr(attributes, "Campfire Type");
      const firePit = firePitRaw
        ? !/no campfire|none/i.test(firePitRaw)
        : null;

      return {
        campsiteId: String(c.CampsiteID),
        name: c.CampsiteName ?? "",
        type: c.CampsiteType ?? "Standard",
        typeOfUse: c.TypeOfUse ?? "Overnight",
        loop: c.Loop ?? "",
        accessible: Boolean(c.CampsiteAccessible),
        latitude: c.CampsiteLatitude || null,
        longitude: c.CampsiteLongitude || null,
        electric,
        water: attrBool(attributes, "Water Hookup"),
        sewer: attrBool(attributes, "Sewer Hookup"),
        firePit,
        campfireAllowed,
        shade,
        maxVehicleLength: attrNum(attributes, "Max Vehicle Length"),
        drivewaySurface: attr(attributes, "Driveway Surface"),
        drivewayEntry: attr(attributes, "Driveway Entry"),
        maxPeople: attrNum(attributes, "Max Num of People"),
        permittedEquipment: equipment.map((e: any) => ({
          name: String(e.EquipmentName),
          maxLength: e.MaxLength ? parseFloat(e.MaxLength) : null,
        })),
      };
    });

    _sitesCache.set(facilityId, { data: sites, ts: Date.now() });
    return sites;
  } catch {
    _sitesCache.set(facilityId, { data: [], ts: Date.now() });
    return [];
  } finally {
    _sitesInFlight.delete(facilityId);
  }
}
