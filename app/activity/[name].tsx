import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Colors } from "@/constants/Colors";
import { ACTIVITY_LIST } from "@/constants/Activities";
import { fetchParksByActivity, type Park } from "@/services/npsApi";
import ParkCard from "@/components/ParkCard";

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

const STATE_NAME_TO_CODE: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY",
};

export default function ActivityResultsScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activity =
    ACTIVITY_LIST.find((a) => a.name === name) ?? ACTIVITY_LIST[0];

  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detectedState, setDetectedState] = useState<string | undefined>();
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  useEffect(() => {
    if (!name) return;
    (async () => {
      setLoading(true);
      setError(false);

      let stateCode: string | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const { latitude, longitude } = loc.coords;
          setUserLocation({ lat: latitude, lon: longitude });

          const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (geo?.region) {
            stateCode = STATE_NAME_TO_CODE[geo.region] ?? undefined;
            setDetectedState(stateCode);
          }
        }
      } catch {
        // Location unavailable — fall back to nationwide
      }

      await loadParks(stateCode);
    })();
  }, [name]);

  async function loadParks(stateCode?: string) {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchParksByActivity(name!, stateCode);
      setParks(data.filter((p) => p.latitude && p.longitude));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // Re-sort by distance whenever location arrives
  const sortedParks = useMemo(() => {
    if (!userLocation) return parks;
    return [...parks].sort((a, b) => {
      const dA = getDistanceMiles(
        userLocation.lat,
        userLocation.lon,
        parseFloat(a.latitude),
        parseFloat(a.longitude)
      );
      const dB = getDistanceMiles(
        userLocation.lat,
        userLocation.lon,
        parseFloat(b.latitude),
        parseFloat(b.longitude)
      );
      return dA - dB;
    });
  }, [parks, userLocation]);

  return (
    <View style={styles.container}>
      {/* Fixed back button — always visible regardless of scroll position */}
      <Pressable
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/activities")}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </Pressable>

      <FlatList
        data={sortedParks}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View>
            {index === 0 && userLocation && (
              <Text style={styles.sortLabel}>
                Sorted by distance from your location
              </Text>
            )}
            <ParkCard park={item} />
          </View>
        )}
        ListHeaderComponent={
          <>
            {/* Hero */}
            <View style={[styles.hero, { paddingTop: insets.top + 70 }]}>
              {/* Photo background */}
              <Image
                source={typeof activity.photo === "string" ? { uri: activity.photo } : activity.photo}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
              {/* Dark overlay for legibility */}
              <View style={styles.heroOverlay} />

              <View
                style={[
                  styles.heroIconWrap,
                  { backgroundColor: activity.accentColor + "33" },
                ]}
              >
                <Ionicons
                  name={activity.icon as any}
                  size={52}
                  color="#fff"
                />
              </View>
              <Text style={styles.heroTitle}>Best {activity.name}</Text>
              <Text style={styles.heroTitle2}>Locations</Text>
              <Text style={styles.heroSub}>{activity.description}</Text>
              <View
                style={[
                  styles.seasonPill,
                  { backgroundColor: "rgba(0,0,0,0.4)" },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={13}
                  color={activity.accentColor}
                />
                <Text
                  style={[
                    styles.seasonPillText,
                    { color: activity.accentColor },
                  ]}
                >
                  Best Season: {activity.bestSeason}
                </Text>
              </View>
            </View>

            {/* Tips */}
            <View style={styles.tipsSection}>
              <View style={styles.tipsTitleRow}>
                <Ionicons
                  name="bulb"
                  size={18}
                  color={activity.accentColor}
                />
                <Text style={styles.tipsTitle}>Pro Tips</Text>
              </View>
              {activity.tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <View
                    style={[
                      styles.tipDot,
                      { backgroundColor: activity.accentColor },
                    ]}
                  />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>
              Top National Parks for {activity.name}
            </Text>

            {loading && (
              <View style={styles.loadingWrap}>
                <ActivityIndicator
                  color={activity.accentColor}
                  size="large"
                />
                <Text style={styles.loadingText}>Finding best locations...</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            error ? (
              <View style={styles.empty}>
                <Ionicons
                  name="alert-circle-outline"
                  size={48}
                  color={Colors.textMuted}
                />
                <Text style={styles.emptyText}>Failed to load locations</Text>
                <Pressable
                  style={[
                    styles.retryBtn,
                    { backgroundColor: activity.color },
                  ]}
                  onPress={() => loadParks(detectedState)}
                >
                  <Text style={styles.retryText}>Try Again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No locations found</Text>
              </View>
            )
          ) : null
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  hero: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    overflow: "hidden",
    alignItems: "center",
    gap: 6,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  backBtn: {
    position: "absolute",
    top: 60,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  heroIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  heroTitle2: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 32,
    marginTop: -4,
  },
  heroSub: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
    maxWidth: 320,
  },
  seasonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 6,
  },
  seasonPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  tipsSection: {
    margin: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  tipsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  tipsTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  tipText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sortLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 6,
    fontStyle: "italic",
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  list: {
    paddingBottom: 40,
  },
  empty: {
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  retryBtn: {
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 4,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
