import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useSubscription } from "@/context/SubscriptionContext";
import { useAuth } from "@/context/AuthContext";

const FEATURES = [
  { emoji: "🥾", title: "Trail Routes & Details", desc: "Full polylines, distance, surface & dog-friendly status" },
  { emoji: "⛺", title: "Campground Deep-Dive", desc: "Amenities, campsites, photos & reservation links" },
  { emoji: "🏔️", title: "3D Satellite Terrain", desc: "Real elevation with satellite imagery" },
  { emoji: "🔭", title: "Points of Interest", desc: "Viewpoints, waterfalls, peaks & natural springs" },
  { emoji: "🛰️", title: "Satellite Imagery", desc: "High-res satellite basemap toggle" },
  { emoji: "⚠️", title: "Park Alerts", desc: "Closures, hazards & real-time NPS alerts" },
  { emoji: "🌿", title: "Air Quality Index", desc: "AQI score, pollutant breakdown & health tips" },
  { emoji: "🏪", title: "Nearby Amenities", desc: "Gas, restaurants, lodging near parks" },
  { emoji: "🎯", title: "Things To Do", desc: "NPS-curated activities & experiences" },
  { emoji: "⭐", title: "Activity Details & Reviews", desc: "Photos, hours, reviews & directions" },
  { emoji: "✨", title: "AI Trip Planner", desc: "AI-powered day-by-day itineraries" },
  { emoji: "❤️", title: "Unlimited Favorites", desc: "Save unlimited parks & create collections" },
];

export default function Paywall() {
  const { price, purchase, restore, purchasing, showPaywall, setShowPaywall, paywallContext } =
    useSubscription();
  const { user } = useAuth();
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);

  const handlePurchase = async () => {
    if (!user) {
      setShowPaywall(false);
      Alert.alert(
        "Sign In Required",
        "Sign in to purchase NatureFind Pro.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign In",
            onPress: () => router.push("/(tabs)/profile"),
          },
        ],
      );
      return;
    }
    const success = await purchase();
    if (success === false && !purchasing) {
      // User cancelled — do nothing
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const restored = await restore();
    setRestoring(false);
    if (restored) {
      Alert.alert("Restored", "Your Pro purchase has been restored.");
    } else {
      Alert.alert("No Purchase Found", "We couldn't find a Pro purchase for this Apple ID.");
    }
  };

  const handleClose = () => {
    setShowPaywall(false);
  };

  return (
    <Modal
      visible={showPaywall}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={s.container}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Close button */}
          <Pressable style={s.closeBtn} onPress={handleClose}>
            <Text style={s.closeTxt}>✕</Text>
          </Pressable>

          {/* Header */}
          <Text style={s.badge}>PRO</Text>
          <Text style={s.title}>NatureFind Pro</Text>
          <Text style={s.subtitle}>
            {paywallContext ?? "Unlock the full outdoor experience"}
          </Text>

          {/* Price highlight */}
          <View style={s.priceCard}>
            <Text style={s.priceAmount}>{price}</Text>
            <Text style={s.priceLabel}>one-time purchase</Text>
            <Text style={s.priceNote}>Pay once, keep forever</Text>
          </View>

          {/* Features */}
          <View style={s.features}>
            {FEATURES.map((f) => (
              <View key={f.title} style={s.featureRow}>
                <Text style={s.featureEmoji}>{f.emoji}</Text>
                <View style={s.featureText}>
                  <Text style={s.featureTitle}>{f.title}</Text>
                  <Text style={s.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          <Pressable
            style={[s.cta, purchasing && s.ctaDisabled]}
            onPress={handlePurchase}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaTxt}>
                {user ? `Unlock Pro — ${price}` : "Sign In to Purchase"}
              </Text>
            )}
          </Pressable>

          {/* Restore */}
          <Pressable onPress={handleRestore} disabled={restoring}>
            <Text style={s.restore}>
              {restoring ? "Restoring..." : "Restore Purchase"}
            </Text>
          </Pressable>

          <Text style={s.legal}>
            Payment will be charged to your Apple ID account at confirmation of
            purchase. This is a one-time purchase — no subscription, no recurring
            charges.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: "center",
  },
  closeBtn: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: { color: "#fff", fontSize: 18 },
  badge: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
    overflow: "hidden",
  },
  title: {
    marginTop: 16,
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  priceCard: {
    marginTop: 24,
    width: "100%",
    backgroundColor: "rgba(34,197,94,0.08)",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
    padding: 20,
    alignItems: "center",
  },
  priceAmount: {
    fontSize: 42,
    fontWeight: "800",
    color: "#fff",
  },
  priceLabel: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  priceNote: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
  },
  features: {
    marginTop: 28,
    width: "100%",
    gap: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  featureEmoji: {
    fontSize: 28,
    width: 40,
    textAlign: "center",
  },
  featureText: { flex: 1 },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  featureDesc: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginTop: 1,
  },
  cta: {
    marginTop: 24,
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.6 },
  ctaTxt: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  restore: {
    marginTop: 16,
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "underline",
  },
  legal: {
    marginTop: 20,
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    lineHeight: 16,
  },
});
