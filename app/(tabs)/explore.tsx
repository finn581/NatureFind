import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useParks } from "@/hooks/useParks";
import { POPULAR_STATES, US_STATES } from "@/constants/States";
import SearchBar from "@/components/SearchBar";
import ParkCard from "@/components/ParkCard";
import type { Park } from "@/services/npsApi";
import {
  fetchStateParks,
  fetchLocalParks,
  type OverpassPark,
} from "@/services/overpassApi";

type ParkType = "national" | "state" | "local";

const PARK_TYPES: { key: ParkType; label: string; icon: string }[] = [
  { key: "national", label: "National", icon: "earth" },
  { key: "state", label: "State", icon: "trail-sign" },
  { key: "local", label: "Local", icon: "leaf" },
];

function getDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface DisplayPark {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  imageUrl: string | null;
  latitude: number;
  longitude: number;
  distance: number;
  parkType: ParkType;
  npsPark: Park | null;
}

export default function ExploreNearMeTab() {
  const router = useRouter();
  const { parks, loading: npsLoading, total, loadParks } = useParks();
  const [searchText, setSearchText] = useState("");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ParkType>("national");
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // State/local park data
  const [osmParks, setOsmParks] = useState<OverpassPark[]>([]);
  const [osmLoading, setOsmLoading] = useState(false);
  const [osmError, setOsmError] = useState<string | null>(null);

  // Track current search to show in banner
  const [searchedLocation, setSearchedLocation] = useState<string | null>(null);

  // Request location on mount
  useEffect(() => {
    (async () => {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied. Enable it in Settings to find parks near you.");
        setLocationLoading(false);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      } catch {
        setLocationError("Could not get your location. Try again later.");
      } finally {
        setLocationLoading(false);
      }
    })();
  }, []);

  // Auto-load national parks once we have location
  useEffect(() => {
    if (userLocation && !initialLoaded) {
      setInitialLoaded(true);
      loadParks({ limit: 50 });
    }
  }, [userLocation, initialLoaded, loadParks]);

  // Load state/local parks when type changes (initial GPS-based load)
  useEffect(() => {
    if (!userLocation) return;
    if (selectedType === "national") return;

    loadOsmParks();
  }, [selectedType, userLocation]);

  // Fetch state/local parks with optional search query and state filter
  const loadOsmParks = useCallback(
    async (query?: string, stateCode?: string) => {
      if (!userLocation && !query && !stateCode) return;

      setOsmLoading(true);
      setOsmError(null);
      setOsmParks([]);

      // Build the search query: combine text search with state name
      let searchQuery = "";
      if (stateCode) {
        const stateName = US_STATES.find((s) => s.code === stateCode)?.name;
        searchQuery = stateName ?? stateCode;
        setSearchedLocation(stateName ?? stateCode);
      } else if (query?.trim()) {
        searchQuery = query;
        setSearchedLocation(query);
      } else {
        setSearchedLocation(null);
      }

      const lat = userLocation?.lat ?? 39.8;
      const lon = userLocation?.lon ?? -98.5;

      try {
        const fetchFn = selectedType === "state" ? fetchStateParks : fetchLocalParks;
        const data = await fetchFn(lat, lon, undefined, searchQuery || undefined);
        setOsmParks(data);
      } catch {
        setOsmError("Failed to load parks. Try again.");
      } finally {
        setOsmLoading(false);
      }
    },
    [userLocation, selectedType]
  );

  // Build display list depending on selected type
  const displayParks: DisplayPark[] = React.useMemo(() => {
    if (selectedType === "national") {
      return parks
        .filter((p) => p.latitude && p.longitude)
        .map((p) => {
          const lat = parseFloat(p.latitude);
          const lon = parseFloat(p.longitude);
          return {
            id: p.id,
            name: p.fullName,
            subtitle: `${p.states} · ${p.designation || "National Park"}`,
            description: p.description,
            imageUrl: p.images?.[0]?.url ?? null,
            latitude: lat,
            longitude: lon,
            distance: userLocation
              ? getDistanceMiles(userLocation.lat, userLocation.lon, lat, lon)
              : -1,
            parkType: "national" as ParkType,
            npsPark: p,
          };
        })
        .sort((a, b) =>
          a.distance >= 0 && b.distance >= 0 ? a.distance - b.distance : 0
        );
    }

    // State or local from Geoapify
    return osmParks
      .map((p) => ({
        id: p.id,
        name: p.name,
        subtitle: p.type === "state" ? "State Park" : "Local Park",
        description: "",
        imageUrl: null,
        latitude: p.latitude,
        longitude: p.longitude,
        distance: userLocation
          ? getDistanceMiles(userLocation.lat, userLocation.lon, p.latitude, p.longitude)
          : -1,
        parkType: p.type,
        npsPark: null,
      }))
      .sort((a, b) => (a.distance >= 0 && b.distance >= 0 ? a.distance - b.distance : 0));
  }, [selectedType, parks, osmParks, userLocation]);

  const doSearch = useCallback(() => {
    if (selectedType === "national") {
      loadParks({
        q: searchText || undefined,
        stateCode: selectedState || undefined,
        limit: 50,
        start: 0,
      });
    } else {
      // For state/local: geocode the search text and fetch parks there
      loadOsmParks(searchText, selectedState || undefined);
    }
  }, [searchText, selectedState, selectedType, loadParks, loadOsmParks]);

  const loadMore = useCallback(() => {
    if (selectedType !== "national") return;
    if (npsLoading || parks.length >= total) return;
    loadParks(
      {
        q: searchText || undefined,
        stateCode: selectedState || undefined,
        limit: 50,
        start: parks.length,
      },
      true
    );
  }, [selectedType, npsLoading, parks.length, total, searchText, selectedState, loadParks]);

  const toggleState = (code: string) => {
    const next = selectedState === code ? null : code;
    setSelectedState(next);
    if (selectedType === "national") {
      loadParks({
        q: searchText || undefined,
        stateCode: next || undefined,
        limit: 50,
      });
    } else {
      // For state/local: search parks in that US state
      loadOsmParks(searchText || undefined, next || undefined);
    }
  };

  const selectType = (type: ParkType) => {
    setSelectedType(type);
    setSearchedLocation(null);
  };

  const formatDistance = (miles: number) => {
    if (miles < 0) return "";
    if (miles < 1) return "< 1 mi";
    return `${Math.round(miles)} mi`;
  };

  const isLoading = selectedType === "national" ? npsLoading : osmLoading;

  return (
    <View style={styles.container}>
      {/* Location status */}
      <View style={styles.locationBanner}>
        <Ionicons name="navigate" size={14} color={Colors.primaryLight} />
        <Text style={styles.locationText}>
          {searchedLocation && selectedType !== "national"
            ? `Showing parks near ${searchedLocation}`
            : userLocation
            ? "Showing parks nearest to you"
            : "Enter a location to search"}
        </Text>
      </View>

      {/* Park type selector */}
      <View style={styles.typeRow}>
        {PARK_TYPES.map(({ key, label, icon }) => (
          <Pressable
            key={key}
            style={[styles.typeChip, selectedType === key && styles.typeChipActive]}
            onPress={() => selectType(key)}
          >
            <Ionicons
              name={icon as any}
              size={16}
              color={selectedType === key ? Colors.white : Colors.textSecondary}
            />
            <Text
              style={[
                styles.typeChipText,
                selectedType === key && styles.typeChipTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SearchBar
        value={searchText}
        onChangeText={setSearchText}
        onSubmit={doSearch}
        placeholder={
          selectedType === "national"
            ? "Search national, state, local parks..."
            : "Search by city, state, or zip code..."
        }
      />

      {/* State filter chips — shown for all park types */}
      <View style={styles.chipsWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {POPULAR_STATES.map((code) => {
          const state = US_STATES.find((s) => s.code === code);
          return (
            <Pressable
              key={code}
              style={[styles.chip, selectedState === code && styles.chipActive]}
              onPress={() => toggleState(code)}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedState === code && styles.chipTextActive,
                ]}
              >
                {state?.name ?? code}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
        {/* Right fade mask to cleanly hide partial chips at edge */}
        <View style={styles.chipsFade} pointerEvents="none" />
      </View>

      {/* NPS Attribution */}
      <View style={styles.attribution}>
        <Text style={styles.attributionText}>
          National park data provided by the National Park Service
        </Text>
      </View>

      {/* Results */}
      {locationLoading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.emptyText}>Getting your location...</Text>
        </View>
      ) : locationError && !initialLoaded && selectedType === "national" ? (
        <View style={styles.empty}>
          <Ionicons name="location-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{locationError}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              loadParks({ limit: 50 });
              setInitialLoaded(true);
            }}
          >
            <Text style={styles.retryText}>Browse all parks instead</Text>
          </Pressable>
        </View>
      ) : osmError && selectedType !== "national" ? (
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{osmError}</Text>
          <Pressable style={styles.retryBtn} onPress={() => loadOsmParks()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayParks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            if (item.npsPark) {
              return (
                <View>
                  <ParkCard park={item.npsPark} />
                  {item.distance >= 0 && (
                    <View style={styles.distanceBadge}>
                      <Ionicons name="navigate-outline" size={12} color={Colors.accent} />
                      <Text style={styles.distanceText}>
                        {formatDistance(item.distance)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }

            return (
              <Pressable
                style={styles.osmCard}
                onPress={() => {
                  const url = `maps://?daddr=${item.latitude},${item.longitude}&dirflg=d&t=s&q=${encodeURIComponent(item.name)}`;
                  Linking.openURL(url);
                }}
              >
                <View style={styles.osmIconWrap}>
                  <Ionicons
                    name={item.parkType === "state" ? "trail-sign" : "leaf"}
                    size={24}
                    color={item.parkType === "state" ? Colors.accent : Colors.primaryLight}
                  />
                </View>
                <View style={styles.osmInfo}>
                  <Text style={styles.osmName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.osmSub}>{item.subtitle}</Text>
                </View>
                <View style={styles.osmDirections}>
                  {item.distance >= 0 && (
                    <Text style={styles.distanceText}>
                      {formatDistance(item.distance)}
                    </Text>
                  )}
                  <Ionicons name="navigate" size={18} color={Colors.primary} />
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={displayParks.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} />
            ) : null
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {selectedType === "national"
                    ? "No national parks found"
                    : `Search or tap a state to find ${selectedType} parks`}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  locationBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    backgroundColor: Colors.primaryDark,
  },
  locationText: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: "500",
  },
  typeRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
  },
  typeChipActive: {
    backgroundColor: Colors.primary,
  },
  typeChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  typeChipTextActive: {
    color: Colors.white,
  },
  chipsWrapper: {
    position: "relative",
  },
  chipsFade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
    backgroundColor: Colors.background,
    opacity: 0.92,
  },
  chips: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
  },
  chip: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextActive: {
    color: Colors.white,
  },
  list: {
    paddingVertical: 8,
  },
  emptyList: {
    flex: 1,
  },
  distanceBadge: {
    position: "absolute",
    top: 14,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  distanceText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  osmCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 12,
    padding: 14,
  },
  osmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  osmInfo: {
    flex: 1,
  },
  osmName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  osmSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  osmDirections: {
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  retryText: {
    color: Colors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  attribution: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  attributionText: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: "center",
  },
});
