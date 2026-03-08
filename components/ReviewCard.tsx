import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import type { ReviewDoc } from "@/services/firebase";

function timeAgo(ts: any): string {
  const ms = typeof ts?.toMillis === "function" ? ts.toMillis() : null;
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface ReviewCardProps {
  review: ReviewDoc;
  onReport?: () => void;
  currentUid?: string;
  onDelete?: () => void;
}

export default function ReviewCard({ review, onReport, currentUid, onDelete }: ReviewCardProps) {
  const isOwner = currentUid === review.uid;

  return (
    <View style={styles.card} accessibilityLabel={`Review by ${review.displayName}, ${review.rating} stars`}>
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{review.displayName}</Text>
          {!!timeAgo(review.createdAt) && (
            <Text style={styles.timestamp}>{timeAgo(review.createdAt)}</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons
                key={i}
                name={i <= review.rating ? "star" : "star-outline"}
                size={14}
                color={Colors.star}
              />
            ))}
          </View>
          {isOwner && onDelete && (
            <TouchableOpacity onPress={() =>
              Alert.alert("Delete review", "This cannot be undone.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: onDelete },
              ])}>
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
            </TouchableOpacity>
          )}
          {!isOwner && onReport && (
            <Pressable
              onPress={onReport}
              hitSlop={8}
              accessibilityLabel="Report this review"
              accessibilityRole="button"
            >
              <Ionicons name="flag-outline" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>
      <Text style={styles.text}>{review.text}</Text>
      {(review.imageUrls ?? []).length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6 }}>
          {review.imageUrls!.map((url, i) => (
            <Image key={i} source={{ uri: url }}
              style={{ width: 80, height: 60, borderRadius: 6 }} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  name: {
    color: Colors.text,
    fontWeight: "600",
    fontSize: 14,
  },
  timestamp: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  stars: {
    flexDirection: "row",
    gap: 2,
  },
  text: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
