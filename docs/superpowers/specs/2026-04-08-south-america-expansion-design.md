# NatureFind South America Expansion — Design Spec

## Overview

NatureFind South America is a premium expansion that makes the existing map seamlessly global. Users pan south and SA parks, trails, and offline maps load automatically. Interacting with SA content requires an active NatureFind subscription — no new tier, no add-ons. Included in the existing subscription to increase its value proposition.

**Launch countries (6):** Chile, Argentina, Peru, Colombia, Ecuador, Brazil

**Phase 1 (this spec):** Parks, trails, offline maps, curated destinations, premium gating
**Phase 2 (future):** Campgrounds via iOverlander, wildlife via iNaturalist, birding via eBird

## Core Behavior

The app detects which region the user is viewing based on map center coordinates. US content uses existing NPS/RIDB sources. SA content uses WDPA + Overpass + Mapbox offline tiles. The user never toggles anything — it just works.

**Region detection** — bounding box check on map center:
- SA: lat -56 to 13, lng -82 to -34
- US: lat 24 to 50, lng -125 to -66
- When center is in SA → fetch from WDPA, suppress RIDB enrichment
- When center is in US → existing behavior unchanged

**Premium gating** — "peek then pay" model:
- Free users can pan to SA and see park pins and trail markers on the map
- Tapping any SA content triggers premium check:
  - Park detail sheet → paywall if not subscribed
  - Trail detail sheet → paywall
  - Offline map download → paywall
- Users see the data exists, get excited, then hit the gate on interaction

## Data Architecture

### Parks — WDPA (Protected Planet API)

- **API:** `https://api.protectedplanet.net/v3/`
- **Auth:** Free API key (register at api.protectedplanet.net)
- **Query:** By country ISO code: CL, AR, PE, CO, EC, BR
- **Returns:** Name, designation type, IUCN category, area (km2), management authority, boundaries (GeoJSON polygons)
- **Strategy:**
  - Pre-fetch top 50-100 parks per country on first SA map view (similar to NPS preload)
  - Cache in AsyncStorage with 7-day TTL
  - Ship a static JSON fallback in the app bundle with ~300 curated SA parks: name, coordinates, country, description, photo URL
  - The curated JSON is hand-written with quality descriptions and photos since WDPA provides boundaries but no visitor info
- **Photos:** Source from Wikimedia Commons API using park name search, cache URLs. Fallback to curated photo URLs in the static JSON.
- **Descriptions:** WDPA has no descriptions. The curated static JSON provides brief descriptions for top parks. For uncurated parks, show designation type + area + country.

### Trails — Overpass API (OSM)

- **API:** Same Overpass infrastructure already in NatureFind — zero new dependencies
- **Query expansion for SA:**
  - Add `highway=track` + `tracktype=grade3|grade4|grade5` (many SA trails are tagged as tracks)
  - Keep existing `highway=path|footway|bridleway`
  - SA trails often lack `sac_scale` — fall back to `tracktype` for difficulty:
    - grade1-2 → Easy
    - grade3 → Moderate  
    - grade4-5 → Difficult
  - SA trails often lack `name` — display "Unnamed trail" with distance + elevation
- **Caching:** Same tile-based system (1x1 degree, 7-day TTL)
- **No code changes to Overpass queries** beyond adding the `highway=track` tag. Overpass works globally.

### Offline Maps — Mapbox Offline Tiles

**Pre-defined download regions:**

| Region | Country | Est. Size |
|--------|---------|-----------|
| Torres del Paine & Patagonia South | Chile/Argentina | ~120MB |
| Fitz Roy & Los Glaciares | Argentina | ~80MB |
| Cusco, Sacred Valley & Inca Trail | Peru | ~70MB |
| Cordillera Blanca & Huayhuash | Peru | ~75MB |
| Atacama Desert | Chile | ~60MB |
| Ciudad Perdida & Sierra Nevada | Colombia | ~70MB |
| Cocora Valley & Coffee Region | Colombia | ~55MB |
| Galapagos Islands | Ecuador | ~40MB |
| Cotopaxi & Avenue of Volcanoes | Ecuador | ~65MB |
| Chapada Diamantina | Brazil | ~70MB |
| Iguazu & Atlantic Forest | Brazil/Argentina | ~55MB |

**Implementation:**
- New `services/offlineMapsService.ts` — manages Mapbox `OfflineRegion` lifecycle
- Each region defined as: `{ id, name, country, bounds: [sw, ne], minZoom: 8, maxZoom: 15 }`
- Download includes: Mapbox tiles + pre-fetched WDPA parks in bounding box + Overpass trails cached as GeoJSON + curated park descriptions
- Storage: app documents directory
- Progress tracking: download percentage, pause/resume, delete individual regions

**Offline behavior:**
- No network detected → load from cached tiles and bundled GeoJSON
- Park pins, trail lines, basic metadata all work offline
- Network-dependent features (photos, weather, live sightings) show "Offline" badge gracefully

**UI location:** New "Offline Maps" section in Settings tab, browse by country → regions → download

## UX Design

### Curated Destinations

- New horizontal scroll section at the bottom of the map tab, above the tab bar
- Destination cards: hero photo, country flag emoji, park count, trail count
- Destinations: "Patagonia", "Inca Trail & Cusco", "Colombian Highlands", "Galapagos", "Brazilian Chapada", "Atacama Desert"
- Tap → map animates (flyTo) to that region with parks and trails pre-loaded
- Free users see cards and can fly to the region; premium gate triggers on content interaction
- This is the discovery/marketing surface — users who didn't know SA was available will find it here

### Unit Switching

- Auto-detect based on map region: SA → metric (km, meters), US → imperial (miles, feet)
- User can override in Settings with explicit choice: Auto / Imperial / Metric
- Affects: trail distances, elevation displays, campground distances

### Language

- Park/trail names display as-is from data sources (Spanish/Portuguese proper nouns — no translation)
- App UI stays English for Phase 1
- Future: full Spanish (es) and Brazilian Portuguese (pt-BR) localization

### Map Behavior

- Default map center remains US (`39.8283, -98.5795`) for US App Store users
- No region switcher — the map is one continuous global view
- SA park pins use the same visual style as US parks but with a country flag badge
- SA trail lines use the same color coding as US trails
- Zoom thresholds remain the same for all regions

## New Files

- `services/wdpaApi.ts` — WDPA Protected Planet API client
- `services/offlineMapsService.ts` — Mapbox offline region download/management
- `services/regionDetection.ts` — bounding box region detection, unit selection
- `constants/SouthAmericaParks.ts` — curated static JSON of ~300 SA parks with descriptions and photos
- `constants/OfflineRegions.ts` — download region definitions (bounds, names, sizes)
- `constants/Regions.ts` — region bounding boxes, country codes, metric/imperial config
- `components/DestinationCard.tsx` — horizontal scroll destination card
- `components/DestinationsSection.tsx` — destinations carousel for map tab
- `components/OfflineMapsManager.tsx` — Settings tab UI for browsing/downloading offline regions
- `components/PremiumGate.tsx` — reusable SA premium gate overlay (if not already existing)

## Modified Files

- `app/(tabs)/index.tsx` — add region detection, SA data fetching, destinations section, metric units
- `services/preloadService.ts` — add SA park preloading alongside NPS
- `services/trailsApi.ts` — add `highway=track` + `tracktype` tags to Overpass queries
- `services/campgroundsApi.ts` — suppress RIDB enrichment when region is SA (Phase 1 skip)
- `constants/States.ts` → rename to `constants/Regions.ts` or keep and add SA country data alongside
- `app/(tabs)/settings.tsx` or equivalent — add Offline Maps section, unit preference toggle
- `components/LayerPanel.tsx` — no changes needed (layers work the same globally)

## Environment Variables

- `EXPO_PUBLIC_WDPA_API_KEY` — Protected Planet API key (free registration)

## API Rate Limits & Caching Strategy

| Source | Rate Limit | Cache Strategy |
|--------|-----------|----------------|
| WDPA API | Fair use (undocumented) | Pre-fetch per country, AsyncStorage 7-day TTL, static JSON fallback |
| Overpass API | 2 concurrent, 10K sec/day | Same tile cache as US (1x1 degree, 7-day TTL) |
| Mapbox Offline | Per Mapbox plan limits | Tiles stored persistently until user deletes |
| Wikimedia Commons | No auth, ~200 req/s | Cache photo URLs in park static JSON |

## Premium Gate Behavior

| Action | Free User | Subscriber |
|--------|-----------|------------|
| Pan map to SA | Allowed — sees pins | Allowed |
| See trail lines on map | Allowed | Allowed |
| Tap SA park → detail sheet | Paywall | Full detail |
| Tap SA trail → detail sheet | Paywall | Full detail |
| Download offline region | Paywall | Download starts |
| Destinations cards | Visible, fly-to works | Full access |
| US content | Unchanged (free tier limits apply) | Unchanged |

## Success Criteria

- All 6 countries show park pins when user pans to SA
- Trail lines render in all 6 countries at appropriate zoom
- Free users see SA content on map but hit paywall on interaction
- Subscribers can tap into full park and trail details
- At least 3 offline regions downloadable and functional without network
- Unit switching works correctly (metric in SA, imperial in US)
- No regression to existing US functionality

## Out of Scope (Phase 2+)

- Campgrounds via iOverlander
- Wildlife sightings via iNaturalist API
- Birding hotspots via eBird API
- Spanish/Portuguese UI localization
- User-submitted SA sightings (Firebase)
- SA restaurant/amenity recommendations
- Campground reservation links
- Additional countries beyond the 6 launch countries