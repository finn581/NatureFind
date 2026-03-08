import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
  Linking,
  FlatList,
  Modal,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import {
  fetchParkById,
  fetchParkAlerts,
  fetchThingsToDo,
  fetchVisitorCenters,
  type Park,
  type ParkAlert,
  type ThingToDo,
  type VisitorCenter,
} from "@/services/npsApi";
import { isOpenNow, isDogFriendly } from "@/utils/parkUtils";
import { useAuth } from "@/context/AuthContext";
import { useFavorites } from "@/hooks/useFavorites";
import { addReview, getReviews, reportReview, uploadReviewPhoto, deleteReview, type ReviewDoc } from "@/services/firebase";
import ReviewCard from "@/components/ReviewCard";
import ReviewForm from "@/components/ReviewForm";
import SightingsSection from "@/components/SightingsSection";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Terrain MapView — native only, loaded after all ES imports
let MapView: any = null;
if (Platform.OS !== "web") {
  MapView = require("react-native-maps").default;
}

export default function ParkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { isFavorite, add, remove } = useFavorites();
  const [park, setPark] = useState<Park | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);

  const [alerts, setAlerts] = useState<ParkAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [thingsToDo, setThingsToDo] = useState<ThingToDo[]>([]);
  const [thingsLoading, setThingsLoading] = useState(false);
  const [visitorCenters, setVisitorCenters] = useState<VisitorCenter[]>([]);
  const [vcLoading, setVcLoading] = useState(false);

  const saved = park ? isFavorite(park.parkCode) : false;

  useEffect(() => {
    if (!id) return;
    loadPark();
    loadReviews();
  }, [id]);

  async function loadPark() {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchParkById(id!);
      setPark(data);
      if (data) {
        loadAlerts(data.parkCode);
        loadThingsToDo(data.parkCode);
        loadVisitorCenters(data.parkCode);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadReviews() {
    try {
      const data = await getReviews(id!);
      setReviews(data);
    } catch {
      // silently fail
    }
  }

  async function loadAlerts(parkCode: string) {
    setAlertsLoading(true);
    try {
      const data = await fetchParkAlerts(parkCode);
      setAlerts(data);
    } catch {
      // silently fail
    } finally {
      setAlertsLoading(false);
    }
  }

  async function loadThingsToDo(parkCode: string) {
    setThingsLoading(true);
    try {
      const data = await fetchThingsToDo(parkCode);
      setThingsToDo(data);
    } catch {
      // silently fail
    } finally {
      setThingsLoading(false);
    }
  }

  async function loadVisitorCenters(parkCode: string) {
    setVcLoading(true);
    try {
      const data = await fetchVisitorCenters(parkCode);
      setVisitorCenters(data);
    } catch {
      // silently fail
    } finally {
      setVcLoading(false);
    }
  }

  const toggleFavorite = async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Sign in to save favorites.");
      return;
    }
    if (!park) return;

    if (saved) {
      await remove(park.parkCode);
    } else {
      await add({
        parkCode: park.parkCode,
        fullName: park.fullName,
        image: park.images?.[0]?.url ?? "",
        states: park.states,
      });
    }
  };

  const handleSubmitReview = async (rating: number, text: string, imageUris: string[]) => {
    if (!user || !park) return;
    const uploadedUrls = await Promise.all(
      imageUris.map((uri, i) => uploadReviewPhoto(user.uid, park.parkCode, uri, i))
    );
    await addReview(park.parkCode, {
      uid: user.uid,
      displayName: user.displayName ?? "Anonymous",
      rating,
      number: rating,
      text,
      imageUrls: uploadedUrls,
    });
    await loadReviews();
  };

  const handleDeleteReview = async (review: ReviewDoc) => {
    if (!park || !review.id) return;
    await deleteReview(park.parkCode, review.id, review.imageUrls ?? []);
    await loadReviews();
  };

  const handleReportReview = (reviewIndex: number) => {
    if (!user) {
      Alert.alert("Sign In Required", "Sign in to report a review.");
      return;
    }

    Alert.alert(
      "Report Review",
      "Are you sure you want to report this review as inappropriate?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: async () => {
            try {
              await reportReview(id!, reviewIndex, user.uid, "inappropriate");
              Alert.alert("Reported", "Thank you. We will review this content.");
            } catch {
              Alert.alert("Error", "Failed to submit report. Please try again.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (error || !park) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.errorText}>Failed to load park details</Text>
        <Pressable
          style={styles.retryBtn}
          onPress={loadPark}
          accessibilityLabel="Retry loading park"
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const openStatus = isOpenNow(park.operatingHours);
  const dogFriendly = isDogFriendly(park.activities);
  const communityPhotos = reviews.flatMap((r) =>
    (r.imageUrls ?? []).map((url) => ({ url, displayName: r.displayName }))
  );

  function getAlertBorderColor(category: string): string {
    const cat = category.toLowerCase();
    if (cat === "danger" || cat === "park closure") return Colors.error;
    if (cat === "caution") return "#d4a017";
    return Colors.primaryLight;
  }

  function parseLatLong(latLong: string): { lat: number; lon: number } | null {
    const m = latLong.match(/lat:([\d.-]+),\s*long:([\d.-]+)/);
    if (!m) return null;
    return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        {/* Hero image carousel */}
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.imageCarousel}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setActivePhoto(page);
            }}
          >
            {park.images.length > 0 ? (
              park.images.slice(0, 5).map((img, i) => (
                <Pressable key={i} onPress={() => setLightboxUri(img.url)} accessibilityRole="button" accessibilityLabel={`View photo ${i + 1} of ${park.fullName}`}>
                  <Image
                    source={{ uri: img.url }}
                    style={styles.heroImage}
                    contentFit="cover"
                    accessibilityLabel={img.altText || `${park.fullName} photo ${i + 1}`}
                  />
                </Pressable>
              ))
            ) : (
              <View style={[styles.heroImage, styles.imagePlaceholder]}>
                <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
              </View>
            )}
          </ScrollView>

          {/* Pagination dots */}
          {park.images.length > 1 && (
            <View style={styles.dotsRow}>
              {park.images.slice(0, 5).map((_, i) => (
                <View key={i} style={[styles.dot, i === activePhoto && styles.dotActive]} />
              ))}
            </View>
          )}

          {/* Photo count badge */}
          {park.images.length > 1 && (
            <View style={styles.photoCountBadge}>
              <Ionicons name="images-outline" size={12} color="#fff" />
              <Text style={styles.photoCountText}>
                {activePhoto + 1} / {Math.min(park.images.length, 5)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          {/* Header */}
          <View style={styles.titleRow}>
            <View style={styles.titleInfo}>
              <Text style={styles.parkName}>{park.fullName}</Text>
              <Text style={styles.designation}>
                {park.states} &middot; {park.designation || "National Park Site"}
              </Text>
              {openStatus !== null && (
                <View
                  style={[
                    styles.openBadge,
                    { backgroundColor: openStatus ? "#1b4332" : "#3d0c0c" },
                  ]}
                >
                  <Ionicons
                    name={openStatus ? "checkmark-circle" : "close-circle"}
                    size={12}
                    color={openStatus ? Colors.primaryLight : Colors.error}
                  />
                  <Text
                    style={[
                      styles.openBadgeText,
                      { color: openStatus ? Colors.primaryLight : Colors.error },
                    ]}
                  >
                    {openStatus ? "Open Now" : "Closed"}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={toggleFavorite}
              style={styles.heartBtn}
              accessibilityLabel={saved ? "Remove from favorites" : "Add to favorites"}
              accessibilityRole="button"
            >
              <Ionicons
                name={saved ? "heart" : "heart-outline"}
                size={28}
                color={saved ? Colors.error : Colors.textSecondary}
              />
            </Pressable>
          </View>

          {/* Directions button */}
          {park.latitude && park.longitude && (
            <Pressable
              style={styles.directionsBtn}
              onPress={() => {
                const url = `maps://?daddr=${park.latitude},${park.longitude}&dirflg=d&t=s&q=${encodeURIComponent(park.fullName)}`;
                Linking.openURL(url);
              }}
              accessibilityLabel={`Get directions to ${park.fullName}`}
              accessibilityRole="button"
            >
              <Ionicons name="navigate" size={18} color={Colors.white} />
              <Text style={styles.directionsText}>Get Directions in Apple Maps</Text>
            </Pressable>
          )}

          {/* Park Alerts */}
          {alertsLoading && (
            <ActivityIndicator color={Colors.primary} style={{ marginBottom: 12 }} />
          )}
          {alerts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Park Alerts</Text>
              {alerts.map((alert) => (
                <Pressable
                  key={alert.id}
                  style={[
                    styles.alertCard,
                    { borderLeftColor: getAlertBorderColor(alert.category) },
                  ]}
                  onPress={() => alert.url && Linking.openURL(alert.url)}
                  accessibilityLabel={alert.title}
                  accessibilityRole="link"
                >
                  <View style={styles.alertHeader}>
                    <Ionicons
                      name="warning-outline"
                      size={16}
                      color={getAlertBorderColor(alert.category)}
                    />
                    <Text
                      style={[
                        styles.alertCategory,
                        { color: getAlertBorderColor(alert.category) },
                      ]}
                    >
                      {alert.category}
                    </Text>
                  </View>
                  <Text style={styles.alertTitle}>{alert.title}</Text>
                  <Text style={styles.alertDesc} numberOfLines={3}>
                    {alert.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Description */}
          <Text style={styles.description}>{park.description}</Text>

          {/* Terrain overview map */}
          {park.latitude && park.longitude && MapView && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location & Terrain</Text>
              <Pressable
                style={styles.terrainMapWrap}
                onPress={() => {
                  const url = `maps://?ll=${parseFloat(park.latitude)},${parseFloat(park.longitude)}&q=${encodeURIComponent(park.fullName)}&t=h`;
                  Linking.openURL(url);
                }}
                accessibilityLabel={`View ${park.fullName} terrain in Maps`}
                accessibilityRole="button"
              >
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <MapView
                    style={{ flex: 1 }}
                    mapType="terrain"
                    region={{
                      latitude: parseFloat(park.latitude),
                      longitude: parseFloat(park.longitude),
                      latitudeDelta: 0.35,
                      longitudeDelta: 0.35,
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    showsCompass={false}
                    showsScale={false}
                    showsUserLocation={false}
                  />
                </View>
                <View style={styles.terrainOverlay}>
                  <View style={styles.terrainLabel}>
                    <Ionicons name="navigate-outline" size={13} color="#fff" />
                    <Text style={styles.terrainLabelText}>Open in Maps</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          )}

          {/* Dog Friendly callout */}
          {dogFriendly && (
            <View style={[styles.infoCard, styles.dogCard]}>
              <Text style={styles.dogTitle}>🐾 Dog Friendly</Text>
              <Text style={styles.dogDesc}>
                Leashed pets are permitted in this park. Keep your dog on a leash no longer than 6
                feet at all times and clean up after them.
              </Text>
            </View>
          )}

          {/* Entrance Fees */}
          {park.entranceFees.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Entrance Fees</Text>
              {park.entranceFees.map((fee, i) => (
                <View key={i} style={styles.infoCard}>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeTitle}>{fee.title}</Text>
                    <Text style={styles.feeCost}>${fee.cost}</Text>
                  </View>
                  <Text style={styles.feeDesc}>{fee.description}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Operating Hours */}
          {park.operatingHours.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hours</Text>
              {park.operatingHours.map((hours, i) => (
                <View key={i} style={styles.infoCard}>
                  <Text style={styles.hoursName}>{hours.name}</Text>
                  <Text style={styles.hoursDesc}>{hours.description}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Activities */}
          {park.activities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activities</Text>
              <View style={styles.activityChips}>
                {park.activities.slice(0, 12).map((act) => (
                  <View key={act.id} style={styles.activityChip}>
                    <Text style={styles.activityChipText}>{act.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Drone Policy */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Drone Policy</Text>
            <View style={[styles.infoCard, styles.droneCard]}>
              <View style={styles.droneHeader}>
                <Ionicons name="ban" size={20} color={Colors.error} />
                <Text style={styles.droneTitle}>Unmanned Aircraft Prohibited</Text>
              </View>
              <Text style={styles.droneDesc}>
                The use of unmanned aircraft (drones) is prohibited in all units of the National
                Park System without a permit. Violations may result in fines up to $5,000. Check
                local regulations or obtain a Special Use Permit before flying.
              </Text>
              <Pressable
                style={styles.faaBtn}
                onPress={() => Linking.openURL("https://b4ufly.aloft.ai")}
                accessibilityLabel="Check FAA B4UFLY airspace"
                accessibilityRole="link"
              >
                <Ionicons name="airplane-outline" size={14} color={Colors.accentLight} />
                <Text style={styles.faaBtnText}>Check Airspace with FAA B4UFLY</Text>
              </Pressable>
            </View>
          </View>

          {/* Trails & Things To Do */}
          {(thingsLoading || thingsToDo.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Trails & Things To Do</Text>
              {thingsLoading ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                thingsToDo.slice(0, 8).map((item) => (
                  <View key={item.id} style={styles.infoCard}>
                    <Text style={styles.thingTitle}>{item.title}</Text>
                    <Text style={styles.thingDesc} numberOfLines={3}>
                      {item.shortDescription}
                    </Text>
                    {(item.durationDescription || item.location) ? (
                      <View style={styles.thingMeta}>
                        {item.durationDescription ? (
                          <View style={styles.thingMetaItem}>
                            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                            <Text style={styles.thingMetaText}>{item.durationDescription}</Text>
                          </View>
                        ) : null}
                        {item.location ? (
                          <View style={styles.thingMetaItem}>
                            <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                            <Text style={styles.thingMetaText}>{item.location}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          )}

          {/* Visitor Centers */}
          {(vcLoading || visitorCenters.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Visitor Centers</Text>
              {vcLoading ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                visitorCenters.map((vc) => {
                  const phone = vc.contacts?.phoneNumbers?.[0]?.phoneNumber;
                  const coords = parseLatLong(vc.latLong);
                  return (
                    <View key={vc.id} style={styles.infoCard}>
                      <Text style={styles.vcName}>{vc.name}</Text>
                      {vc.description ? (
                        <Text style={styles.vcDesc} numberOfLines={3}>
                          {vc.description}
                        </Text>
                      ) : null}
                      {vc.directionsInfo ? (
                        <Text style={styles.vcDirections}>{vc.directionsInfo}</Text>
                      ) : null}
                      <View style={styles.vcActions}>
                        {phone ? (
                          <Pressable
                            style={styles.vcBtn}
                            onPress={() => Linking.openURL(`tel:${phone.replace(/\D/g, "")}`)}
                            accessibilityLabel={`Call ${vc.name}`}
                            accessibilityRole="button"
                          >
                            <Ionicons name="call-outline" size={14} color={Colors.primaryLight} />
                            <Text style={styles.vcBtnText}>Call</Text>
                          </Pressable>
                        ) : null}
                        {coords ? (
                          <Pressable
                            style={styles.vcBtn}
                            onPress={() => {
                              const url = `maps://?daddr=${coords.lat},${coords.lon}&dirflg=d&t=s&q=${encodeURIComponent(vc.name)}`;
                              Linking.openURL(url);
                            }}
                            accessibilityLabel={`Get directions to ${vc.name}`}
                            accessibilityRole="button"
                          >
                            <Ionicons name="navigate-outline" size={14} color={Colors.primaryLight} />
                            <Text style={styles.vcBtnText}>Directions</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Official NPS Maps */}
          <Pressable
            style={styles.mapsBtn}
            onPress={() => Linking.openURL(`https://www.nps.gov/${park.parkCode}/maps`)}
            accessibilityLabel={`View official NPS maps for ${park.fullName}`}
            accessibilityRole="link"
          >
            <Ionicons name="map-outline" size={18} color={Colors.white} />
            <Text style={styles.mapsBtnText}>View Official NPS Maps</Text>
          </Pressable>

          {/* Wildlife Sightings */}
          <SightingsSection parkCode={park.parkCode} parkName={park.fullName} />

          {/* Community Photos */}
          {communityPhotos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Community Photos</Text>
              <FlatList
                data={communityPhotos}
                numColumns={3}
                scrollEnabled={false}
                keyExtractor={(_, i) => String(i)}
                columnWrapperStyle={{ gap: 3 }}
                ItemSeparatorComponent={() => <View style={{ height: 3 }} />}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => setLightboxUri(item.url)}
                    style={{ flex: 1 / 3, aspectRatio: 1 }}>
                    <Image source={{ uri: item.url }} style={{ flex: 1 }} />
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Reviews */}
          <View style={styles.section}>
            <View style={styles.reviewHeader}>
              <Text style={styles.sectionTitle}>
                Reviews{reviews.length > 0 ? ` (${reviews.length})` : ""}
              </Text>
              {reviews.length > 0 && (
                <View style={styles.avgRating}>
                  <Ionicons name="star" size={16} color={Colors.star} />
                  <Text style={styles.avgRatingText}>{avgRating.toFixed(1)}</Text>
                </View>
              )}
            </View>

            {reviews.map((review, i) => (
              <ReviewCard
                key={review.id ?? i}
                review={review}
                currentUid={user?.uid}
                onReport={() => handleReportReview(i)}
                onDelete={() => handleDeleteReview(review)}
              />
            ))}

            {reviews.length === 0 && (
              <Text style={styles.noReviews}>No reviews yet. Be the first!</Text>
            )}

            <Pressable
              style={styles.writeReviewBtn}
              onPress={() => {
                if (!user) {
                  Alert.alert("Sign In Required", "Sign in to write a review.");
                  return;
                }
                setShowReviewForm(true);
              }}
              accessibilityLabel="Write a review"
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={18} color={Colors.white} />
              <Text style={styles.writeReviewText}>Write a Review</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <ReviewForm
        visible={showReviewForm}
        onClose={() => setShowReviewForm(false)}
        onSubmit={handleSubmitReview}
      />

      <Modal visible={!!lightboxUri} transparent animationType="fade"
        onRequestClose={() => setLightboxUri(null)}>
        <TouchableOpacity style={styles.lightboxBg} activeOpacity={1}
          onPress={() => setLightboxUri(null)}>
          {lightboxUri && (
            <Image source={{ uri: lightboxUri }} style={styles.lightboxImg}
              contentFit="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    padding: 40,
    gap: 12,
  },
  errorText: {
    color: Colors.textMuted,
    fontSize: 16,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  retryText: {
    color: Colors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  imageCarousel: {
    height: 280,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: 280,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  // Carousel pagination
  dotsRow: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 18,
  },
  photoCountBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoCountText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  // Terrain map
  terrainMapWrap: {
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  terrainOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 10,
    paddingHorizontal: 12,
    justifyContent: "flex-end",
  },
  terrainLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  terrainLabelText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  content: {
    padding: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  titleInfo: {
    flex: 1,
  },
  parkName: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  designation: {
    color: Colors.primaryLight,
    fontSize: 14,
    marginTop: 4,
  },
  openBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  openBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  heartBtn: {
    padding: 8,
    marginLeft: 8,
  },
  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 16,
  },
  directionsText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "600",
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  // Alerts
  alertCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  alertCategory: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  alertTitle: {
    color: Colors.text,
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 4,
  },
  alertDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  // Dog Friendly
  dogCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    marginBottom: 20,
  },
  dogTitle: {
    color: Colors.accentLight,
    fontWeight: "700",
    fontSize: 15,
    marginBottom: 6,
  },
  dogDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  // Fees
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  feeTitle: {
    color: Colors.text,
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
  },
  feeCost: {
    color: Colors.accent,
    fontWeight: "700",
    fontSize: 16,
    marginLeft: 8,
  },
  feeDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  // Hours
  hoursName: {
    color: Colors.text,
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 4,
  },
  hoursDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  // Activities
  activityChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  activityChip: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activityChipText: {
    color: Colors.primaryLight,
    fontSize: 13,
  },
  // Drone Policy
  droneCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },
  droneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  droneTitle: {
    color: Colors.error,
    fontWeight: "700",
    fontSize: 14,
  },
  droneDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  faaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  faaBtnText: {
    color: Colors.accentLight,
    fontSize: 13,
    fontWeight: "600",
  },
  // Things To Do
  thingTitle: {
    color: Colors.text,
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 4,
  },
  thingDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  thingMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  thingMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  thingMetaText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  // Visitor Centers
  vcName: {
    color: Colors.text,
    fontWeight: "700",
    fontSize: 15,
    marginBottom: 4,
  },
  vcDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  vcDirections: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    fontStyle: "italic",
  },
  vcActions: {
    flexDirection: "row",
    gap: 8,
  },
  vcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  vcBtnText: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: "600",
  },
  // NPS Maps
  mapsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primaryDark,
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 24,
  },
  mapsBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "600",
  },
  // Reviews
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  avgRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  avgRatingText: {
    color: Colors.star,
    fontWeight: "700",
    fontSize: 16,
  },
  noReviews: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  writeReviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginTop: 12,
  },
  writeReviewText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "600",
  },
  lightboxBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImg: {
    width: "100%",
    height: "80%",
  },
});
