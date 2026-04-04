import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  size?: "small" | "default";
}

export default function ProBadge({ size = "default" }: Props) {
  const isSmall = size === "small";
  return (
    <View style={[s.badge, isSmall && s.badgeSmall]}>
      <Text style={[s.text, isSmall && s.textSmall]}>PRO</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(45,106,79,0.35)",
    borderWidth: 1,
    borderColor: "rgba(45,106,79,0.6)",
  },
  badgeSmall: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  text: {
    color: "#40916c",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  textSmall: {
    fontSize: 7,
    letterSpacing: 0.8,
  },
});
