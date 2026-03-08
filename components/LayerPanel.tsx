import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Switch,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LayerConfig {
  key: string;
  /** Single emoji shown in the tinted circle */
  emoji: string;
  name: string;
  description: string;
  /** Accent color used for the switch, left border, and icon bg */
  color: string;
  active: boolean;
  onToggle: () => void;
  /** When provided, replaces description with a live zoom/count hint */
  zoomStatus?: string;
  /** Optional node rendered below the row when the layer is active */
  extra?: React.ReactNode;
}

export interface LayerGroup {
  title: string;
  layers: LayerConfig[];
}

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  groups: LayerGroup[];
  /** Number of currently active layers — shown as a badge on the button */
  activeCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SHEET_HEIGHT = 480;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LayerPanel({ open, onOpen, onClose, groups, activeCount }: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  // Track whether the sheet is fully off-screen so we can unmount the backdrop
  const [sheetMounted, setSheetMounted] = useState(false);

  useEffect(() => {
    if (open) setSheetMounted(true);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: open ? 0 : SHEET_HEIGHT,
        useNativeDriver: true,
        damping: 22,
        stiffness: 200,
      }),
      Animated.timing(backdropAnim, {
        toValue: open ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !open) setSheetMounted(false);
    });
  }, [open]);

  return (
    <>
      {/* ── Floating button ── */}
      <Pressable
        style={styles.floatingBtn}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Open map layers"
      >
        <Ionicons name="layers" size={19} color="#fff" />
        {activeCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        )}
      </Pressable>

      {/* ── Backdrop — only mounted while sheet is animating or open ── */}
      {sheetMounted && (
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
          pointerEvents={open ? "auto" : "none"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
      )}

      {/* ── Bottom sheet — only mounted while open or animating ── */}
      {sheetMounted && (
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        pointerEvents={open ? "auto" : "none"}
      >
        {/* Handle */}
        <View style={styles.handleBar} />

        {/* Header row */}
        <View style={styles.sheetHeader}>
          <Ionicons name="layers" size={16} color={Colors.textSecondary} />
          <Text style={styles.sheetTitle}>Map Layers</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close layers panel"
          >
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {groups.map((group, gi) => (
            <View key={group.title} style={gi > 0 ? styles.groupSeparator : undefined}>
              <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>

              {group.layers.map((layer) => (
                <View key={layer.key} style={styles.layerBlock}>
                  {/* Main row */}
                  <View
                    style={[
                      styles.layerRow,
                      layer.active && {
                        backgroundColor: layer.color + "14",
                        borderLeftColor: layer.color,
                      },
                    ]}
                  >
                    {/* Icon circle */}
                    <View style={[styles.layerIcon, { backgroundColor: layer.color + "28" }]}>
                      <Text style={styles.layerEmoji}>{layer.emoji}</Text>
                    </View>

                    {/* Name + status */}
                    <View style={styles.layerInfo}>
                      <Text style={styles.layerName}>{layer.name}</Text>
                      <Text style={styles.layerDesc} numberOfLines={1}>
                        {layer.active && layer.zoomStatus ? layer.zoomStatus : layer.description}
                      </Text>
                    </View>

                    {/* Toggle */}
                    <Switch
                      value={layer.active}
                      onValueChange={layer.onToggle}
                      trackColor={{ false: Colors.border, true: layer.color }}
                      ios_backgroundColor={Colors.border}
                    />
                  </View>

                  {/* Extra content (e.g. date filter chips) */}
                  {layer.active && layer.extra && (
                    <View style={[styles.extraWrap, { borderLeftColor: layer.color }]}>
                      {layer.extra}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}

          <View style={{ height: 28 }} />
        </ScrollView>
      </Animated.View>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Floating button
  floatingBtn: {
    position: "absolute",
    top: 100,
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#000",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  // Backdrop
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 99,
  },

  // Sheet
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: SHEET_HEIGHT,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
    zIndex: 100,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sheetTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Montserrat-Bold",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Groups
  groupSeparator: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  groupTitle: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: "Montserrat-SemiBold",
    letterSpacing: 1,
    marginBottom: 6,
    paddingLeft: 4,
  },

  // Layer rows
  layerBlock: {
    marginBottom: 2,
  },
  layerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingRight: 12,
    paddingLeft: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  layerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  layerEmoji: {
    fontSize: 18,
  },
  layerInfo: {
    flex: 1,
    gap: 2,
  },
  layerName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Montserrat-SemiBold",
  },
  layerDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Montserrat-Medium",
  },

  // Extra content below row
  extraWrap: {
    marginTop: 0,
    marginBottom: 4,
    marginLeft: 16,
    paddingLeft: 12,
    borderLeftWidth: 3,
    paddingVertical: 8,
  },
});
