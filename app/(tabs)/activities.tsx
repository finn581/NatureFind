import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { ACTIVITY_LIST } from "@/constants/Activities";

export default function ActivitiesTab() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const numColumns = width >= 768 ? 3 : 2;
  const gap = 12;
  const horizontalPad = 16;
  const cardWidth = (width - horizontalPad * 2 - gap * (numColumns - 1)) / numColumns;
  const cardHeight = cardWidth * 1.35;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.wordmark}>
          <Image
            source={require("@/assets/images/logo-circle.png")}
            style={styles.wordmarkLogo}
            contentFit="cover"
          />
          <Text style={styles.wordmarkText}>NatureFind</Text>
        </View>
        <Text style={styles.title}>Discover by Activity</Text>
        <Text style={styles.subtitle}>
          Find the best parks and locations for your favorite outdoor pursuits
        </Text>
      </View>

      <View style={[styles.grid, { paddingHorizontal: horizontalPad, gap }]}>
        {ACTIVITY_LIST.map((activity) => (
          <Pressable
            key={activity.name}
            style={({ pressed }) => [
              styles.card,
              {
                width: cardWidth,
                height: cardHeight,
                opacity: pressed ? 0.92 : 1,
                transform: pressed ? [{ scale: 0.97 }] : [],
              },
            ]}
            onPress={() =>
              router.push(`/activity/${encodeURIComponent(activity.name)}`)
            }
            accessibilityLabel={`Browse ${activity.name} locations`}
            accessibilityRole="button"
          >
            {/* Background photo */}
            <Image
              source={typeof activity.photo === "string" ? { uri: activity.photo } : activity.photo}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
            />

            {/* Top gradient layer — light scrim for the icon */}
            <View style={styles.overlayTop} />

            {/* Bottom gradient layer — dark scrim for text */}
            <View style={styles.overlayBottom} />

            {/* Icon badge top-left */}
            <View style={[styles.iconBadge, { backgroundColor: activity.accentColor + "cc" }]}>
              <Ionicons
                name={activity.icon as any}
                size={18}
                color="#fff"
              />
            </View>

            {/* Text content pinned to bottom */}
            <View style={styles.cardText}>
              <Text style={styles.activityName}>{activity.name}</Text>
              <Text style={styles.activityDesc} numberOfLines={2}>
                {activity.description}
              </Text>
              <View style={styles.seasonRow}>
                <Ionicons
                  name="calendar-outline"
                  size={11}
                  color="rgba(255,255,255,0.75)"
                />
                <Text style={styles.seasonText}>{activity.bestSeason}</Text>
              </View>
            </View>

            {/* Arrow button */}
            <View style={[styles.arrowBtn, { backgroundColor: activity.accentColor }]}>
              <Ionicons name="arrow-forward" size={13} color="#fff" />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 48,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  wordmark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  wordmarkLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  wordmarkText: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Montserrat-Bold",
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.text,
    fontSize: 26,
    fontFamily: "Montserrat-Bold",
    letterSpacing: 0.5,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Montserrat-Medium",
    marginTop: 6,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  // Light scrim over entire card so icon is visible on bright photos
  overlayTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  // Stronger dark gradient at the bottom for text legibility
  overlayBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  iconBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: {
    padding: 14,
    paddingBottom: 10,
    gap: 4,
  },
  activityName: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Montserrat-Bold",
    letterSpacing: -0.2,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  activityDesc: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11.5,
    lineHeight: 16,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  seasonText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontWeight: "600",
  },
  arrowBtn: {
    position: "absolute",
    bottom: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
