I now have a thorough understanding of the codebase. Let me produce the comprehensive plan.

---

# NatureFind: Product & Technical Implementation Plan

**Document Version:** 1.0  
**Date:** March 10, 2026  
**Stack Baseline:** Expo SDK 54, React Native 0.81.5, expo-router, Firebase (Firestore + Auth + Storage), Mapbox, react-native-maps, OSM/Overpass, NPS API, RIDB API, Open-Meteo, Geoapify

---

## 1. Executive Summary

**Positioning Statement:** NatureFind is the only outdoor app that unifies trails, campgrounds, wildlife, and trip planning in a single map — giving every outdoor enthusiast a contextual, community-powered guide to America's wild places, with no paywalled conditions data and no ecosystem silos.

**The Three Strategic Pillars**

**Pillar 1 — The Integration Moat.** Every competitor owns one category: AllTrails owns trails, The Dyrt owns campground reviews, iNaturalist owns species data, Recreation.gov owns federal booking. NatureFind's advantage is that none of these things happen in isolation on a real trip. The "near this campground" cross-layer is not a feature — it is the entire product thesis.

**Pillar 2 — Community as Infrastructure, Not as Upsell.** AllTrails put condition reports behind a paywall and created a loyalty backlash. NatureFind commits permanently to free community data — conditions, sightings, campground corrections — while monetizing on planning tools and offline access. Community data freely available makes the product better for every user, which drives more community, which widens the moat.

**Pillar 3 — Earn the Trip, Not Just the Discovery.** Showing a park on a map is a commodity. Walking a user from "I want to go camping in June" through campground selection, trail discovery, wildlife seasonality, and a booking link earns real retention. The trip planner workflow is the north-star product experience that every Phase 2 feature feeds.

---

## 2. Lessons Learned from Competitive Analysis

**AllTrails (60M users, $80/yr)**
- Teaches: Review depth and trail polylines build strong retention. Scale creates a near-unassailable data network effect on popular trails.
- Mistake to avoid: Paywalling condition reports alienated loyal users who were the primary source of that data. Never put community-generated content behind a paywall. Pricing at $80/yr creates price sensitivity at the top of the market — $34.99 is a meaningful opening.

**The Dyrt (45K reviewed campgrounds)**
- Teaches: Deep campground reviews with amenity-level specificity (site-level electric, shade, pull-through) create strong word-of-mouth among RV and car-camping communities.
- Mistake to avoid: Being campground-only means users must context-switch to a second app to plan trails and wildlife. NatureFind's RIDB campsites data (already built in `ridbApi.ts`) is competitive — the missing piece is the cross-layer contextual panel.

**Hipcamp**
- Teaches: Private land inventory is a real gap in the public-lands ecosystem. Affiliate deep-links rather than operating a booking platform is the right posture for an app without booking operations.
- Mistake to avoid: Their booking-first UX obscures discovery. NatureFind should link to Hipcamp for private lands but not replicate the booking interface.

**iNaturalist (300M observations)**
- Teaches: Scientific rigor and a genuinely open Computer Vision API create enormous trust. Their seasonal data by bounding box is real infrastructure.
- Mistake to avoid: iNaturalist's UX is built for citizen scientists, not casual hikers. Their map context is poor. This is the gap NatureFind fills — iNaturalist observations surfaced in a trail/campground context.

**Recreation.gov**
- Teaches: Federal campsite booking data is extremely detailed through the RIDB API (already integrated in `ridbApi.ts` — `reservationUrl` field exists on `RidbFacility`). The federal system has monopoly coverage.
- Mistake to avoid: Recreation.gov's native UX is universally criticized. Deep-linking into their booking flow at a specific facility with a prefilled date is far better than asking users to navigate it themselves.

**Seek / iNaturalist Camera**
- Teaches: Real-time computer vision species ID from a camera is a compelling and memorable feature that drives downloads and social sharing.
- Mistake to avoid: Seek has no map context and no trip planning. The species ID camera is a hook, not a product. NatureFind uses it as an entry point into the sighting submission flow.

**Gaia GPS ($90/yr)**
- Teaches: Serious backcountry users pay for offline maps and navigation. The market exists and is willing to pay.
- Mistake to avoid: Gaia's UX is functional but dense, and $90/yr triggers pricing backlash. Their weakness is community and social content. NatureFind's offline pack model (trip-scoped bundles) is more approachable than a full topo-map download model.

**Apple Maps iOS 18 (entering trails)**
- Teaches: Platform-level competition is coming. Apple can surface AllTrails-style trail data natively.
- Mistake to avoid: Competing head-on with Apple on basic trail display. NatureFind must win on depth (cross-layer context, conditions, wildlife, booking) that Apple Maps cannot provide through a native maps integration.

---

## 3. Feature Roadmap

### Phase 1: MVP Improvements (0–8 Weeks)

High impact, low engineering effort. These features either wire up existing data/architecture to new surfaces or fill small holes in the current UX.

---

#### Feature 1.1 — Campground Booking Deep-Links

**What it is and why:** The `RidbFacility` type in `ridbApi.ts` already has a `reservationUrl` field fetched from the RIDB API. This reservation URL is never surfaced to the user in the current campground detail sheet. Recreation.gov facility URLs follow a predictable pattern (`https://www.recreation.gov/camping/campgrounds/{facilityId}`). Adding a "Reserve a Site" button to the campground detail sheet is extremely high leverage for zero additional API cost.

**User Story:** As a camper viewing Yosemite Valley Campground, I want to tap "Reserve a Site" and be taken directly to Recreation.gov's booking page for that facility, so I don't have to hunt for the booking link separately.

**Technical Approach:** In the campground detail bottom sheet rendered in `/app/(tabs)/index.tsx`, add a conditional `Pressable` that calls `Linking.openURL(ridbFacility.reservationUrl)` when `ridbFacility.reservationUrl` is non-null. For campgrounds that have OSM data but no matched RIDB facility, generate a search deep-link: `https://www.recreation.gov/search?q={campgroundName}`. For Hipcamp, generate a search URL using the campground's lat/lon: `https://www.hipcamp.com/en-US/s?lat={lat}&lng={lon}`. Tag outbound Hipcamp links with the affiliate parameter when the affiliate program is established.

**APIs/Services Involved:** RIDB API (already integrated), `Linking.openURL` (already used in codebase for Apple Maps directions), Hipcamp affiliate program (apply separately).

**Dependencies:** RIDB enrichment data already loads on campground tap (visible in the `ridbCache` state in `index.tsx`). No new API integration required.

**Success Metric:** 15%+ of campground detail opens result in a booking deep-link tap within 8 weeks of launch.

**Effort:** S

---

#### Feature 1.2 — Trail Condition Reports on Trail Detail Sheets

**What it is and why:** Condition reports (`ConditionReportDoc` in `firebase.ts`) already exist and are rendered in the park detail screen at `/app/park/[id].tsx`. The trail detail bottom sheet in `index.tsx` does not yet show or allow submitting condition reports. AllTrails put this behind a paywall; NatureFind makes it free. This is the single most-cited missing feature from AllTrails user reviews.

**User Story:** As a hiker who just completed a trail and found a downed tree blocking the path, I want to quickly submit a condition update — trail status, crowding, access notes — so future hikers know before they drive two hours.

**Technical Approach:** The `ConditionReportForm` component already exists and accepts `trailStatus`, `wildlifeActivity`, `crowding`, and `accessNotes`. Extend the `ConditionReportDoc` Firestore type with a `trailId` field (the OSM way ID) alongside the existing `parkCode` path. Create a new Firestore top-level collection `trailConditions/{trailId}/reports/{reportId}` (mirroring the pattern in `parks/{parkCode}/conditionReports/{reportId}`). Wire the existing `ConditionReportForm` component into the trail detail sheet. Display the most recent 3 reports with `timeAgo()` timestamps — this function already exists in `index.tsx`. Add Firestore rules for the new collection mirroring the existing condition report rules.

**APIs/Services Involved:** Firebase Firestore (existing), `ConditionReportForm` component (existing, zero modification needed).

**Dependencies:** Requires a new Firestore collection + matching security rules. No new third-party APIs.

**Success Metric:** Average of 1+ condition reports per trail with 10+ views within 30 days of launch.

**Effort:** S

---

#### Feature 1.3 — "Near This Campground" Cross-Layer Panel

**What it is and why:** The most important cross-layer feature in the product. When a user taps a campground, the bottom sheet should show the nearest trails, recent wildlife sightings, and any active NPS alerts — all scoped to a configurable radius. This is the core product thesis made tangible.

**User Story:** As a family planning a camping weekend, I open a campground's detail sheet and immediately see: "3 easy trails within 2 miles," "Bald Eagle sighted 0.8 miles away 2 days ago," and "Bear activity alert at adjacent park." I can plan my entire trip from one screen.

**Technical Approach:** When a campground is selected (`selectedCampground` state in `index.tsx`), compute a bounding box centered on the campground's lat/lon with a configurable radius (default 5 miles, ~0.07 degrees). Query the already-loaded `trails` and `trailPreviews` arrays for items within this bounding box using the `haversineDeg` function that already exists in `index.tsx`. Query the already-loaded `sightings` array similarly. For NPS alerts, call the existing `fetchParkAlerts` from `npsApi.ts` using the nearest park code (derivable from the RIDB facility's org code or by spatial proximity to the already-loaded `parks` array). Render results in a horizontally-scrollable chip row in the campground sheet: "Trails (3)", "Sightings (7)", "Alerts (1)". Tapping a chip expands a mini-list inline. Tapping a list item closes the campground sheet and pans the map to the selected feature.

**APIs/Services Involved:** All data already in app state (trails, sightings, parks arrays). NPS alerts API (already in `npsApi.ts`). Zero new external API calls.

**Dependencies:** Campground must already be selected and RIDB enrichment loaded. Relies on `haversineDeg`, trail/sighting arrays being populated for the viewport.

**Success Metric:** Campground session depth (time between campground tap and app close) increases 40%+ vs. baseline.

**Effort:** M

---

#### Feature 1.4 — Species ID Camera via iNaturalist Computer Vision API

**What it is and why:** Users currently submit sightings by manually selecting a category and scrolling a species list in `submit.tsx`. Adding a "Identify from Photo" button that calls the iNaturalist Computer Vision API with the selected photo returns ranked species suggestions. This turns sighting submission from a data-entry chore into a delightful experience and is the feature most likely to drive social sharing ("I used NatureFind to ID a bird!").

**User Story:** As a hiker who just photographed an unfamiliar bird, I tap "Identify Species" in the sighting submission form, the camera (or photo picker) activates, and within 3 seconds NatureFind shows me "Likely: Steller's Jay (87% confidence)" with a button to use that suggestion.

**Technical Approach:** In `submit.tsx`, after the user selects a photo via the existing `expo-image-picker` flow, add an "Identify from Photo" button. POST the image as multipart/form-data to `https://api.inaturalist.org/v1/computervision/score_image` — this endpoint is public, requires no API key for basic use, and returns a ranked list of taxa with common names, scientific names, Wikipedia summaries, and confidence scores. Map the returned taxon `iconic_taxon_name` to the existing `SPECIES_CATEGORIES` array (e.g., `Aves` → `bird`, `Mammalia` → `mammal`). Pre-fill `selectedCategory` and `selectedSpecies` with the top suggestion. Show the top 3 suggestions with confidence percentages so the user can correct if needed. Store the iNaturalist taxon ID in the `SightingDoc` as an optional `taxonId` field for future cross-referencing.

**APIs/Services Involved:** iNaturalist Computer Vision API (`api.inaturalist.org/v1/computervision/score_image`, free, no key for basic use), `expo-image-picker` (already installed).

**Dependencies:** Photo must be taken or selected first. The existing photo selection flow in `submit.tsx` is the entry point.

**Success Metric:** 60%+ of sightings submitted with a photo use the species ID feature. iNaturalist match rate (top suggestion accepted without modification) above 70%.

**Effort:** M

---

#### Feature 1.5 — Seasonal Wildlife Intelligence Panel

**What it is and why:** The iNaturalist API has an `/observations` endpoint filterable by bounding box, taxon, and month. Surfacing "What wildlife is typically seen in this area this time of year?" on the park detail screen transforms a static NPS data page into a living, seasonally-aware guide.

**User Story:** As a photographer planning a July trip to Yellowstone, I open the park detail screen and see a "Wildlife This Month" section showing Grizzly Bear (312 observations in July, iNaturalist), Bald Eagle (88 obs), Osprey (54 obs) — with last-week sighting counts from NatureFind's own community data.

**Technical Approach:** Create a `services/iNaturalistApi.ts` module. The iNaturalist `/v1/observations` endpoint accepts `lat`, `lng`, `radius` (km), `month` (1–12), `order_by=votes`, and `per_page` params. Make the call from the park detail screen (`/app/park/[id].tsx`) using the park's lat/lon and `new Date().getMonth() + 1`. Merge results with NatureFind's own `getSightings(parkCode)` data, deduplicating by species common name. Display as a horizontally-scrollable species card row: species photo thumbnail (from iNaturalist taxon photos), common name, observation count badge, last-seen-in-app indicator. Cache responses in AsyncStorage with a 24-hour TTL and a month-scoped cache key so July's data is not re-fetched on every park open.

**APIs/Services Involved:** iNaturalist Observations API (free, 100 req/min unauthenticated), existing `getSightings` Firebase function, AsyncStorage (already used for spatial tile cache).

**Dependencies:** Park lat/lon from NPS API (already available in `Park` type). Park detail screen must be open.

**Success Metric:** 25%+ of park detail opens scroll to the wildlife panel. iNaturalist section drives 10%+ increase in sighting submissions from the same park visit.

**Effort:** M

---

#### Feature 1.6 — Family/Accessibility Cross-Layer Filter

**What it is and why:** "Easy trails, dog-friendly, with restrooms at the campground" is the #1 search pattern for family outdoor trips. No competitor offers this as a unified cross-layer filter. The data is already in the app — trail difficulty from `trailsApi.ts` (`dogFriendly` field, `difficulty: "easy"`), campground amenities from `campgroundsApi.ts` (`toilets`, `showers` fields).

**User Story:** As a parent planning a day hike with a toddler and a dog, I tap "Family Mode" in the layer panel and the map instantly dims all trails except easy + dog-friendly ones, and highlights campgrounds that have toilets. I find an appropriate option in under 30 seconds.

**Technical Approach:** Add a "Filters" section to `LayerPanel.tsx` with a set of pre-composed filter presets: "Family" (easy trails + dog-friendly + toilets at campground), "Accessible" (OSM `wheelchair=yes` on trails + ADA campsite available from RIDB), "Dog-Friendly" (dog-friendly trails only), "Free Camping" (fee=false campgrounds). Store active filter preset in a `activeFilter` state in `index.tsx`. Apply filter predicates in the `useMemo`-derived display arrays for trails and campgrounds. The `LayerConfig` type in `LayerPanel.tsx` already supports `extra` and `alwaysShowExtra` props — use these to render the filter chips inline within the relevant layer rows.

**APIs/Services Involved:** All local data already loaded. No new API calls.

**Dependencies:** Trail `dogFriendly` field and campground `toilets`/`fee` fields must be populated (they are, as boolean|null, where null means unknown). Filter chips should show a "Limited data" indicator when null is common for the current viewport.

**Success Metric:** 20%+ of active sessions engage the filter panel when it contains active presets. Family filter results in 35%+ longer session vs. no filter (higher confidence → more exploration).

**Effort:** S

---

### Phase 2: Core Differentiation (8–20 Weeks)

These features build the moat — they are harder to replicate, require new services or significant new data, and directly support the NatureFind+ paid tier.

---

#### Feature 2.1 — Trip Planner Workflow

**What it is and why:** The north-star product experience. A guided workflow: pick dates → choose a base campground → discover nearby trails → review wildlife seasonality → tap to book. This is the feature that transforms NatureFind from a discovery tool into a planning tool, which dramatically increases booking intent and session depth.

**User Story:** As a couple planning a 3-day summer camping trip, I tap "Plan a Trip," enter June 14–17, set my location, and NatureFind shows me 5 available campgrounds within 2 hours sorted by match score (nearby easy trails, high wildlife activity in June, has showers). I choose one, see its trails and expected wildlife, and tap "Reserve" to go to Recreation.gov with the dates pre-filled in the URL.

**Technical Approach:** Create a new screen `/app/trip/planner.tsx` accessible from the Favorites tab (which already has the `optimizeTrip` multi-park routing function from `mapboxRoutingApi.ts`). The planner is a multi-step wizard using expo-router's stack navigation:
- Step 1: Date range picker (two calendar pickers, stored in trip context)
- Step 2: Home location + drive-time radius (use existing Mapbox Isochrone API — `fetchIsochrone` already exists in `mapboxRoutingApi.ts`)
- Step 3: Campground selection from results filtered by drive-time isochrone, sorted by a composite "trip score" (trail count nearby + wildlife observations in target month from iNaturalist + amenity score from RIDB)
- Step 4: Trail picker using the existing "near this campground" cross-layer logic from Feature 1.3
- Step 5: Summary with booking deep-links

Persist the trip as a Firestore document under `users/{uid}/trips/{tripId}` with a simple schema: `{campgroundId, dates, selectedTrailIds[], iNaturalistBbox, createdAt}`. This enables the Phase 2 "Trip Packs" offline download feature to know what to cache.

**APIs/Services Involved:** Mapbox Isochrone (existing `fetchIsochrone`), RIDB (existing), iNaturalist Observations (from Feature 1.5), Recreation.gov deep-links (from Feature 1.1), Firebase Firestore (existing).

**Dependencies:** Features 1.1, 1.3, and 1.5 should be shipped first. Isochrone + RIDB enrichment + iNaturalist seasonal data must all be working.

**Success Metric:** Trip planner completion rate (step 1 to booking tap) above 30%. Users who complete a trip plan have 4x higher 30-day retention than those who don't.

**Effort:** XL

---

#### Feature 2.2 — Offline Trip Packs (NatureFind+ Feature)

**What it is and why:** The existing spatial tile cache in `spatialCache.ts` uses AsyncStorage with 1-degree tiles and a 7-day TTL for trails and 3-day TTL for campgrounds. This is a passive, viewport-reactive cache. An "Offline Trip Pack" is a user-initiated download of everything needed for a specific trip: all trail polylines in a bbox, all campground details + RIDB campsites, iNaturalist species images, NPS park data, weather forecast, and Mapbox vector tiles for the area. This is a NatureFind+ exclusive feature.

**User Story:** As a hiker heading into a canyon with no signal, I tap "Download Trip Pack" on my saved trip two days before departure. NatureFind downloads all trail polylines, campground details, species ID reference images, and 7-day forecasts for the area. I can use the full app offline including the species ID camera (local model).

**Technical Approach:** 
- **Pack Definition:** A trip pack is a bbox (derived from trip planner), campground IDs, trail IDs, and a date. Stored under `users/{uid}/trips/{tripId}/pack`.
- **Download Orchestration:** A `services/offlinePacks.ts` module orchestrates pre-fetching: (1) call `fetchTrails` for the entire bbox and persist to AsyncStorage with an extended 30-day TTL, (2) call `fetchCampgrounds` and `fetchRidbEnrichment` for all campgrounds in bbox, (3) pre-fetch iNaturalist taxon photos for the expected species list, (4) pre-fetch Open-Meteo 7-day forecast for the campground lat/lon, (5) use Mapbox's offline packs API for vector tile storage (Mapbox SDK supports offline regions natively via `MapboxGL.offlineManager`).
- **Gating:** Wrap pack download initiation in a subscription check against a `users/{uid}/subscription` Firestore document. Free users see the UI but hit a paywall prompt.
- **Species ID Offline:** iNaturalist publishes a small (~50MB) computer vision model for offline use. Evaluate `react-native-fast-tflite` or `expo-modules` for on-device inference as a future enhancement; for the initial version, cache the API response for the geographic area's top 50 species, so the camera still works with a warm cache.

**APIs/Services Involved:** All existing APIs (pre-fetched to AsyncStorage), Mapbox offline regions API (`MapboxGL.offlineManager`), Firebase Firestore for pack metadata.

**Dependencies:** Trip planner (Feature 2.1) provides the bbox. Subscription check infrastructure (Feature 2.3). `spatialCache.ts` is the existing cache layer that will be extended.

**Success Metric:** Offline pack download-to-use rate above 60% (pack was downloaded and then accessed offline). This is the primary NatureFind+ retention driver — subscribers who download packs have near-zero churn.

**Effort:** L

---

#### Feature 2.3 — Subscription Infrastructure (NatureFind+ at $34.99/yr)

**What it is and why:** The revenue backbone. Expo + React Native supports in-app purchases via `expo-iap` (the maintained community fork of `react-native-iap`) or via RevenueCat's React Native SDK, which handles receipt validation, entitlement management, and A/B pricing without custom server logic.

**User Story:** As a NatureFind power user who relies on offline packs and trail condition alerts, I tap "Go Premium" and subscribe for $34.99/yr. My NatureFind+ badge appears on my profile, offline packs unlock, and I start receiving push notifications for condition report updates on my saved trails.

**Technical Approach:** 
- Integrate RevenueCat SDK (`@revenuecat/purchases-react-native`). RevenueCat abstracts StoreKit 2 on iOS and Google Play Billing on Android.
- Create a `context/SubscriptionContext.tsx` that wraps the app and exposes `isPro: boolean` and `purchasePro: () => Promise<void>`.
- Set up a single iOS product ID: `com.finn581.parkfinder.pro_annual` priced at $34.99/yr.
- Add a Firestore webhook via RevenueCat's event streams to write `users/{uid}/subscription: { tier: "pro", expiresAt, productId }` on purchase, which allows Firestore rules to gate Pro features server-side.
- Gate features: offline pack download, species ID camera (after initial 5 free uses), condition alerts push notifications, trip planner save (allow planning for free, require Pro to save/share).

**APIs/Services Involved:** RevenueCat SDK, StoreKit 2 (iOS), Firebase Firestore, Firebase Cloud Messaging for push notifications.

**Dependencies:** Must be in place before any Pro feature ships. Apple App Store review requires all IAP to be present in the binary before paywall UX is shown.

**Success Metric:** 2% of MAU convert to paid within 90 days of launch. $34.99 annual at 2% of 50K MAU = ~$35K ARR baseline.

**Effort:** M

---

#### Feature 2.4 — Trail Condition Push Alerts (NatureFind+ Feature)

**What it is and why:** AllTrails charges $80/yr partly on the promise of condition alerts. NatureFind can deliver this at $34.99/yr. The `ConditionReportDoc` type and collection already exist in Firestore. The missing piece is a Firebase Cloud Function that watches for new condition reports on trails the user has saved, and sends a push notification.

**User Story:** As a hiker who saved the Highline Trail last month, I receive a push notification on Tuesday: "Trail Update: Highline Trail — Crowded, Trail closed beyond Granite Park Chalet due to snow. Reported 2 hours ago." I cancel my Saturday permit request before it processes.

**Technical Approach:** 
- A Firebase Cloud Function (`functions/onConditionReport.ts`) triggers on `onCreate` of `trailConditions/{trailId}/reports/{reportId}` (new Firestore collection from Feature 1.2).
- The function queries a `savedTrails` subcollection (`users/{uid}/savedTrails/{trailId}`) to find all Pro subscribers who saved that trail.
- It sends an FCM push notification via `firebase-admin` to each user's device token (stored in `users/{uid}/fcmToken`).
- On the client, add `expo-notifications` with a background handler that routes the notification to the trail detail sheet.
- Device token registration happens on Pro subscription activation.

**APIs/Services Involved:** Firebase Cloud Functions, Firebase Cloud Messaging, `expo-notifications` (new dependency).

**Dependencies:** Feature 1.2 (trail condition reports as a Firestore collection), Feature 2.3 (subscription gating), trail save feature (new small feature: "Save Trail" alongside existing "Save Park").

**Success Metric:** Push notification open rate above 25% (outdoor-category benchmark). Users who receive at least one condition alert have 60%+ better 6-month retention.

**Effort:** M

---

#### Feature 2.5 — Deep iNaturalist Integration: Sync Sightings Bidirectionally

**What it is and why:** iNaturalist has 300M observations. Rather than just pulling seasonal intelligence (Feature 1.5), NatureFind can become an iNaturalist client for field use, letting users post observations to iNaturalist from the NatureFind sighting submission flow — and vice versa, pulling iNaturalist observations onto the map as a separate layer.

**User Story:** As a birder who also uses iNaturalist, I submit a Steller's Jay sighting in NatureFind and check "Also post to iNaturalist." My observation appears in both apps, and my iNaturalist profile counts it. Other NatureFind users see it on the map.

**Technical Approach:** 
- iNaturalist has an OAuth 2.0 API with a mobile app grant. Add iNaturalist as a third auth option or a linked-accounts flow in the Profile tab.
- The `POST /v1/observations` endpoint accepts the same fields as the NatureFind `SightingDoc` (lat, lon, taxon_id, description, photos). On sighting submission in `submit.tsx`, if the user is iNaturalist-linked, POST in parallel to both Firebase and iNaturalist.
- For the incoming direction, add an "iNaturalist" toggle to the map layer panel. When active, call `GET /v1/observations?lat={lat}&lng={lng}&radius={r}&per_page=50` and render observations as a separate GeoJSON layer on the Mapbox map, distinct from NatureFind community sightings.

**APIs/Services Involved:** iNaturalist OAuth API, iNaturalist Observations API (both directions), Firebase (existing).

**Dependencies:** Species ID camera (Feature 1.4) provides the taxon_id needed for iNaturalist observation creation. iNaturalist app registration required (apply at inaturalist.org).

**Success Metric:** 15%+ of sighting submissions opt-in to iNaturalist sync when the user is linked. iNaturalist layer enabled by 10%+ of users who view the layer panel.

**Effort:** L

---

#### Feature 2.6 — State Park and Land Manager API Integration

**What it is and why:** The NPS API covers ~430 federal sites. America has over 10,000 state parks. Several state systems have APIs or open data (California (CDFW), Colorado Parks & Wildlife, New York State Parks). Campground booking for state parks often goes through ReserveAmerica (`reserveamerica.com`) or Reserve California (`reservecalifornia.com`). Adding state-level booking deep-links dramatically increases the addressable market.

**User Story:** As a California hiker, I open a campground at Yosemite State Campground (not NPS-managed), and NatureFind shows a "Reserve at Reserve California" button that opens with the campground pre-selected.

**Technical Approach:** Build a `services/stateParkBooking.ts` module that maps campground operator names (available in the OSM `operator` tag on the `Campground` type) to booking URL patterns:
- `operator: "California State Parks"` → `https://www.reservecalifornia.com/Web/Default.aspx#!park/{operatorId}`
- `operator: "ReserveAmerica"` → `https://www.reserveamerica.com/explore/search-results?searchTabGroupId=ALL&...`
- Standard pattern: `https://reserveamerica.com/camping/campgrounds/{slug}`
Build a lookup table of operator-to-URL patterns. This requires no new API and is a pure data curation task (20–30 major operators cover 80% of state campgrounds). Use Geoapify (already integrated) to do place-name disambiguation when operator names are ambiguous.

**APIs/Services Involved:** OSM operator tags (existing), ReserveAmerica URL patterns, Reserve California URL patterns, Geoapify (existing).

**Dependencies:** Campground operator data quality in OSM. May require manual data augmentation for common operators.

**Success Metric:** State park booking deep-links available for 40%+ of campgrounds in top-5 states (CA, CO, NY, WA, OR) within 10 weeks.

**Effort:** M

---

### Phase 3: Platform Expansion (20–40 Weeks)

High-effort features that require significant infrastructure, new capabilities, or platform changes.

---

#### Feature 3.1 — Android Support

See dedicated Android Expansion Plan section (Section 8) for full detail.

**Effort:** XL (estimated 8–12 weeks of engineering, including QA)

---

#### Feature 3.2 — Full Offline Topo Maps (NatureFind+ Flagship)

**What it is and why:** Gaia GPS charges $90/yr primarily for offline topo maps. NatureFind can offer offline maps scoped to a trip area at $34.99/yr, which is a compelling value proposition for backcountry users.

**Technical Approach:** 
- Mapbox's offline regions API (`MapboxGL.offlineManager.createPack`) already supports offline vector tile download for a bbox with a min/max zoom level. This gives you the base map offline.
- For topo elevation contours: USGS publishes national elevation data. Mapbox's Terrain v2 tileset includes contour lines as a vector tileset (`mapbox.mapbox-terrain-v2`). Including this tileset in the offline pack download covers the topo use case.
- Estimated tile pack size: a 50km x 50km area at zoom levels 8–16 = approximately 30–80MB depending on terrain complexity. This is manageable.
- Surface the download size estimate in the trip planner before the user confirms the download.

**APIs/Services Involved:** Mapbox offline regions API, Mapbox Terrain v2 tileset, existing `spatialCache.ts` for non-tile data.

**Dependencies:** Feature 2.2 (offline trip packs) is the foundation. Topo maps extend the pack with additional Mapbox tilesets.

**Success Metric:** Users who download a topo pack have a 25%+ higher NatureFind+ renewal rate.

**Effort:** L

---

#### Feature 3.3 — Ranger/Guide B2B Tier

**What it is and why:** Park rangers, wilderness guides, and outdoor educators need the same cross-layer data as consumers, plus bulk access, team sharing, and data export. At $9.99/mo per seat, a 10-person guide company generates $1,188/yr — 34x the consumer subscription value.

**Technical Approach:** 
- Add an `organization` concept to Firestore: `organizations/{orgId}` with `seats`, `memberUids[]`, `subscriptionTier: "ranger"`.
- Ranger tier unlocks: (1) CSV export of sightings/condition reports for a geographic area, (2) team-shared trip plans (multiple users can view/edit a trip), (3) branded "Field Guides" — curated collections of trails + campgrounds + wildlife species for a specific park, shareable as a deep link, (4) offline pack pre-download for clients before guided trips.
- B2B onboarding: invite flow via email link (Firebase Dynamic Links), team admin dashboard (a web view in React Native via `expo-web-browser`).

**APIs/Services Involved:** Firebase Firestore (organization data), RevenueCat (B2B billing via Stripe integration), Firebase Dynamic Links for team invite.

**Dependencies:** Feature 2.3 (subscription infrastructure). This is a superset of the Pro tier.

**Success Metric:** 50 paying B2B accounts within 6 months of launch. NPS and state park partnerships as distribution channel.

**Effort:** XL

---

#### Feature 3.4 — Permit Integration (National Park Permit Deep-Links)

**What it is and why:** Popular trailheads (Half Dome, Angels Landing, Enchantments) require timed entry permits that sell out in minutes on Recreation.gov. A NatureFind feature that surfaces permit availability and deep-links to the permit purchase flow (with reminder notifications for opening days) would be uniquely valuable and extremely viral.

**Technical Approach:** 
- Recreation.gov RIDB API includes permit facilities under `facility_type: "Permit"`. Build a permit layer that surfaces permit facilities as a distinct map layer with a "Permit Required" badge.
- For each permit facility, show: quota window, cost, permit dates, link to booking.
- Add push notifications for permit opening dates (a Firebase scheduled function runs nightly, checks upcoming permit release dates from RIDB, and pushes alerts to users who saved the relevant park).

**APIs/Services Involved:** RIDB API (existing — permit facilities), Firebase Cloud Functions (scheduled), Firebase Cloud Messaging (existing from Feature 2.4).

**Dependencies:** Feature 2.4 (push notification infrastructure).

**Success Metric:** Permit feature drives 20%+ of new installs from organic SEO/App Store search for "Half Dome permit" and similar searches.

**Effort:** L

---

## 4. Implementation Checklist

### Phase 1 Checklist (Weeks 1–8)

**Feature 1.1 — Campground Booking Deep-Links**
- [ ] Add "Reserve a Site" button to campground detail sheet, wiring to `ridbFacility.reservationUrl`
- [ ] Add fallback Recreation.gov search deep-link for campgrounds without RIDB match
- [ ] Add Hipcamp search deep-link with lat/lon for non-federal campgrounds
- [ ] Apply for Hipcamp affiliate program
- [ ] Add affiliate parameter to Hipcamp links once approved
- [ ] Add analytics event tracking for booking deep-link taps
- [ ] Manual QA: test 10 Recreation.gov campgrounds, 5 Hipcamp campgrounds

**Feature 1.2 — Trail Condition Reports**
- [ ] Create `trailConditions/{trailId}/reports` Firestore collection
- [ ] Add `trailId` field to `ConditionReportDoc` interface
- [ ] Add Firestore security rules for `trailConditions` collection
- [ ] Wire `ConditionReportForm` into trail detail bottom sheet
- [ ] Add "Submit Condition" button to trail detail sheet (auth-gated)
- [ ] Display 3 most recent condition reports in trail sheet with `timeAgo` labels
- [ ] Add "Trail Conditions" to Firebase `firebase.ts` with `addTrailConditionReport` and `getTrailConditionReports` functions
- [ ] Manual QA: submit condition report, verify display, verify Firestore write

**Feature 1.3 — "Near This Campground" Cross-Layer Panel**
- [ ] Implement `getNearbyCampgroundContext(campground, trails, sightings, parks, radiusMiles)` utility in `utils/`
- [ ] Add "Nearby" section to campground detail bottom sheet
- [ ] Render horizontally-scrollable chips: "Trails (N)", "Sightings (N)", "Alerts (N)"
- [ ] Implement expand-on-tap mini-list for each chip
- [ ] Implement "tap to navigate" — close campground sheet and pan map to selected feature
- [ ] Fetch NPS alerts for nearest park when campground is selected
- [ ] Manual QA: test at 5 campgrounds near known parks with trails and sightings

**Feature 1.4 — Species ID Camera**
- [ ] Create `services/iNaturalistApi.ts` with `scoreImage(base64: string)` function
- [ ] Wire "Identify from Photo" button in `submit.tsx` after photo selection
- [ ] Map iNaturalist `iconic_taxon_name` to NatureFind `SPECIES_CATEGORIES` IDs
- [ ] Pre-fill `selectedCategory` and `selectedSpecies` from top suggestion
- [ ] Display top 3 suggestions with confidence scores, allow user to pick any
- [ ] Add optional `taxonId: number` field to `SightingDoc` interface in `firebase.ts`
- [ ] Add loading state during API call with a spinner on the photo thumbnail
- [ ] Manual QA: test 20 species photos across categories, verify match rate

**Feature 1.5 — Seasonal Wildlife Intelligence Panel**
- [ ] Create `services/iNaturalistApi.ts` (shared with Feature 1.4) with `getSeasonalObservations(lat, lon, radiusKm, month)` function
- [ ] Add "Wildlife This Month" section to park detail screen (`park/[id].tsx`)
- [ ] Implement AsyncStorage cache with 24h TTL and month-scoped key
- [ ] Render species cards: taxon photo, common name, observation count
- [ ] Merge with NatureFind's own `getSightings(parkCode)` data
- [ ] Add "N sightings reported in NatureFind" sub-count for cross-promoted species
- [ ] Manual QA: test at 5 parks in different months, verify seasonal variation

**Feature 1.6 — Family/Accessibility Filters**
- [ ] Add filter preset state (`activeFilterPreset`) to map tab state
- [ ] Implement `applyFilterPreset(trails, campgrounds, preset)` utility function
- [ ] Add "Filters" section to `LayerPanel.tsx` using existing `extra` prop pattern
- [ ] Build preset chips: "Family," "Dog-Friendly," "Accessible," "Free Camping"
- [ ] Apply filter to trail and campground display arrays via useMemo
- [ ] Show "Limited data" indicator when >40% of results have null values for filter criteria
- [ ] Manual QA: test each preset in 3 different viewport areas

### Phase 2 Checklist (Weeks 9–20)

**Infrastructure**
- [ ] Set up RevenueCat account, create `com.finn581.parkfinder.pro_annual` product in App Store Connect
- [ ] Integrate `@revenuecat/purchases-react-native` SDK
- [ ] Create `context/SubscriptionContext.tsx` with `isPro` and `purchasePro`
- [ ] Create `users/{uid}/subscription` Firestore document on purchase via RevenueCat webhook
- [ ] Update Firestore rules to gate Pro features
- [ ] Build "Go Premium" paywall screen accessible from gated features

**Feature 2.1 — Trip Planner**
- [ ] Create `/app/trip/planner.tsx` multi-step wizard screen
- [ ] Build date range picker (Step 1)
- [ ] Integrate isochrone API for drive-time radius (Step 2)
- [ ] Build campground scoring + sort algorithm (Step 3)
- [ ] Build trail picker using cross-layer context logic (Step 4)
- [ ] Build booking summary with deep-links (Step 5)
- [ ] Create `users/{uid}/trips/{tripId}` Firestore schema
- [ ] Add "Plan a Trip" entry point to Favorites tab and park detail screen
- [ ] Manual QA: end-to-end trip plan from map to booking link

**Feature 2.2 — Offline Trip Packs (NatureFind+)**
- [ ] Create `services/offlinePacks.ts` with `downloadTripPack(tripId)` and `deleteTripPack(tripId)` functions
- [ ] Implement `MapboxGL.offlineManager.createPack` for bbox at zoom 8–16
- [ ] Extend `spatialCache.ts` to support 30-day TTL for pack-scoped tiles
- [ ] Pre-fetch RIDB enrichment for all campgrounds in bbox
- [ ] Pre-fetch 7-day Open-Meteo forecast for campground coordinates
- [ ] Pre-fetch iNaturalist top-50 species photos for bbox + month
- [ ] Gate pack download behind `isPro` check
- [ ] Show download size estimate and progress indicator
- [ ] Add "My Packs" section to Favorites/Profile tab
- [ ] Manual QA: download pack, toggle airplane mode, verify full functionality offline

**Feature 2.4 — Trail Condition Push Alerts (NatureFind+)**
- [ ] Add `expo-notifications` dependency and configure push tokens
- [ ] Store `users/{uid}/fcmToken` on notification permission grant
- [ ] Create `savedTrails` subcollection under users
- [ ] Add "Save Trail" button to trail detail sheet (mirrors "Save Park")
- [ ] Deploy Firebase Cloud Function `onTrailConditionReport` trigger
- [ ] Implement push notification routing to trail detail sheet in notification handler
- [ ] Gate subscription to saved trail alerts behind `isPro`
- [ ] Manual QA: submit trail condition, verify push notification received

**Feature 2.5 — iNaturalist Bidirectional Sync**
- [ ] Register NatureFind as an iNaturalist OAuth application
- [ ] Add iNaturalist link/unlink to Profile tab
- [ ] Implement OAuth token storage in SecureStore
- [ ] Add "Also post to iNaturalist" toggle in `submit.tsx`
- [ ] Implement `iNaturalistApi.postObservation()` with photo upload
- [ ] Add iNaturalist layer toggle to Layer Panel
- [ ] Render iNaturalist observations as a distinct GeoJSON layer on Mapbox map
- [ ] Manual QA: post sighting to both platforms, verify sync, test incoming layer

**Feature 2.6 — State Park Booking Deep-Links**
- [ ] Build `services/stateParkBooking.ts` operator-to-URL lookup table
- [ ] Cover top 10 state systems: ReserveAmerica, Reserve California, ReserveColorado, Reserve Washington, NY State Parks, etc.
- [ ] Integrate into campground detail sheet alongside Recreation.gov button
- [ ] Manual QA: test in CA, CO, NY, WA, OR state parks

### Phase 3 Checklist (Weeks 21–40)

**Android (see Section 8 for detail)**
- [ ] Audit all iOS-only code paths
- [ ] Replace `expo-apple-authentication` with Android-compatible flow
- [ ] Configure Google Sign-In for Android (`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`)
- [ ] Test `@rnmapbox/maps` on Android emulator
- [ ] EAS build for Android (`--platform android --profile preview`)
- [ ] Google Play Console setup, app submission
- [ ] QA across Android API levels 31–35

**Feature 3.2 — Topo Maps Offline**
- [ ] Add Mapbox Terrain v2 tileset to offline pack download
- [ ] Surface topo contour rendering in Mapbox style
- [ ] Add elevation profile to trail detail sheet
- [ ] Display pack size estimate including topo layers

**Feature 3.3 — Ranger/Guide B2B Tier**
- [ ] Design `organizations` Firestore schema
- [ ] Build team invite flow via Firebase Dynamic Links
- [ ] Build data export (CSV) for sightings and condition reports
- [ ] Build shared trip plan with multi-user editing
- [ ] Integrate Stripe via RevenueCat for B2B billing
- [ ] Build basic web admin dashboard

**Feature 3.4 — Permit Integration**
- [ ] Build permit facilities layer from RIDB `facility_type: "Permit"`
- [ ] Add "Permit Required" badge to trail and park markers
- [ ] Add permit detail sheet with quota window, cost, dates, booking link
- [ ] Deploy Firebase scheduled function for permit opening date alerts
- [ ] Manual QA: test with Half Dome, Angels Landing, Enchantments permit facilities

---

## 5. Monetization Plan

### Free Tier (Default, No Account Required)
- All map layers visible: National Parks, State Parks, Trails, Campgrounds, Wildlife Sightings
- Basic park, trail, and campground detail
- Up to 5 trail condition reports per month
- Up to 5 species ID camera uses per month
- Community sightings (view + submit, unlimited)
- Park reviews (view + submit, unlimited)
- Favorites (up to 10 parks)
- Campground booking deep-links (always free — this is a conversion funnel, not a feature gate)
- Seasonal wildlife intelligence (always free — community data policy)
- Cross-layer contextual panel (always free — core thesis)

**Rationale:** Free tier is deliberately generous on discovery and community features. The paywall is entirely on planning and convenience features. The competitive risk of paywalling condition reports or booking links is the AllTrails backlash scenario — avoid it.

### NatureFind+ — $34.99/yr (or $4.99/mo)

**Pricing Rationale:** $34.99/yr positions between Gaia's $90/yr (too expensive, backlash) and a token $10/yr. It is 56% cheaper than AllTrails Peak. The annual push vs. monthly should use a "Save 40%" callout ($4.99 x 12 = $59.88 vs. $34.99 annual). Annual subscriptions have dramatically better LTV and lower churn than monthly.

**Pro Features:**
- Unlimited offline trip packs (the primary value driver)
- Trail condition push alerts for saved trails
- Unlimited species ID camera uses
- Trip planner with saved trips and itinerary sharing
- Advanced filters (combination filters, saved filter presets)
- Topo map layers in offline packs (Phase 3)
- Early access to new features

**Revenue Projections (Conservative):**
| MAU | Conversion Rate | ARR |
|-----|----------------|-----|
| 25,000 | 1.5% | $13,100 |
| 50,000 | 2.0% | $34,990 |
| 100,000 | 2.5% | $87,475 |
| 250,000 | 3.0% | $262,425 |

### Hipcamp Affiliate Revenue
Hipcamp's affiliate program pays 3–5% commission on bookings referred. Average Hipcamp booking is ~$150/night, 2-night average = $300. At 5% commission = $15 per converted booking. If 1% of campground deep-link taps convert to a completed Hipcamp booking, and NatureFind drives 1,000 taps/month: $150/month. This grows significantly at scale. The primary value is not revenue but behavioral data and distribution — Hipcamp affiliate partnerships can lead to joint marketing opportunities.

### Ranger/Guide B2B Tier — $9.99/mo per seat ($119.88/yr)
Target: 200 seats within 12 months of launch = ~$24,000 ARR. Long-term: 50 guide companies at 5 seats average = $30,000 ARR per 50 accounts.

### Revenue Mix Target (12-Month Post-Launch)
- NatureFind+ subscriptions: 85%
- Hipcamp/Recreation.gov affiliate: 10%
- Ranger B2B tier: 5%

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| iNaturalist CV API rate-limiting or deprecation | Medium | High (Species ID camera) | Cache aggressively; implement on-device fallback using the iNaturalist lite model; don't build Phase 2 features that depend on it before validating quota |
| Recreation.gov deep-link URL patterns change | Medium | Medium | Store URL templates in Firestore (remotely configurable), not hardcoded. Monitor for 404 rates. |
| Apple Maps iOS 18+ absorbs basic trail discovery | High | Medium | Apple cannot match cross-layer (campground+trails+wildlife), community conditions, or booking deep-links. Differentiate on depth, not map rendering. Accelerate community data moat. |
| AllTrails removes condition report paywall | Low | High | Race to build community volume before they respond. Community data once established is sticky — users who have submitted 20 sightings don't leave. |
| Mapbox pricing increase (currently large free tier) | Medium | High (core map infrastructure) | Monitor usage against free tier ceiling. Evaluate `react-native-maps` MapKit as a fallback for basic map rendering (it's already in the project as a secondary map for the park terrain view). |
| iNaturalist OAuth application rejection | Low | Medium (Feature 2.5) | iNaturalist approves most legitimate nature apps. Have a backup plan: use iNaturalist export links (CSV-based) rather than OAuth API as a degraded alternative. |
| Firebase costs scaling with community data | Medium | Medium | The current Firestore data model (`sightings` top-level collection, geohash-indexed) is already designed for query efficiency. Add Firestore security rule rate-limiting. Budget alert at $100/month. |
| Android `@rnmapbox/maps` compatibility issues | High | High (Android launch) | Known issues documented in project memory. Test on Android emulator before any Phase 3 commitment. Consider falling back to `react-native-maps` (MapKit/Google Maps) for Android if Mapbox issues are intractable. |
| App Store rejection of IAP implementation | Low | High (Phase 2 revenue) | Follow Apple Human Interface Guidelines strictly for paywall presentation. Do not use "NatureFind+" as a wall name without showing the value first. Use RevenueCat's pre-approved paywall UI templates as a starting point. |
| Overpass API reliability (currently multiple fallback endpoints) | Low | Low (3 endpoints configured) | Already mitigated in `campgroundsApi.ts` and `trailsApi.ts` with a 3-endpoint fallback array. Acceptable. |

---

## 7. Android Expansion Plan

### Current State
The `app.json` already has an `android` configuration block with permissions defined (`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`) and `package: "com.finn581.parkfinder"`. The `package.json` has an `"android"` script (`expo run:android`). This indicates Android was considered from the start, but the primary development has been iOS.

### Key Technical Considerations

**Authentication:**
- `expo-apple-authentication` is iOS-only and must be hidden on Android. The existing codebase already uses `Platform.OS === 'ios'` guards in `profile.tsx` — extend this pattern.
- Google Sign-In already uses `expo-auth-session` which is cross-platform. Add `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` to `.env` and configure the corresponding Android client ID in Google Cloud Console.

**Mapbox (`@rnmapbox/maps`):**
- The project's memory file notes significant iOS build complexity with `@rnmapbox/maps` v10.2.10 (header issues, RNMBX_11 flag, Swift.h stub — all fixed via the `plugins/withRnmapboxFix` plugin and `scripts/fix-rnmapbox-ios.js`). Android has different native build challenges.
- `@rnmapbox/maps` requires a `MAPBOX_DOWNLOADS_TOKEN` (separate from the public access token) for pod/gradle downloads. The iOS build already uses this EAS secret (`RNMAPBOX_MAPS_DOWNLOAD_TOKEN`). Android uses the same Maven repository — add the Gradle credentials to `eas.json` under the Android build profile.
- Test on Android emulator API 31+ before declaring Android support. The most common issue is the `mapbox-android-sdk` Gradle dependency version pinning.

**Platform-Specific UI:**
- The app uses `Platform.OS` guards in several places (terrain MapView, directions URLs). Audit all `Platform.OS === 'ios'` uses and ensure Android paths are correct.
- `maps://` URL scheme for Apple Maps directions only works on iOS. The existing `openDirections` function in `index.tsx` already has the Android fallback to Google Maps (`https://www.google.com/maps/dir/...`).
- Ionicons inside custom Marker views is already known to fail silently on iOS device. Test this on Android as well.

**Offline/Storage:**
- AsyncStorage behavior is consistent cross-platform.
- The `spatialCache.ts` and `offlinePacks.ts` (Phase 2) use AsyncStorage, which works on Android.
- Mapbox offline regions work on Android through `MapboxGL.offlineManager` — same API as iOS.

**Build Infrastructure:**
- `eas.json` needs an `android` profile in addition to the existing `ios` preview profile.
- Google Play Console: create app listing, upload AAB (not APK). EAS builds AAB by default for production.
- Google Play requires a signed APK for internal testing — use EAS's managed signing.

### Android Launch Steps (Weeks 21–28)

1. Week 21: Audit all `Platform.OS` guards, hide Apple Sign-In on Android, verify Google Sign-In with Android client ID.
2. Week 22: Configure Android Mapbox Gradle credentials in `eas.json`. Run first Android EAS build. Debug native compilation.
3. Week 23: Test core map functionality on Android emulator and 2 physical devices (Samsung + Pixel).
4. Week 24: Test all layer types (trails, campgrounds, sightings, parks) on Android. Fix rendering discrepancies.
5. Week 25: Test all community features (sighting submit, condition report, campground contribution) on Android.
6. Week 26: Test offline packs on Android (if Phase 2 is complete by then).
7. Week 27: Create Google Play Console listing, upload first internal track build. Internal QA review.
8. Week 28: Submit for Google Play review. Plan closed beta with 50 Android users.

### Android-Specific Risks
- Mapbox Android Gradle dependency conflicts with other native modules. Mitigation: test early (Week 22), have a fallback plan to use `react-native-maps` with Google Maps SDK for Android only.
- Android back-gesture navigation conflicts with bottom sheet behavior. The existing `LayerPanel` uses `Animated.spring` — test the dismiss gesture behavior against Android's system back gesture.
- Google Play review is generally faster than App Store (hours vs. days) but has different content policies around location data. Ensure the privacy policy at `privacy-policy.html` covers Android-specific requirements.

---

## 8. Community Cold-Start Strategy

The community data problem is the hardest product challenge: new users in a new area see zero sightings, zero condition reports, zero campground corrections, and have no reason to contribute. Here is how to break that loop.

### Pre-Launch Seeding

**iNaturalist Import (Phase 1):** Before any NatureFind user submits a single sighting, pull historical iNaturalist observations for all US National Parks (top 20 by visitation) using the iNaturalist bulk export API. Import as system-generated sightings with a `source: "iNaturalist"` field and the original iNaturalist observation URL as attribution. This populates the sighting layer with real, scientifically-validated data from day one. Each park's wildlife layer will immediately have dozens to hundreds of entries.

**AllTrails Condition Report Alternatives:** AllTrails condition reports are copyrighted and cannot be scraped. Instead, reach out to 50 AllTrails power users (identifiable by their public AllTrails profiles) with a "Founding Member" offer: free NatureFind+ for life in exchange for porting their top 10 trail condition reports into NatureFind. Founding members get a permanent "Founding Trailblazer" badge.

**Ranger Partnerships:** Contact NPS Interpretation staff at 10 high-traffic parks (Yosemite, Yellowstone, Grand Canyon, Zion, Rocky Mountain, Olympic, Acadia, Great Smoky, Glacier, Joshua Tree). Offer free Ranger B2B accounts in exchange for having rangers post weekly condition updates and wildlife sightings during their patrol shifts. Rangers are already taking these notes — NatureFind gives them a distribution channel.

### Launch Strategy

**Targeted Community Seeding (Weeks 1–4 post-launch):**
- Partner with 5–10 outdoor Instagram/YouTube creators with 50K–500K followers (not mega-influencers, who have low engagement per follower). Provide free NatureFind+ and ask them to post their first sighting using the species ID camera. Creator-led adoption is the fastest mechanism for outdoor apps.
- Post in 20 high-traffic subreddits: r/hiking, r/camping, r/wildlifephotography, r/nationalparks, r/birding, r/iNaturalist. Focus on genuine value demonstration ("I was at Yosemite and used NatureFind's species ID to identify this hawk...") not marketing posts.

**Incentive Architecture:**

The current `profile.tsx` already tracks `sightings`, `reviews`, `visits`, and `favorites` counts. Build on these:

- **First Sighter Badge:** When a user is the first to report a species at a given park (checked via Firestore query on submission), immediately display a "First Sighter" badge notification and add a permanent badge to their profile. This is addictive to naturalists and birders.
- **Streak System:** Daily/weekly login streaks with a visual calendar. Consecutive submission days unlock profile badge tiers: "Weekend Trailblazer" (5 sightings), "Monthly Explorer" (20 sightings), "Seasonal Guide" (50 sightings + condition reports).
- **Leaderboard (Opt-in):** A per-park leaderboard showing top contributors this month. Public parks have enormous existing communities — Yosemite's most active NatureFind contributor is a status position worth competing for.
- **Community Health Score:** Each park gets a "Community Coverage Score" (0–100) based on: recency of sightings, trail condition report age, campground contribution completeness. Users who contribute see the score go up in real time — instant feedback loop.

### Content Quality Maintenance

- **Auto-Moderation:** The existing `reports` Firestore collection and `reportReview()` function in `firebase.ts` is a start. Add automated flags: sightings with location >50km from the stated park code, reviews with <5 words, duplicate sightings from the same user at the same location within 1 hour.
- **Trusted Contributor Program:** Users who pass 25 contributions with no moderation flags become "Trusted Contributors" whose submissions skip the moderation queue and get a visual indicator on their content.
- **Decay Indicators:** Condition reports older than 14 days show a "May be outdated" badge. Sightings older than 30 days fade in opacity on the map. This creates organic demand for fresh contributions.

---

## 9. KPIs and Success Metrics

### Acquisition
| Metric | Target (Month 3) | Target (Month 12) |
|--------|----------------|------------------|
| Total Downloads | 5,000 | 50,000 |
| iOS App Store Rating | 4.4+ | 4.6+ |
| Organic Search Installs | 40% of total | 55% of total |
| Day-1 Retention | 35% | 42% |
| Day-7 Retention | 18% | 25% |
| Day-30 Retention | 10% | 16% |

### Engagement
| Metric | Target (Month 3) | Target (Month 12) |
|--------|----------------|------------------|
| DAU/MAU Ratio | 12% | 20% |
| Average Session Length | 4 min | 6 min |
| Sessions per Week (active users) | 2.0 | 3.5 |
| Map Layer Engagement (>1 layer active) | 55% of sessions | 70% of sessions |
| Cross-Layer Panel Views per Campground Tap | 60% | 75% |

### Community
| Metric | Target (Month 3) | Target (Month 12) |
|--------|----------------|------------------|
| Total Sightings in Database | 10,000 (seeded + community) | 100,000 |
| Weekly New Sightings | 200 | 2,000 |
| Trail Condition Reports (active <14d) | 500 parks covered | 3,000 parks covered |
| Campground Completeness Score | 40% (toilets/showers known) | 70% |
| % of Sessions Viewing Community Data | 70% | 85% |

### Monetization
| Metric | Target (Month 3) | Target (Month 12) |
|--------|----------------|------------------|
| NatureFind+ Subscribers | 200 | 2,000 |
| MRR | $580 | $5,800 |
| ARPU (all users) | $0.12 | $1.16 |
| Subscription Churn (monthly) | < 5% | < 3% |
| Booking Deep-Link Tap Rate | 12% of campground opens | 20% of campground opens |
| Hipcamp Affiliate Conversions | 20/mo | 200/mo |

### Technical Health
| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| App crash rate | < 0.5% of sessions | > 1% |
| Overpass API failure rate | < 2% | > 5% |
| Map tile cache hit rate | > 75% | < 50% |
| Species ID API latency (p95) | < 3 seconds | > 8 seconds |
| Firestore read cost per DAU | < $0.01 | > $0.05 |

---

### Critical Files for Implementation

- `/Users/finn/Desktop/workplaces/NatureFind/app/(tabs)/index.tsx` - Core map screen housing all layer state, bottom sheets, and the campground detail panel where features 1.1, 1.3, and 1.6 primarily land
- `/Users/finn/Desktop/workplaces/NatureFind/services/firebase.ts` - Central data layer for all Firestore operations; new collections (trail conditions, trip plans, subscriptions, saved trails) and their type definitions all extend this file's patterns
- `/Users/finn/Desktop/workplaces/NatureFind/app/sighting/submit.tsx` - Sighting submission flow where the iNaturalist CV species ID camera (Feature 1.4) integrates, and where the bidirectional iNaturalist sync (Feature 2.5) hooks in
- `/Users/finn/Desktop/workplaces/NatureFind/services/spatialCache.ts` - Existing L1/L2 tile cache architecture that offline trip packs (Feature 2.2) extend with user-initiated, trip-scoped, 30-day TTL bundles
- `/Users/finn/Desktop/workplaces/NatureFind/app/park/[id].tsx` - Park detail screen where seasonal wildlife intelligence (Feature 1.5) and the existing condition report form render; the trip planner (Feature 2.1) also links back to this screen as a campground preview surface