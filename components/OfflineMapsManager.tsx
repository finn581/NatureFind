import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { OFFLINE_REGIONS, type OfflineRegionDef } from "@/constants/OfflineRegions";
import {
  downloadRegion,
  deleteRegion,
  getOfflineStatuses,
  subscribeOfflineStatus,
  loadSavedStatuses,
  type OfflineRegionStatus,
} from "@/services/offlineMapsService";
import { useSubscription } from "@/context/SubscriptionContext";
import { Colors } from "@/constants/Colors";

export function OfflineMapsManager() {
  const { gateFeature } = useSubscription();
  const [statuses, setStatuses] = useState<Record<string, OfflineRegionStatus>>({});

  useEffect(() => {
    loadSavedStatuses().then(() => setStatuses(getOfflineStatuses()));
    const unsub = subscribeOfflineStatus(() => setStatuses(getOfflineStatuses()));
    return unsub;
  }, []);

  const grouped = OFFLINE_REGIONS.reduce<Record<string, OfflineRegionDef[]>>((acc, r) => {
    (acc[r.country] ??= []).push(r);
    return acc;
  }, {});

  const handleDownload = (region: OfflineRegionDef) => {
    if (gateFeature("Offline Maps")) return;
    downloadRegion(region);
  };

  const handleDelete = (region: OfflineRegionDef) => {
    Alert.alert("Delete Offline Map", `Remove ${region.name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteRegion(region.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Offline Maps</Text>
      <Text style={styles.sectionSubtitle}>Download maps for areas with no cell service</Text>

      {Object.entries(grouped).map(([country, regions]) => (
        <View key={country}>
          <Text style={styles.countryHeader}>{regions[0].countryFlag} {country}</Text>
          {regions.map((r) => {
            const status = statuses[r.id];
            const isComplete = status?.state === "complete";
            const isDownloading = status?.state === "downloading";

            return (
              <View key={r.id} style={styles.regionRow}>
                <View style={styles.regionInfo}>
                  <Text style={styles.regionName}>{r.name}</Text>
                  <Text style={styles.regionSize}>~{r.estimatedSizeMB} MB</Text>
                </View>
                {isComplete ? (
                  <TouchableOpacity onPress={() => handleDelete(r)}>
                    <Text style={styles.deleteBtn}>Delete</Text>
                  </TouchableOpacity>
                ) : isDownloading ? (
                  <Text style={styles.progress}>{status.progress}%</Text>
                ) : (
                  <TouchableOpacity onPress={() => handleDownload(r)}>
                    <Text style={styles.downloadBtn}>Download</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 2 },
  sectionSubtitle: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 16 },
  countryHeader: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  regionInfo: { flex: 1 },
  regionName: { color: "#fff", fontSize: 14 },
  regionSize: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 },
  downloadBtn: { color: Colors.primary, fontSize: 14, fontWeight: "600" },
  deleteBtn: { color: "#ff6b6b", fontSize: 14, fontWeight: "600" },
  progress: { color: Colors.primary, fontSize: 14, fontWeight: "600" },
});
