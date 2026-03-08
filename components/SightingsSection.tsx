import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { getSightings, type SightingDoc } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";

function timeAgo(ts: any): string {
  if (!ts?.toDate) return "just now";
  const diff = (Date.now() - ts.toDate().getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return ts.toDate().toLocaleDateString();
}

const CONFIDENCE_COLOR: Record<string, string> = {
  certain: Colors.primaryLight,
  probable: Colors.accent,
  possible: Colors.textSecondary,
};

interface Props {
  parkCode: string;
  parkName: string;
}

export default function SightingsSection({ parkCode, parkName }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [sightings, setSightings] = useState<SightingDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSightings();
  }, [parkCode]);

  async function loadSightings() {
    setLoading(true);
    try {
      const data = await getSightings(parkCode, 5);
      setSightings(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function handleReport() {
    if (!user) {
      router.push("/profile" as any);
      return;
    }
    router.push({
      pathname: "/sighting/submit",
      params: { parkCode, parkName },
    } as any);
  }

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Wildlife Sightings</Text>
          <Text style={styles.subtitle}>Community-reported observations</Text>
        </View>
        <Pressable
          style={styles.reportBtn}
          onPress={handleReport}
          accessibilityRole="button"
          accessibilityLabel="Report a wildlife sighting"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.reportBtnText}>Report</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
      ) : sightings.length === 0 ? (
        <Pressable style={styles.emptyCard} onPress={handleReport} accessibilityRole="button" accessibilityLabel="Be the first to report a sighting">
          <Text style={styles.emptyEmoji}>🔭</Text>
          <Text style={styles.emptyTitle}>No sightings yet</Text>
          <Text style={styles.emptyDesc}>Be the first to report wildlife at this park</Text>
          <View style={styles.emptyBtn}>
            <Ionicons name="add-circle-outline" size={16} color={Colors.primaryLight} />
            <Text style={styles.emptyBtnText}>Report a Sighting</Text>
          </View>
        </Pressable>
      ) : (
        <>
          {sightings.map((s) => (
            <View key={s.id} style={styles.sightingCard}>
              {/* Left: emoji + info */}
              <View style={styles.sightingLeft}>
                <View style={styles.emojiWrap}>
                  <Text style={styles.emoji}>{s.species.emoji}</Text>
                </View>
                <View style={styles.sightingInfo}>
                  <View style={styles.speciesRow}>
                    <Text style={styles.speciesName}>{s.species.commonName}</Text>
                    {s.count > 1 && (
                      <View style={styles.countBadge}>
                        <Text style={styles.countText}>×{s.count}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.categoryLabel}>{s.species.categoryLabel}</Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.confidenceDot, { backgroundColor: CONFIDENCE_COLOR[s.confidence] }]} />
                    <Text style={styles.metaText}>{s.confidence}</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText}>{timeAgo(s.timestamp)}</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText}>{s.userDisplayName}</Text>
                  </View>
                  {s.notes ? (
                    <Text style={styles.notes} numberOfLines={2}>{s.notes}</Text>
                  ) : null}
                </View>
              </View>

              {/* Right: photo thumbnail */}
              {s.photoUrls?.length > 0 && (
                <Image
                  source={{ uri: s.photoUrls[0] }}
                  style={styles.photoThumb}
                  contentFit="cover"
                />
              )}
            </View>
          ))}

          <Pressable
            style={styles.viewAllBtn}
            onPress={handleReport}
            accessibilityRole="button"
            accessibilityLabel="Report a sighting"
          >
            <Ionicons name="add-circle-outline" size={16} color={Colors.primaryLight} />
            <Text style={styles.viewAllText}>Report a Sighting</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Montserrat-Bold",
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
  },
  reportBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Montserrat-Bold",
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
  },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { color: Colors.text, fontSize: 16, fontFamily: "Montserrat-Bold", marginBottom: 4 },
  emptyDesc: { color: Colors.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 12 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  emptyBtnText: { color: Colors.primaryLight, fontSize: 14, fontFamily: "Montserrat-Medium" },
  sightingCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  sightingLeft: { flexDirection: "row", flex: 1, gap: 10 },
  emojiWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 22 },
  sightingInfo: { flex: 1 },
  speciesRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  speciesName: { color: Colors.text, fontSize: 15, fontFamily: "Montserrat-Bold", flexShrink: 1 },
  countBadge: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countText: { color: Colors.primaryLight, fontSize: 11, fontFamily: "Montserrat-Bold" },
  categoryLabel: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  confidenceDot: { width: 6, height: 6, borderRadius: 3 },
  metaText: { color: Colors.textMuted, fontSize: 11 },
  metaDot: { color: Colors.textMuted, fontSize: 11 },
  notes: { color: Colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 16 },
  photoThumb: { width: 64, height: 64, borderRadius: 8, marginLeft: 8 },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  viewAllText: { color: Colors.primaryLight, fontSize: 14, fontFamily: "Montserrat-Medium" },
});
