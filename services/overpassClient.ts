/**
 * Shared Overpass API client with concurrency limiting, timeout, and 429 retry.
 * All Overpass consumers (trails, campgrounds, POIs) share this to avoid
 * overwhelming the public API with parallel requests.
 */

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Per-request timeout — fail fast so we can cycle endpoints or use cache fallback
const REQUEST_TIMEOUT_MS = 12_000;

// ─── Debug state (read from UI) ─────────────────────────────────────────────

export let lastOverpassError = "";
export let lastOverpassStatus = "";

// ─── Concurrency limiter ─────────────────────────────────────────────────────

const MAX_CONCURRENT = 3;
let running = 0;
const queue: Array<{ resolve: () => void }> = [];

async function acquireSlot(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++;
    return;
  }
  return new Promise<void>((resolve) => queue.push({ resolve }));
}

function releaseSlot(): void {
  running--;
  const next = queue.shift();
  if (next) {
    running++;
    next.resolve();
  }
}

// ─── Fetch with timeout ─────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function overpassFetch(query: string): Promise<any> {
  await acquireSlot();
  try {
    for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
      const endpoint = OVERPASS_ENDPOINTS[i];
      const label = endpoint.split("/")[2].split(".")[0]; // "overpass-api" etc.
      try {
        lastOverpassStatus = `trying ${label}...`;
        const res = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `data=${encodeURIComponent(query)}`,
          },
          REQUEST_TIMEOUT_MS,
        );
        if (res.ok) {
          const json = await res.json();
          // Check for Overpass runtime errors (returned as 200 with remark)
          if (json.remark && /runtime error|timed out/i.test(json.remark)) {
            lastOverpassError = `${label}: ${json.remark.slice(0, 80)}`;
            continue; // try next endpoint
          }
          const count = json.elements?.length ?? 0;
          lastOverpassStatus = `${label} OK: ${count} els`;
          lastOverpassError = "";
          return json;
        }
        // Non-200 response — read error body
        const errText = await res.text().catch(() => "");
        lastOverpassError = `${label} HTTP ${res.status}: ${errText.slice(0, 100)}`;
        // 429 rate limited — wait before trying next endpoint
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
      } catch (err: any) {
        const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown");
        lastOverpassError = `${label}: ${msg}`;
        if (i === OVERPASS_ENDPOINTS.length - 1)
          throw new Error("All Overpass endpoints failed");
      }
    }
    throw new Error("All Overpass endpoints failed");
  } finally {
    releaseSlot();
  }
}
