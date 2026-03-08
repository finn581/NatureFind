import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Colors } from "@/constants/Colors";
import { useAuth } from "@/context/AuthContext";
import { addSighting, uploadSightingPhoto, encodeGeohash } from "@/services/firebase";
import { SPECIES_CATEGORIES, type SpeciesCategory } from "@/constants/Species";
import { fetchParks } from "@/services/npsApi";
import { matchGPSTrace } from "@/services/mapboxRoutingApi";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Confidence = "certain" | "probable" | "possible";

export default function SubmitSightingScreen() {
  const params = useLocalSearchParams<{ parkCode: string; parkName: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [resolvedParkCode, setResolvedParkCode] = useState(params.parkCode ?? "");
  const [resolvedParkName, setResolvedParkName] = useState(params.parkName ?? "");
  const [parkDetecting, setParkDetecting] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<SpeciesCategory | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState("");
  const [customSpecies, setCustomSpecies] = useState("");
  const [count, setCount] = useState(1);
  const [confidence, setConfidence] = useState<Confidence>("certain");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const locationTraceRef = useRef<[number, number][]>([]);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  const [speciesSearch, setSpeciesSearch] = useState("");

  useEffect(() => {
    fetchLocation();
  }, []);

  async function fetchLocation() {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setLocation(coords);
      locationTraceRef.current = [[loc.coords.longitude, loc.coords.latitude]];

      // Start background trace collection for map matching
      locationWatchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (update) => {
          locationTraceRef.current.push([update.coords.longitude, update.coords.latitude]);
        }
      );

      // Auto-detect nearest park if none provided
      if (!params.parkCode) {
        detectNearestPark(coords.latitude, coords.longitude);
      }
    } catch {
      // location optional
    } finally {
      setLocationLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      locationWatchRef.current?.remove();
    };
  }, []);

  async function detectNearestPark(lat: number, lng: number) {
    setParkDetecting(true);
    try {
      const res = await fetchParks({ limit: 100 });
      const withCoords = res.data.filter((p) => p.latitude && p.longitude);
      if (!withCoords.length) return;
      let nearest = withCoords[0];
      let minDist = haversineKm(lat, lng, parseFloat(nearest.latitude), parseFloat(nearest.longitude));
      for (const p of withCoords.slice(1)) {
        const d = haversineKm(lat, lng, parseFloat(p.latitude), parseFloat(p.longitude));
        if (d < minDist) { minDist = d; nearest = p; }
      }
      setResolvedParkCode(nearest.parkCode);
      setResolvedParkName(nearest.fullName);
    } catch {
      // non-fatal
    } finally {
      setParkDetecting(false);
    }
  }

  async function pickPhoto() {
    if (photos.length >= 3) {
      Alert.alert("Limit reached", "You can add up to 3 photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  }

  async function takePhoto() {
    if (photos.length >= 3) {
      Alert.alert("Limit reached", "You can add up to 3 photos.");
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Camera access is needed to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  }

  const speciesName = selectedSpecies === "Other" || selectedSpecies === "Other Wildlife"
    ? customSpecies.trim() || selectedSpecies
    : selectedSpecies;

  async function handleSubmit() {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to report a sighting.");
      return;
    }
    if (!selectedCategory) {
      Alert.alert("Missing Info", "Please select a wildlife category.");
      return;
    }
    if (!selectedSpecies) {
      Alert.alert("Missing Info", "Please select a species.");
      return;
    }
    if (!location) {
      Alert.alert("Location Needed", "We couldn't get your location. Please try again.", [
        { text: "Retry", onPress: fetchLocation },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    if (!resolvedParkCode) {
      Alert.alert("Park Required", "Unable to determine your nearest park. Please try again.");
      return;
    }

    setSubmitting(true);
    try {
      // Stop trace collection before submit
      locationWatchRef.current?.remove();
      locationWatchRef.current = null;

      // Attempt map matching to snap location to trail/path network
      let finalLocation = location;
      const trace = locationTraceRef.current;
      if (trace.length >= 2) {
        try {
          const match = await matchGPSTrace(trace, "walking");
          if (match && match.confidence > 0.5 && match.snappedCoords.length > 0) {
            const last = match.snappedCoords[match.snappedCoords.length - 1];
            finalLocation = { longitude: last[0], latitude: last[1] };
          }
        } catch {
          // non-fatal — use raw GPS if matching fails
        }
      }

      const uploadResults = await Promise.allSettled(
        photos.map((uri, i) => uploadSightingPhoto(user.uid, resolvedParkCode, uri, i))
      );
      const uploadedUrls = uploadResults
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value);

      await addSighting(resolvedParkCode, {
        userId: user.uid,
        userDisplayName: user.displayName ?? "Anonymous",
        species: {
          commonName: speciesName,
          categoryId: selectedCategory.id,
          categoryLabel: selectedCategory.label,
          emoji: selectedCategory.emoji,
        },
        location: {
          latitude: finalLocation.latitude,
          longitude: finalLocation.longitude,
          geohash: encodeGeohash(finalLocation.latitude, finalLocation.longitude, 6),
        },
        parkCode: resolvedParkCode,
        parkName: resolvedParkName,
        photoUrls: uploadedUrls,
        notes,
        confidence,
        count,
      });

      Alert.alert("Sighting Reported!", `Your ${speciesName} sighting has been submitted. Thank you for contributing to wildlife data! 🦅`, [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to submit sighting. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredSpecies = selectedCategory
    ? selectedCategory.species.filter((s) =>
        s.toLowerCase().includes(speciesSearch.toLowerCase())
      )
    : [];

  const confidenceOptions: { value: Confidence; label: string; color: string }[] = [
    { value: "certain", label: "Certain", color: Colors.primaryLight },
    { value: "probable", label: "Probable", color: Colors.accent },
    { value: "possible", label: "Possible", color: Colors.textSecondary },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Report Sighting</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {parkDetecting ? "Detecting nearest park…" : (resolvedParkName || "No park selected")}
            </Text>
          </View>
        </View>

        {/* Step 1: Category */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Wildlife Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
            {SPECIES_CATEGORIES.map((cat) => {
              const active = selectedCategory?.id === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  style={[styles.categoryChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    setSelectedSpecies("");
                    setCustomSpecies("");
                    setShowSpeciesPicker(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={cat.label}
                >
                  <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                  <Text style={[styles.categoryLabel, active && { color: "#fff" }]}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Step 2: Species */}
        {selectedCategory && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Species</Text>
            <Pressable
              style={styles.speciesBtn}
              onPress={() => setShowSpeciesPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Select species"
            >
              <Text style={[styles.speciesBtnText, !selectedSpecies && { color: Colors.textMuted }]}>
                {selectedSpecies || `Select ${selectedCategory.label} species…`}
              </Text>
              <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
            </Pressable>
            {(selectedSpecies === "Other" || selectedSpecies.startsWith("Other ")) && (
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="Enter species name…"
                placeholderTextColor={Colors.textMuted}
                value={customSpecies}
                onChangeText={setCustomSpecies}
              />
            )}
          </View>
        )}

        {/* Step 3: Count */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Number Observed</Text>
          <View style={styles.countRow}>
            <Pressable style={styles.countBtn} onPress={() => setCount((c) => Math.max(1, c - 1))} accessibilityRole="button" accessibilityLabel="Decrease count">
              <Ionicons name="remove" size={20} color={Colors.text} />
            </Pressable>
            <Text style={styles.countValue}>{count}</Text>
            <Pressable style={styles.countBtn} onPress={() => setCount((c) => Math.min(999, c + 1))} accessibilityRole="button" accessibilityLabel="Increase count">
              <Ionicons name="add" size={20} color={Colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Step 4: Confidence */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Identification Confidence</Text>
          <View style={styles.confidenceRow}>
            {confidenceOptions.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.confidenceChip, confidence === opt.value && { backgroundColor: opt.color + "33", borderColor: opt.color }]}
                onPress={() => setConfidence(opt.value)}
                accessibilityRole="radio"
                accessibilityLabel={opt.label}
              >
                <Text style={[styles.confidenceText, confidence === opt.value && { color: opt.color }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Step 5: Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Photos (optional, up to 3)</Text>
          <View style={styles.photoRow}>
            {photos.map((uri, i) => (
              <View key={i} style={styles.photoThumb}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Pressable
                  style={styles.removePhoto}
                  onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Ionicons name="close-circle" size={20} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < 3 && (
              <View style={styles.addPhotoRow}>
                <Pressable style={styles.addPhotoBtn} onPress={takePhoto} accessibilityRole="button" accessibilityLabel="Take photo">
                  <Ionicons name="camera-outline" size={24} color={Colors.primaryLight} />
                  <Text style={styles.addPhotoText}>Camera</Text>
                </Pressable>
                <Pressable style={styles.addPhotoBtn} onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Choose from library">
                  <Ionicons name="image-outline" size={24} color={Colors.primaryLight} />
                  <Text style={styles.addPhotoText}>Library</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Step 6: Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Observation Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Behavior, habitat, distinguishing features…"
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Location status */}
        <View style={styles.locationRow}>
          <Ionicons
            name={location ? "location" : "location-outline"}
            size={16}
            color={location ? Colors.primaryLight : Colors.textMuted}
          />
          {locationLoading ? (
            <ActivityIndicator size="small" color={Colors.primaryLight} style={{ marginLeft: 6 }} />
          ) : (
            <Text style={[styles.locationText, { color: location ? Colors.primaryLight : Colors.textMuted }]}>
              {location
                ? `GPS: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                : "Location unavailable — tap to retry"}
            </Text>
          )}
          {!location && !locationLoading && (
            <Pressable onPress={fetchLocation} accessibilityRole="button" accessibilityLabel="Retry location">
              <Ionicons name="refresh-outline" size={16} color={Colors.accent} style={{ marginLeft: 6 }} />
            </Pressable>
          )}
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit sighting"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="leaf" size={20} color="#fff" />
              <Text style={styles.submitText}>Submit Sighting</Text>
            </>
          )}
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Species Picker Modal */}
      <Modal visible={showSpeciesPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedCategory?.emoji} {selectedCategory?.label}
            </Text>
            <Pressable onPress={() => setShowSpeciesPicker(false)} accessibilityRole="button" accessibilityLabel="Close species picker">
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search species…"
            placeholderTextColor={Colors.textMuted}
            value={speciesSearch}
            onChangeText={setSpeciesSearch}
            autoFocus
          />
          <FlatList
            data={filteredSpecies}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.speciesRow, selectedSpecies === item && styles.speciesRowActive]}
                onPress={() => {
                  setSelectedSpecies(item);
                  setSpeciesSearch("");
                  setShowSpeciesPicker(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={item}
              >
                <Text style={[styles.speciesRowText, selectedSpecies === item && { color: Colors.primaryLight }]}>
                  {item}
                </Text>
                {selectedSpecies === item && (
                  <Ionicons name="checkmark" size={18} color={Colors.primaryLight} />
                )}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: Colors.border }} />}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Montserrat-Bold",
  },
  headerSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Montserrat-Medium",
    marginTop: 2,
  },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Montserrat-Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  categoryRow: { marginHorizontal: -4 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: 8,
  },
  categoryEmoji: { fontSize: 16 },
  categoryLabel: { color: Colors.text, fontSize: 13, fontFamily: "Montserrat-Medium" },
  speciesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  speciesBtnText: { color: Colors.text, fontSize: 15 },
  countRow: { flexDirection: "row", alignItems: "center", gap: 20 },
  countBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countValue: { color: Colors.text, fontSize: 24, fontFamily: "Montserrat-Bold", minWidth: 40, textAlign: "center" },
  confidenceRow: { flexDirection: "row", gap: 10 },
  confidenceChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
  },
  confidenceText: { color: Colors.textSecondary, fontSize: 13, fontFamily: "Montserrat-Medium" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoThumb: {
    width: 90,
    height: 90,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  removePhoto: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
  },
  addPhotoRow: { flexDirection: "row", gap: 10 },
  addPhotoBtn: {
    width: 90,
    height: 90,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoText: { color: Colors.primaryLight, fontSize: 11 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notesInput: { height: 100, textAlignVertical: "top" },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 6,
  },
  locationText: { fontSize: 12, fontFamily: "Montserrat-Medium", flex: 1 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  submitText: { color: "#fff", fontSize: 17, fontFamily: "Montserrat-Bold" },
  // Modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { color: Colors.text, fontSize: 18, fontFamily: "Montserrat-Bold" },
  searchInput: {
    backgroundColor: Colors.surface,
    margin: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  speciesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  speciesRowActive: { backgroundColor: Colors.surface },
  speciesRowText: { color: Colors.text, fontSize: 15 },
});
