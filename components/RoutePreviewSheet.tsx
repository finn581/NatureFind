import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import type { RouteResult } from "@/services/mapboxRoutingApi";
import { formatDuration, formatDistance } from "@/services/mapboxRoutingApi";

const SHEET_HEIGHT = 180;

interface Props {
  visible: boolean;
  loading: boolean;
  route: RouteResult | null;
  destinationName: string;
  onClose: () => void;
  onNavigate: () => void;
  onViewDetails?: () => void;
  onShare?: () => void;
}

export default function RoutePreviewSheet({
  visible,
  loading,
  route,
  destinationName,
  onClose,
  onNavigate,
  onViewDetails,
  onShare,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SHEET_HEIGHT,
      useNativeDriver: true,
      damping: 22,
      stiffness: 200,
    }).start();
  }, [visible]);

  if (!visible && !loading) return null;

  return (
    <Animated.View
      style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents={visible ? "auto" : "none"}
    >
      {/* Handle */}
      <View style={styles.handleBar} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.destInfo}>
          <Ionicons name="location" size={16} color={Colors.primary} />
          <Text style={styles.destName} numberOfLines={1}>
            {destinationName}
          </Text>
        </View>
        {onShare && (
          <Pressable onPress={onShare} style={styles.headerIcon} accessibilityLabel="Share park" accessibilityRole="button">
            <Ionicons name="share-outline" size={20} color={Colors.textSecondary} />
          </Pressable>
        )}
        <Pressable onPress={onClose} accessibilityLabel="Close route preview" accessibilityRole="button">
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Getting route…</Text>
        </View>
      ) : route ? (
        <>
          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="time-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.statValue}>{formatDuration(route.duration)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Ionicons name="speedometer-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.statValue}>{formatDistance(route.distance)}</Text>
            </View>
            {route.steps[0] && (
              <>
                <View style={styles.statDivider} />
                <View style={[styles.stat, { flex: 1 }]}>
                  <Ionicons name="arrow-forward-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.firstStep} numberOfLines={1}>
                    {route.steps[0].instruction}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.btnRow}>
            {onViewDetails && (
              <Pressable style={styles.detailsBtn} onPress={onViewDetails} accessibilityRole="button">
                <Text style={styles.detailsBtnText}>View Park</Text>
              </Pressable>
            )}
            <Pressable style={styles.navBtn} onPress={onNavigate} accessibilityRole="button">
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={styles.navBtnText}>Navigate</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={styles.errorText}>Route unavailable</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
    zIndex: 200,
    minHeight: SHEET_HEIGHT,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  destInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  destName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Montserrat-SemiBold",
    flex: 1,
  },
  headerIcon: {
    padding: 4,
    marginRight: 8,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 14,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statValue: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
  },
  statDivider: {
    width: 1,
    height: 18,
    backgroundColor: Colors.border,
  },
  firstStep: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  detailsBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  detailsBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
  },
  navBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  navBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Montserrat-SemiBold",
  },
  errorText: {
    color: Colors.textMuted,
    fontSize: 13,
    paddingVertical: 16,
    textAlign: "center",
  },
});
