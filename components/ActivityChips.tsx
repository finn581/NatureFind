import React from "react";
import { ScrollView, Pressable, Text, StyleSheet } from "react-native";
import { ACTIVITY_LIST } from "@/constants/Activities";
import { Colors } from "@/constants/Colors";

// ─── Emoji map ────────────────────────────────────────────────────────────────

const ACTIVITY_EMOJIS: Record<string, string> = {
  Hiking: "🥾",
  Camping: "⛺",
  Fishing: "🎣",
  "Wildlife Watching": "🦅",
  Stargazing: "🌟",
  Climbing: "🧗",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActivityChips({ selected, onChange }: Props) {
  function toggle(name: string) {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name));
    } else {
      onChange([...selected, name]);
    }
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {ACTIVITY_LIST.map((activity) => {
        const active = selected.includes(activity.name);
        const emoji = ACTIVITY_EMOJIS[activity.name] ?? "📍";
        return (
          <Pressable
            key={activity.name}
            style={[
              styles.chip,
              active && {
                backgroundColor: activity.accentColor + "28",
                borderColor: activity.accentColor,
              },
            ]}
            onPress={() => toggle(activity.name)}
            accessibilityRole="checkbox"
            accessibilityLabel={activity.name}
            accessibilityState={{ checked: active }}
          >
            <Text style={styles.chipEmoji}>{emoji}</Text>
            <Text
              style={[
                styles.chipLabel,
                active && { color: activity.accentColor },
              ]}
            >
              {activity.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Montserrat-SemiBold",
  },
});
