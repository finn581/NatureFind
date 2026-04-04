import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useSubscription } from "@/context/SubscriptionContext";

interface Props {
  /** Feature name shown in header, e.g. "Full Trail Details" */
  title: string;
  /** Bullet points describing what Pro unlocks */
  bullets: string[];
  /** Accent color for the lock icon circle */
  accentColor?: string;
  /** Emoji shown next to title */
  emoji?: string;
  /** Optional stat line shown above bullets, e.g. "42 campsites · $18/night" */
  statLine?: string;
  /** Context string passed to paywall when CTA is tapped */
  paywallContext?: string;
}

export default function TeaserCard({
  title,
  bullets,
  accentColor = Colors.primary,
  emoji,
  statLine,
  paywallContext,
}: Props) {
  const { gateFeature, setShowPaywall } = useSubscription();

  const handleUnlock = () => {
    if (paywallContext) {
      gateFeature(paywallContext);
    } else {
      setShowPaywall(true);
    }
  };

  return (
    <View style={[s.card, { borderColor: accentColor + "40" }]}>
      {/* Lock header */}
      <View style={s.header}>
        <View style={[s.lockCircle, { backgroundColor: accentColor + "20" }]}>
          <Ionicons name="lock-closed" size={14} color={accentColor} />
        </View>
        <Text style={s.title}>
          {emoji ? `${emoji} ` : ""}Unlock {title}
        </Text>
      </View>

      {/* Optional stat line */}
      {statLine && <Text style={s.statLine}>{statLine}</Text>}

      {/* Bullet list */}
      <View style={s.bullets}>
        {bullets.map((b) => (
          <View key={b} style={s.bulletRow}>
            <Ionicons name="checkmark" size={14} color={accentColor} />
            <Text style={s.bulletText}>{b}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <Pressable style={[s.cta, { backgroundColor: accentColor }]} onPress={handleUnlock}>
        <Text style={s.ctaText}>Unlock Pro — $9.99</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lockCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  statLine: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
    marginLeft: 40,
  },
  bullets: {
    marginTop: 12,
    gap: 6,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
  },
  bulletText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    flex: 1,
  },
  cta: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  ctaText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
