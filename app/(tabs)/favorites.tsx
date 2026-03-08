import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useAuth } from "@/context/AuthContext";
import { useFavorites } from "@/hooks/useFavorites";
import { fetchParks } from "@/services/npsApi";
import { optimizeTrip, formatDuration, formatDistance } from "@/services/mapboxRoutingApi";
import type { TripResult } from "@/services/mapboxRoutingApi";

export default function FavoritesTab() {
  const { user } = useAuth();
  const { favorites, loading, refresh, remove } = useFavorites();
  const router = useRouter();

  const [planningTrip, setPlanningTrip] = useState(false);
  const [tripResult, setTripResult] = useState<{
    result: TripResult;
    orderedNames: string[];
    orderedCodes: string[];
  } | null>(null);

  if (!user) {
    return (
      <View style={styles.center}>
        <Ionicons name="heart-outline" size={64} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Sign in to save favorites</Text>
        <Text style={styles.emptyText}>
          Your saved parks will appear here
        </Text>
        <Pressable
          style={styles.signInBtn}
          onPress={() => router.push("/(tabs)/profile")}
          accessibilityLabel="Go to profile to sign in"
          accessibilityRole="button"
        >
          <Text style={styles.signInText}>Go to Profile</Text>
        </Pressable>
      </View>
    );
  }

  if (loading && favorites.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const handleRemove = (parkCode: string, name: string) => {
    Alert.alert("Remove Favorite", `Remove ${name} from favorites?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove(parkCode) },
    ]);
  };

  async function handlePlanTrip() {
    if (favorites.length < 2) {
      Alert.alert("Need more favorites", "Save at least 2 parks to plan a trip.");
      return;
    }
    setPlanningTrip(true);
    try {
      // Fetch full park data to get coordinates
      const codes = favorites.map((f) => f.parkCode).join(",");
      const res = await fetchParks({ parkCode: codes, limit: favorites.length + 5 });
      const parkMap = new Map(res.data.map((p) => [p.parkCode, p]));

      const stops: [number, number][] = [];
      const validFavorites = favorites.filter((f) => {
        const p = parkMap.get(f.parkCode);
        return p?.latitude && p?.longitude;
      });

      for (const f of validFavorites) {
        const p = parkMap.get(f.parkCode)!;
        stops.push([parseFloat(p.longitude), parseFloat(p.latitude)]);
      }

      if (stops.length < 2) {
        Alert.alert("Error", "Could not find coordinates for enough parks.");
        return;
      }

      const result = await optimizeTrip(stops);
      if (!result) {
        Alert.alert("Error", "Could not optimize trip route.");
        return;
      }

      const orderedNames = result.orderedIndices.map((i) => validFavorites[i]?.fullName ?? "");
      const orderedCodes = result.orderedIndices.map((i) => validFavorites[i]?.parkCode ?? "");
      setTripResult({ result, orderedNames, orderedCodes });
    } catch (err) {
      Alert.alert("Error", "Failed to plan trip. Check your connection and try again.");
    } finally {
      setPlanningTrip(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Plan Trip header button */}
      {favorites.length >= 2 && (
        <Pressable
          style={styles.planBtn}
          onPress={handlePlanTrip}
          disabled={planningTrip}
          accessibilityRole="button"
          accessibilityLabel="Plan optimized trip through favorites"
        >
          {planningTrip ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="map" size={16} color="#fff" />
              <Text style={styles.planBtnText}>Plan Trip</Text>
            </>
          )}
        </Pressable>
      )}

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.parkCode}
        onRefresh={refresh}
        refreshing={loading}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/park/${item.parkCode}`)}
            accessibilityLabel={`${item.fullName}, ${item.states}`}
            accessibilityRole="button"
          >
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.image} contentFit="cover" />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {item.fullName}
              </Text>
              <Text style={styles.states}>{item.states}</Text>
            </View>
            <Pressable
              style={styles.removeBtn}
              onPress={() => handleRemove(item.parkCode, item.fullName)}
              accessibilityLabel={`Remove ${item.fullName} from favorites`}
              accessibilityRole="button"
            >
              <Ionicons name="heart" size={22} color={Colors.error} />
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No favorites yet</Text>
          </View>
        }
        contentContainerStyle={favorites.length === 0 ? styles.emptyList : styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* Trip result modal */}
      <Modal
        visible={!!tripResult}
        transparent
        animationType="slide"
        onRequestClose={() => setTripResult(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandleBar} />
            <View style={styles.modalHeader}>
              <Ionicons name="map" size={18} color={Colors.primary} />
              <Text style={styles.modalTitle}>Optimized Trip</Text>
              <Pressable
                onPress={() => setTripResult(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {tripResult && (
              <>
                <View style={styles.tripStats}>
                  <View style={styles.tripStat}>
                    <Ionicons name="time-outline" size={16} color={Colors.primaryLight} />
                    <Text style={styles.tripStatText}>
                      {formatDuration(tripResult.result.totalDuration)}
                    </Text>
                  </View>
                  <View style={styles.tripStatDivider} />
                  <View style={styles.tripStat}>
                    <Ionicons name="speedometer-outline" size={16} color={Colors.primaryLight} />
                    <Text style={styles.tripStatText}>
                      {formatDistance(tripResult.result.totalDistance)}
                    </Text>
                  </View>
                  <View style={styles.tripStatDivider} />
                  <View style={styles.tripStat}>
                    <Ionicons name="flag-outline" size={16} color={Colors.primaryLight} />
                    <Text style={styles.tripStatText}>
                      {tripResult.orderedNames.length} stops
                    </Text>
                  </View>
                </View>

                <ScrollView
                  style={styles.stopsList}
                  showsVerticalScrollIndicator={false}
                >
                  {tripResult.orderedNames.map((name, idx) => (
                    <Pressable
                      key={tripResult.orderedCodes[idx]}
                      style={styles.stopRow}
                      onPress={() => {
                        setTripResult(null);
                        router.push(`/park/${tripResult.orderedCodes[idx]}`);
                      }}
                      accessibilityRole="button"
                    >
                      <View style={styles.stopBadge}>
                        <Text style={styles.stopBadgeText}>{idx + 1}</Text>
                      </View>
                      {idx < tripResult.orderedNames.length - 1 && (
                        <View style={styles.stopConnector} />
                      )}
                      <View style={styles.stopInfo}>
                        <Text style={styles.stopName} numberOfLines={1}>
                          {name}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color={Colors.textSecondary}
                        />
                      </View>
                    </Pressable>
                  ))}
                  <View style={{ height: 20 }} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    padding: 40,
  },
  list: {
    paddingVertical: 8,
  },
  emptyList: {
    flex: 1,
  },
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: Colors.primary,
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  planBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
  },
  image: {
    width: 80,
    height: 80,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  info: {
    flex: 1,
    padding: 12,
  },
  name: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  states: {
    color: Colors.primaryLight,
    fontSize: 13,
    marginTop: 2,
  },
  removeBtn: {
    padding: 16,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  signInBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 20,
  },
  signInText: {
    color: Colors.white,
    fontWeight: "600",
    fontSize: 15,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "75%",
    paddingHorizontal: 20,
  },
  modalHandleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  tripStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 14,
    gap: 10,
  },
  tripStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    justifyContent: "center",
  },
  tripStatText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  tripStatDivider: {
    width: 1,
    height: 18,
    backgroundColor: Colors.border,
  },
  stopsList: {
    flex: 1,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    position: "relative",
  },
  stopBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  stopBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  stopConnector: {
    position: "absolute",
    left: 14,
    top: 34,
    width: 2,
    height: 20,
    backgroundColor: Colors.border,
  },
  stopInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stopName: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
});
