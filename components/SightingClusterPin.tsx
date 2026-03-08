import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "@/constants/Colors";

interface Props {
  emoji: string;
  count: number;
}

export default function SightingClusterPin({ emoji, count }: Props) {
  const isCluster = count > 1;
  const size = isCluster ? 50 : 40;

  return (
    <View
      style={[
        styles.pin,
        { width: size, height: size, borderRadius: size / 2 },
        isCluster && styles.clusterBorder,
      ]}
    >
      <Text style={[styles.emoji, isCluster && styles.emojiCluster]}>{emoji}</Text>
      {isCluster && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? "99+" : String(count)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  clusterBorder: {
    borderWidth: 2.5,
    borderColor: Colors.primaryLight,
  },
  emoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  emojiCluster: {
    fontSize: 22,
    lineHeight: 26,
  },
  badge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    backgroundColor: Colors.primary,
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
});
