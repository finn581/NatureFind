import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface DestinationCardProps {
  name: string;
  country: string;
  flag: string;
  photoUrl: string;
  parkCount: number;
  trailHint: string;
  onPress: () => void;
}

export function DestinationCard({ name, country, flag, photoUrl, parkCount, trailHint, onPress }: DestinationCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <Image source={{ uri: photoUrl }} style={styles.image} />
      <View style={styles.overlay}>
        <Text style={styles.flag}>{flag}</Text>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>{country} · {parkCount} parks</Text>
        <Text style={styles.hint}>{trailHint}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { width: 200, height: 140, borderRadius: 14, overflow: "hidden", marginRight: 12 },
  image: { width: "100%", height: "100%", position: "absolute" },
  overlay: { flex: 1, justifyContent: "flex-end", padding: 10, backgroundColor: "rgba(0,0,0,0.35)" },
  flag: { fontSize: 18, position: "absolute", top: 8, right: 8 },
  name: { color: "#fff", fontSize: 15, fontWeight: "700" },
  subtitle: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 },
  hint: { color: "rgba(255,255,255,0.6)", fontSize: 10, marginTop: 1 },
});
