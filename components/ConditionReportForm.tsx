import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import type { ConditionReportDoc } from "@/services/firebase";

type TrailStatus = ConditionReportDoc["trailStatus"];
type WildlifeActivity = ConditionReportDoc["wildlifeActivity"];
type Crowding = ConditionReportDoc["crowding"];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    trailStatus: TrailStatus,
    wildlifeActivity: WildlifeActivity,
    crowding: Crowding,
    accessNotes: string,
  ) => Promise<void>;
}

function SegmentPicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={sp.wrap}>
      <Text style={sp.label}>{label}</Text>
      <View style={sp.row}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              style={[sp.btn, active && { backgroundColor: opt.color ?? Colors.primary }]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={[sp.btnText, active && sp.btnTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const sp = StyleSheet.create({
  wrap: { marginBottom: 18 },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
  },
  btnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: "500" },
  btnTextActive: { color: "#fff" },
});

export default function ConditionReportForm({ visible, onClose, onSubmit }: Props) {
  const [trailStatus, setTrailStatus] = useState<TrailStatus>("open");
  const [wildlifeActivity, setWildlifeActivity] = useState<WildlifeActivity>("moderate");
  const [crowding, setCrowding] = useState<Crowding>("light");
  const [accessNotes, setAccessNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(trailStatus, wildlifeActivity, crowding, accessNotes.trim());
      setAccessNotes("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Report Conditions</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SegmentPicker
            label="Trail Status"
            value={trailStatus}
            onChange={setTrailStatus}
            options={[
              { value: "open", label: "Open", color: "#2d6a4f" },
              { value: "partial", label: "Partial", color: "#b45309" },
              { value: "closed", label: "Closed", color: "#991b1b" },
              { value: "unknown", label: "Unknown", color: "#374151" },
            ]}
          />

          <SegmentPicker
            label="Wildlife Activity"
            value={wildlifeActivity}
            onChange={setWildlifeActivity}
            options={[
              { value: "high", label: "High", color: "#1e6b2e" },
              { value: "moderate", label: "Moderate", color: "#a16207" },
              { value: "low", label: "Low", color: "#374151" },
              { value: "none", label: "None", color: "#4b1e1e" },
            ]}
          />

          <SegmentPicker
            label="Crowding"
            value={crowding}
            onChange={setCrowding}
            options={[
              { value: "empty", label: "Empty", color: "#1e4d6b" },
              { value: "light", label: "Light", color: "#1e6b2e" },
              { value: "moderate", label: "Moderate", color: "#a16207" },
              { value: "crowded", label: "Crowded", color: "#991b1b" },
            ]}
          />

          <View style={styles.notesWrap}>
            <Text style={styles.notesLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Trail conditions, road closures, wildlife spotted..."
              placeholderTextColor={Colors.textMuted}
              value={accessNotes}
              onChangeText={(t) => setAccessNotes(t.slice(0, 280))}
              multiline
              numberOfLines={3}
              maxLength={280}
            />
            <Text style={styles.charCount}>{accessNotes.length}/280</Text>
          </View>

          <Pressable
            style={[styles.submitBtn, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityLabel="Submit condition report"
            accessibilityRole="button"
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.submitText}>Submit Report</Text>
                </>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: "700" },
  closeBtn: { padding: 4 },
  body: { padding: 20, paddingBottom: 48 },
  notesWrap: { marginBottom: 24 },
  notesLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  notesInput: {
    backgroundColor: Colors.surface, borderRadius: 10, padding: 12,
    color: Colors.text, fontSize: 14, lineHeight: 20, minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: { color: Colors.textMuted, fontSize: 11, textAlign: "right", marginTop: 4 },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, gap: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
