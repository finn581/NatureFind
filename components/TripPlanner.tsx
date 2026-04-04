import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { generateTripPlan, type TripPlan, type TripActivity } from "@/services/geminiApi";

interface Props {
  visible: boolean;
  onClose: () => void;
  userLocation?: string;
  nearbyParks?: string[];
}

const INTEREST_OPTIONS = [
  { label: "Hiking", emoji: "🥾" },
  { label: "Camping", emoji: "⛺" },
  { label: "Wildlife", emoji: "🦅" },
  { label: "Photography", emoji: "📸" },
  { label: "Fishing", emoji: "🎣" },
  { label: "Stargazing", emoji: "🌌" },
  { label: "Scenic Drives", emoji: "🚗" },
  { label: "Family-Friendly", emoji: "👨‍👩‍👧‍👦" },
];

const ACTIVITY_ICONS: Record<string, string> = {
  drive: "car-outline",
  hike: "walk-outline",
  camp: "bonfire-outline",
  explore: "compass-outline",
  wildlife: "paw-outline",
  eat: "restaurant-outline",
};

const ACTIVITY_COLORS: Record<string, string> = {
  drive: "#0ea5e9",
  hike: "#22c55e",
  camp: "#f59e0b",
  explore: "#8b5cf6",
  wildlife: "#ec4899",
  eat: "#f97316",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function TripPlanner({ visible, onClose, userLocation, nearbyParks }: Props) {
  const [step, setStep] = useState<"input" | "loading" | "result">("input");
  const [location, setLocation] = useState(userLocation ?? "");
  const [days, setDays] = useState(3);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [interests, setInterests] = useState<string[]>(["Hiking", "Camping"]);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleInterest = (label: string) => {
    setInterests((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label],
    );
  };

  const handleGenerate = async () => {
    if (!location.trim()) return;
    setStep("loading");
    setError(null);
    const result = await generateTripPlan(location, days, interests, selectedMonth, nearbyParks);
    if (result) {
      setPlan(result);
      setStep("result");
    } else {
      setError("Couldn't generate a trip plan. Try again.");
      setStep("input");
    }
  };

  const handleReset = () => {
    setStep("input");
    setPlan(null);
    setError(null);
  };

  const handleClose = () => {
    onClose();
    // Reset after animation
    setTimeout(() => { setStep("input"); setPlan(null); setError(null); }, 300);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>AI Trip Planner</Text>
          <Pressable style={s.closeBtn} onPress={handleClose}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {step === "input" && (
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            <Text style={s.heroEmoji}>🗺️</Text>
            <Text style={s.heroTitle}>Plan Your Adventure</Text>
            <Text style={s.heroSub}>Tell us what you're looking for and AI will build the perfect trip</Text>

            {/* Location */}
            <Text style={s.label}>Where are you starting from?</Text>
            <TextInput
              style={s.input}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Denver, CO"
              placeholderTextColor={Colors.textMuted}
            />

            {/* Days */}
            <Text style={s.label}>How many days?</Text>
            <View style={s.daysRow}>
              {[1, 2, 3, 5, 7].map((d) => (
                <Pressable
                  key={d}
                  style={[s.dayChip, days === d && s.dayChipActive]}
                  onPress={() => setDays(d)}
                >
                  <Text style={[s.dayChipText, days === d && s.dayChipTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            {/* Month */}
            <Text style={s.label}>What month?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.monthRow}>
              {MONTHS.map((m) => (
                <Pressable
                  key={m}
                  style={[s.dayChip, selectedMonth === m && s.dayChipActive]}
                  onPress={() => setSelectedMonth(m)}
                >
                  <Text style={[s.dayChipText, selectedMonth === m && s.dayChipTextActive]}>
                    {m.slice(0, 3)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Interests */}
            <Text style={s.label}>What do you enjoy?</Text>
            <View style={s.interestsGrid}>
              {INTEREST_OPTIONS.map(({ label, emoji }) => (
                <Pressable
                  key={label}
                  style={[s.interestChip, interests.includes(label) && s.interestChipActive]}
                  onPress={() => toggleInterest(label)}
                >
                  <Text style={s.interestEmoji}>{emoji}</Text>
                  <Text style={[s.interestText, interests.includes(label) && s.interestTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error && <Text style={s.error}>{error}</Text>}

            {/* Generate */}
            <Pressable
              style={[s.generateBtn, !location.trim() && { opacity: 0.4 }]}
              onPress={handleGenerate}
              disabled={!location.trim()}
            >
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={s.generateText}>Generate Trip Plan</Text>
            </Pressable>
          </ScrollView>
        )}

        {step === "loading" && (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.loadingText}>Planning your adventure...</Text>
            <Text style={s.loadingSub}>Finding the best parks, trails, and campgrounds</Text>
          </View>
        )}

        {step === "result" && plan && (
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            <Text style={s.planTitle}>{plan.title}</Text>
            <Text style={s.planSummary}>{plan.summary}</Text>

            {plan.days.map((day) => (
              <View key={day.day} style={s.dayCard}>
                <Text style={s.dayLabel}>{day.label}</Text>
                {day.activities.map((act, i) => (
                  <View key={i} style={s.activityRow}>
                    <View style={[s.activityIcon, { backgroundColor: (ACTIVITY_COLORS[act.type] ?? Colors.primary) + "20" }]}>
                      <Ionicons
                        name={(ACTIVITY_ICONS[act.type] ?? "compass-outline") as any}
                        size={16}
                        color={ACTIVITY_COLORS[act.type] ?? Colors.primary}
                      />
                    </View>
                    <View style={s.activityContent}>
                      <View style={s.activityHeader}>
                        <Text style={s.activityTime}>{act.time}</Text>
                        <Text style={s.activityTitle}>{act.title}</Text>
                      </View>
                      <Text style={s.activityDesc}>{act.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            {plan.packingTips.length > 0 && (
              <View style={s.packingWrap}>
                <Text style={s.packingTitle}>🎒 Packing Tips</Text>
                {plan.packingTips.map((tip, i) => (
                  <View key={i} style={s.packingRow}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                    <Text style={s.packingText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            <Pressable style={s.newPlanBtn} onPress={handleReset}>
              <Ionicons name="refresh" size={16} color={Colors.primary} />
              <Text style={s.newPlanText}>Plan Another Trip</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { color: Colors.text, fontSize: 18, fontFamily: "Montserrat-Bold" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  // Input step
  heroEmoji: { fontSize: 48, textAlign: "center", marginTop: 24 },
  heroTitle: { color: Colors.text, fontSize: 26, fontWeight: "800", textAlign: "center", marginTop: 12 },
  heroSub: { color: Colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 6, marginBottom: 24 },
  label: { color: Colors.text, fontSize: 14, fontFamily: "Montserrat-SemiBold", marginTop: 20, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  daysRow: { flexDirection: "row", gap: 10 },
  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayChipActive: { backgroundColor: Colors.primary + "20", borderColor: Colors.primary },
  dayChipText: { color: Colors.textSecondary, fontSize: 14, fontWeight: "600" },
  dayChipTextActive: { color: Colors.primary },
  monthRow: { gap: 8 },
  interestsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  interestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  interestChipActive: { backgroundColor: Colors.primary + "20", borderColor: Colors.primary },
  interestEmoji: { fontSize: 16 },
  interestText: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
  interestTextActive: { color: Colors.primary },
  error: { color: Colors.error, fontSize: 13, marginTop: 12, textAlign: "center" },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 28,
  },
  generateText: { color: "#fff", fontSize: 17, fontWeight: "800" },

  // Loading step
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { color: Colors.text, fontSize: 18, fontWeight: "700" },
  loadingSub: { color: Colors.textSecondary, fontSize: 14 },

  // Result step
  planTitle: { color: Colors.text, fontSize: 24, fontWeight: "800", marginTop: 20 },
  planSummary: { color: Colors.textSecondary, fontSize: 14, marginTop: 8, lineHeight: 20 },
  dayCard: {
    marginTop: 20,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  dayLabel: { color: Colors.text, fontSize: 16, fontFamily: "Montserrat-Bold", marginBottom: 12 },
  activityRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  activityIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  activityContent: { flex: 1 },
  activityHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityTime: { color: Colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  activityTitle: { color: Colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  activityDesc: { color: Colors.textSecondary, fontSize: 13, marginTop: 3, lineHeight: 18 },
  packingWrap: { marginTop: 20, backgroundColor: Colors.surface, borderRadius: 14, padding: 16 },
  packingTitle: { color: Colors.text, fontSize: 16, fontFamily: "Montserrat-Bold", marginBottom: 10 },
  packingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  packingText: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  newPlanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  newPlanText: { color: Colors.primary, fontSize: 15, fontWeight: "700" },
});
