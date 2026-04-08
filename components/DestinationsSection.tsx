import { ScrollView, StyleSheet, Text, View } from "react-native";
import { DestinationCard } from "./DestinationCard";

interface Destination {
  name: string;
  country: string;
  flag: string;
  photoUrl: string;
  parkCount: number;
  trailHint: string;
  latitude: number;
  longitude: number;
}

const DESTINATIONS: Destination[] = [
  {
    name: "Patagonia",
    country: "Chile / Argentina",
    flag: "\u{1F1E8}\u{1F1F1}",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Cuernos_del_Paine_from_Lake_Peho%C3%A9.jpg/640px-Cuernos_del_Paine_from_Lake_Peho%C3%A9.jpg",
    parkCount: 8,
    trailHint: "W Trek \u00b7 Fitz Roy \u00b7 Grey Glacier",
    latitude: -50.5,
    longitude: -73.0,
  },
  {
    name: "Inca Trail & Cusco",
    country: "Peru",
    flag: "\u{1F1F5}\u{1F1EA}",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/640px-Machu_Picchu%2C_Peru.jpg",
    parkCount: 4,
    trailHint: "Machu Picchu \u00b7 Sacred Valley \u00b7 Salkantay",
    latitude: -13.2,
    longitude: -72.5,
  },
  {
    name: "Colombian Highlands",
    country: "Colombia",
    flag: "\u{1F1E8}\u{1F1F4}",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Tayrona_01.jpg/640px-Tayrona_01.jpg",
    parkCount: 5,
    trailHint: "Ciudad Perdida \u00b7 Cocora Valley \u00b7 Tayrona",
    latitude: 6.0,
    longitude: -74.0,
  },
  {
    name: "Galapagos",
    country: "Ecuador",
    flag: "\u{1F1EA}\u{1F1E8}",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Gal%C3%A1pagos_Giant_Tortoise_%28Chelonoidis_nigra%29.jpg/640px-Gal%C3%A1pagos_Giant_Tortoise_%28Chelonoidis_nigra%29.jpg",
    parkCount: 2,
    trailHint: "Giant tortoises \u00b7 Marine iguanas \u00b7 Volcanic",
    latitude: -0.8,
    longitude: -91.1,
  },
  {
    name: "Brazilian Chapada",
    country: "Brazil",
    flag: "\u{1F1E7}\u{1F1F7}",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Cachoeira_da_Fuma%C3%A7a_-_Chapada_Diamantina.jpg/640px-Cachoeira_da_Fuma%C3%A7a_-_Chapada_Diamantina.jpg",
    parkCount: 4,
    trailHint: "Vale do Pati \u00b7 Fumaca Falls \u00b7 Cave pools",
    latitude: -12.6,
    longitude: -41.4,
  },
  {
    name: "Atacama Desert",
    country: "Chile",
    flag: "\u{1F1E8}\u{1F1F1}",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Parinacota_volcano.jpg/640px-Parinacota_volcano.jpg",
    parkCount: 3,
    trailHint: "Driest desert \u00b7 Salt flats \u00b7 Stargazing",
    latitude: -23.5,
    longitude: -68.0,
  },
];

interface Props {
  onDestinationPress: (lat: number, lng: number) => void;
}

export function DestinationsSection({ onDestinationPress }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Explore South America</Text>
      <Text style={styles.subtitle}>Premium destinations with trails & offline maps</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {DESTINATIONS.map((d) => (
          <DestinationCard
            key={d.name}
            name={d.name}
            country={d.country}
            flag={d.flag}
            photoUrl={d.photoUrl}
            parkCount={d.parkCount}
            trailHint={d.trailHint}
            onPress={() => onDestinationPress(d.latitude, d.longitude)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 16, paddingBottom: 8 },
  title: { color: "#fff", fontSize: 17, fontWeight: "700", paddingHorizontal: 16, marginBottom: 2 },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: 12, paddingHorizontal: 16, marginBottom: 10 },
  scroll: { paddingHorizontal: 16 },
});
