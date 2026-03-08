import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "@/constants/Colors";

interface Props {
  label?: string;
}

export default function ParkMapPin({ label }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.pin}>
        <Text style={styles.icon}>🌲</Text>
      </View>
      {label ? (
        <View style={styles.labelBubble}>
          <Text style={styles.labelText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 3,
  },
  pin: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  icon: {
    fontSize: 17,
    lineHeight: 21,
  },
  labelBubble: {
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    maxWidth: 140,
  },
  labelText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
});
