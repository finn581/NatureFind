import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Linking,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import * as ImagePicker from "expo-image-picker";

interface ReviewFormProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number, text: string, imageUris: string[]) => Promise<void>;
}

export default function ReviewForm({ visible, onClose, onSubmit }: ReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [imageUris, setImageUris] = useState<string[]>([]);

  async function pickPhoto() {
    if (imageUris.length >= 3) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Enable photo access in Settings.", [
        { text: "Open Settings", onPress: () => Linking.openSettings() },
        { text: "Cancel" },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      aspect: [4, 3],
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUris((prev) => [...prev, result.assets[0].uri]);
    }
  }

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(rating, text.trim(), imageUris);
      setText("");
      setRating(5);
      setImageUris([]);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Write a Review</Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close review form"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Pressable
                key={i}
                onPress={() => setRating(i)}
                accessibilityLabel={`Rate ${i} star${i !== 1 ? "s" : ""}`}
                accessibilityRole="button"
              >
                <Ionicons
                  name={i <= rating ? "star" : "star-outline"}
                  size={32}
                  color={Colors.star}
                />
              </Pressable>
            ))}
          </View>

          <View style={styles.photoRow}>
            {imageUris.map((uri, i) => (
              <View key={i} style={styles.photoSlot}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity style={styles.photoRemove} onPress={() =>
                  setImageUris((prev) => prev.filter((_, j) => j !== i))}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {imageUris.length < 3 && (
              <TouchableOpacity style={styles.photoAdd} onPress={pickPhoto}>
                <Ionicons name="camera-outline" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Share your experience..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            accessibilityLabel="Review text"
          />

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !text.trim()}
            accessibilityLabel={submitting ? "Submitting review" : "Submit review"}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {submitting ? "Submitting..." : "Submit Review"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Colors.overlay,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  stars: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    marginBottom: 16,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  photoRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  photoSlot: { width: 72, height: 72, borderRadius: 8, overflow: "hidden", position: "relative" },
  photoThumb: { width: "100%", height: "100%" },
  photoRemove: {
    position: "absolute", top: 2, right: 2, backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10, width: 18, height: 18, alignItems: "center", justifyContent: "center",
  },
  photoAdd: {
    width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderStyle: "dashed",
    borderColor: Colors.border, alignItems: "center", justifyContent: "center",
  },
});
