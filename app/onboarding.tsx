import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Dimensions,
  SafeAreaView,
  Platform,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";

const { width: W, height: H } = Dimensions.get("window");

const SLIDES = [
  {
    id: "1",
    emoji: "🗺️",
    title: "Explore America's Parks",
    subtitle:
      "Discover 500+ national parks, state parks, and local nature areas — with live maps, trail details, and drive times from your location.",
    accent: "#52b788",
    bg: "#071a0f",
  },
  {
    id: "2",
    emoji: "🌤️",
    title: "Real-Time Conditions",
    subtitle:
      "Know before you go. Live weather scores, 7-day forecasts, trail status, and community condition reports keep you prepared.",
    accent: "#d4a017",
    bg: "#1a1200",
  },
  {
    id: "3",
    emoji: "🦅",
    title: "Log Wildlife Sightings",
    subtitle:
      "Spot something on the trail? Log it with a photo and GPS. See what the community is finding at parks near you.",
    accent: "#7dd3fc",
    bg: "#051524",
  },
  {
    id: "4",
    emoji: "🌿",
    title: "Save & Plan Trips",
    subtitle:
      "Favorite parks, then let NatureFind optimize the perfect multi-stop road trip. Your adventures, perfectly planned.",
    accent: "#95d5b2",
    bg: "#081510",
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const finish = async () => {
    await AsyncStorage.setItem("onboarding_done", "1");
    router.replace("/(tabs)");
  };

  const next = () => {
    if (activeIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      finish();
    }
  };

  const isLast = activeIndex === SLIDES.length - 1;
  const accent = SLIDES[activeIndex].accent;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Skip button */}
      {!isLast && (
        <Pressable style={styles.skipBtn} onPress={finish} accessibilityLabel="Skip onboarding">
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      )}

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / W);
          setActiveIndex(idx);
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: W, backgroundColor: item.bg }]}>
            <View style={styles.emojiWrap}>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <View style={[styles.emojiGlow, { backgroundColor: item.accent + "30" }]} />
            </View>
            <Text style={[styles.title, { color: item.accent }]}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === activeIndex ? accent : "#333",
                width: i === activeIndex ? 22 : 7,
              },
            ]}
          />
        ))}
      </View>

      {/* CTA button */}
      <SafeAreaView style={styles.btnSafe}>
        <Pressable
          style={[styles.ctaBtn, { backgroundColor: accent }]}
          onPress={next}
          accessibilityLabel={isLast ? "Get started" : "Next slide"}
          accessibilityRole="button"
        >
          {isLast ? (
            <>
              <Ionicons name="leaf" size={20} color="#fff" />
              <Text style={styles.ctaText}>Get Started</Text>
            </>
          ) : (
            <>
              <Text style={styles.ctaText}>Next</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#071a0f",
  },
  skipBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : (StatusBar.currentHeight ?? 24) + 12,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    color: "#ffffff80",
    fontSize: 15,
    fontWeight: "500",
  },

  // ── Slide ──
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingTop: 60,
    paddingBottom: 160,
  },
  emojiWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
    position: "relative",
  },
  emoji: {
    fontSize: 96,
    lineHeight: 110,
    zIndex: 1,
  },
  emojiGlow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.3,
    marginBottom: 16,
  },
  subtitle: {
    color: "#a8c5b5",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },

  // ── Dots ──
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    position: "absolute",
    bottom: Platform.OS === "ios" ? 120 : 110,
    left: 0,
    right: 0,
  },
  dot: {
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#333",
  },

  // ── CTA ──
  btnSafe: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
