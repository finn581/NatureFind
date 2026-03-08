import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import type { Park } from "@/services/npsApi";
import { isOpenNow, isDogFriendly } from "@/utils/parkUtils";
import { formatDurationShort } from "@/services/mapboxRoutingApi";

interface ParkCardProps {
  park: Park;
  driveTime?: number | null;
}

function openDirections(lat: string | number, lon: string | number, name: string) {
  const url = `maps://?daddr=${lat},${lon}&dirflg=d&t=s&q=${encodeURIComponent(name)}`;
  Linking.openURL(url);
}

export default function ParkCard({ park, driveTime }: ParkCardProps) {
  const router = useRouter();
  const imageUrl = park.images?.[0]?.url;
  const openStatus = isOpenNow(park.operatingHours);
  const dogFriendly = isDogFriendly(park.activities);

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/park/${park.parkCode}`)}
      accessibilityLabel={`${park.fullName}, ${park.designation || "National Park"}`}
      accessibilityRole="button"
    >
      {imageUrl && (
        <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" />
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {park.fullName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {park.states} &middot; {park.designation || "National Park"}
        </Text>
        {(openStatus !== null || dogFriendly || driveTime != null) && (
          <View style={styles.badgeRow}>
            {driveTime != null && (
              <View style={[styles.badge, { backgroundColor: "#0c2340" }]}>
                <Ionicons name="car-outline" size={11} color="#7dd3fc" />
                <Text style={[styles.badgeText, { color: "#7dd3fc" }]}>
                  {formatDurationShort(driveTime)}
                </Text>
              </View>
            )}
            {openStatus !== null && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: openStatus ? "#1b4332" : "#3d0c0c" },
                ]}
              >
                <Ionicons
                  name={openStatus ? "checkmark-circle" : "close-circle"}
                  size={11}
                  color={openStatus ? Colors.primaryLight : Colors.error}
                />
                <Text
                  style={[
                    styles.badgeText,
                    { color: openStatus ? Colors.primaryLight : Colors.error },
                  ]}
                >
                  {openStatus ? "Open Now" : "Closed"}
                </Text>
              </View>
            )}
            {dogFriendly && (
              <View style={[styles.badge, { backgroundColor: "#2a2200" }]}>
                <Text style={[styles.badgeText, { color: Colors.accentLight }]}>
                  🐾 Dog Friendly
                </Text>
              </View>
            )}
          </View>
        )}
        <Text style={styles.description} numberOfLines={2}>
          {park.description}
        </Text>
        {park.latitude && park.longitude && (
          <Pressable
            style={styles.directionsBtn}
            onPress={(e) => {
              e.stopPropagation();
              openDirections(park.latitude, park.longitude, park.fullName);
            }}
            accessibilityLabel={`Get directions to ${park.fullName}`}
            accessibilityRole="button"
          >
            <Ionicons name="navigate" size={14} color={Colors.white} />
            <Text style={styles.directionsText}>Directions</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 160,
  },
  info: {
    padding: 12,
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: Colors.primaryLight,
    fontSize: 13,
    marginTop: 2,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
  },
  directionsText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
});
