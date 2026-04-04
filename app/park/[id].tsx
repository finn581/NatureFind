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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import {
  addReview, getReviews, reportReview, uploadReviewPhoto, deleteReview, type ReviewDoc,
  addConditionReport, getConditionReports, type ConditionReportDoc,
  logVisit,
} from "@/services/firebase";
import { getParkCondition, getParkForecast, weatherEmoji, type ConditionScore, type ForecastDay } from "@/services/weatherApi";
import { getAirQuality, type AirQualityData } from "@/services/airQualityApi";
import { getNearbyAmenities, type NearbyPlace } from "@/services/placesApi";
import ConditionReportForm from "@/components/ConditionReportForm";
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const [condition, setCondition] = useState<ConditionScore | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [conditionReports, setConditionReports] = useState<ConditionReportDoc[]>([]);
  const [showConditionForm, setShowConditionForm] = useState(false);

  const saved = park ? isFavorite(park.parkCode) : false;

  useEffect(() => {
    if (!id) return;
    loadPark();
    loadReviews();
    loadConditionReports();
  }, [id]);

  async function loadPark() {
    setLoading(true);
    setError(false);
    if (!id) { setError(true); setLoading(false); return; }
    try {
      const data = await fetchParkById(id);
      setPark(data);
      if (data) {
        setAlertsLoading(true);
        setThingsLoading(true);
        setVcLoading(true);
        Promise.allSettled([
          fetchParkAlerts(data.parkCode),
          fetchThingsToDo(data.parkCode),
          fetchVisitorCenters(data.parkCode),
        ]).then(([ar, tr, vr]) => {
          if (ar.status === "fulfilled") setAlerts(ar.value);
          setAlertsLoading(false);
          if (tr.status === "fulfilled") setThingsToDo(tr.value);
          setThingsLoading(false);
          if (vr.status === "fulfilled") setVisitorCenters(vr.value);
          setVcLoading(false);
        });

        // Weather condition score + forecast (non-fatal)
        const lat = parseFloat(data.latitude);
        const lon = parseFloat(data.longitude);
        if (!isNaN(lat) && !isNaN(lon)) {
          getParkCondition(lat, lon).then(setCondition).catch(() => {});
          getParkForecast(lat, lon).then(setForecast).catch(() => {});
          getAirQuality(lat, lon).then(setAirQuality).catch(() => {});
          getNearbyAmenities(lat, lon).then(setNearbyPlaces).catch(() => {});
        }

        // Log visit for authenticated users
        if (user) {
          logVisit(user.uid, data.parkCode, data.fullName).catch(() => {});
        }
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

  async function loadConditionReports() {
    try {
      const data = await getConditionReports(id!, 5);
      setConditionReports(data);
    } catch {
      // silently fail
    }
  }

  const handleSubmitConditionReport = async (
    trailStatus: ConditionReportDoc["trailStatus"],
    wildlifeActivity: ConditionReportDoc["wildlifeActivity"],
    crowding: ConditionReportDoc["crowding"],
    accessNotes: string,
  ) => {
    if (!user || !park) return;
    await addConditionReport(park.parkCode, {
      uid: user.uid,
      displayName: user.displayName ?? "Anonymous",
      trailStatus,
      wildlifeActivity,
      crowding,
      accessNotes,
    });
    await loadConditionReports();
  };

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
    const uploadResults = await Promise.allSettled(
      imageUris.map((uri, i) => uploadReviewPhoto(user.uid, park.parkCode, uri, i))
    );
    const uploadedUrls = uploadResults
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((url): url is string => url !== null);
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

  function timeAgo(ts: any): string {
    const ms = typeof ts?.toMillis === "function" ? ts.toMillis() : null;
    if (!ms) return "";
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  function getSeasonalHint(): { emoji: string; headline: string; body: string } | null {
    if (!park) return null;
    const month = new Date().getMonth();
    const season = month <= 1 || month === 11 ? "winter"
      : month <= 4 ? "spring"
      : month <= 7 ? "summer" : "fall";
    const states = park.states.split(",").map((s) => s.trim());
    const acts = park.activities.map((a) => a.name.toLowerCase());
    const desig = (park.designation ?? "").toLowerCase();

    if (states.includes("AK")) {
      if (season === "summer") return { emoji: "🐻", headline: "Peak Wildlife Season", body: "June–August brings bears, moose, and eagles in peak activity. Midnight sun extends viewing hours." };
      if (season === "winter") return { emoji: "❄️", headline: "Northern Lights Season", body: "Extreme cold limits access but Nov–Mar offers stunning aurora borealis. Many facilities closed." };
    }
    if (states.some((s) => ["AZ", "NM", "NV", "UT"].includes(s))) {
      if (season === "summer") return { emoji: "🌵", headline: "Beat the Heat — Go Early", body: "Temperatures can exceed 100°F by midday. Plan hikes before 9am or after 5pm." };
      if (season === "spring") return { emoji: "🌸", headline: "Desert Wildflower Season", body: "March–May brings desert blooms and milder temperatures. Ideal for hiking and wildlife spotting." };
    }
    if (desig.includes("seashore") || desig.includes("lakeshore")) {
      if (season === "summer") return { emoji: "🐢", headline: "Sea Turtle Nesting Season", body: "Sea turtles nest June–August on Atlantic and Gulf coasts. Respect roped nesting areas." };
      if (season === "winter") return { emoji: "🐳", headline: "Whale Migration", body: "Grey and humpback whales migrate along coastal parks Nov–March." };
    }
    if (acts.some((a) => a.includes("ski") || a.includes("snowshoe")) && (season === "winter" || season === "fall")) {
      return { emoji: "⛷️", headline: "Winter Sports Season", body: "Snow activities available. Check current snowpack and road conditions before visiting." };
    }
    if (acts.some((a) => a.includes("wildlife") || a.includes("birdwatch"))) {
      if (season === "spring") return { emoji: "🐣", headline: "Newborn Wildlife Season", body: "Spring is breeding season — keep distance from young animals and their mothers." };
      if (season === "fall") return { emoji: "🦌", headline: "Fall Rut Season", body: "Elk and deer rut peaks in October. Excellent viewing — maintain safe distance from males." };
    }
    const fallbacks: Record<string, { emoji: string; headline: string; body: string }> = {
      spring: { emoji: "🌿", headline: "Spring — Best Hiking Conditions", body: "Moderate temps and lush landscapes make spring ideal. Watch for muddy trails after snowmelt." },
      summer: { emoji: "☀️", headline: "Summer Peak Season", body: "Busiest time of year. Arrive early to beat crowds and midday heat." },
      fall:   { emoji: "🍂", headline: "Fall Foliage Season", body: "Leaf color peaks September–October. Cooler temps make hiking comfortable with fewer crowds." },
      winter: { emoji: "❄️", headline: "Winter — Fewer Crowds", body: "Reduced hours and some closures. Solitude and unique winter scenery reward visitors who plan ahead." },
    };
    return fallbacks[season];
  }

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
      {/* Back button — overlays the hero image */}
      <Pressable
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/explore")}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </Pressable>

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

          {/* Condition Score Banner */}
          {condition && (
            <View style={[styles.conditionBanner, { borderLeftColor: condition.color }]}>
              <View style={styles.conditionLeft}>
                <Text style={[styles.conditionLabel, { color: condition.color }]}>
                  {condition.label} Conditions Today
                </Text>
                <Text style={styles.conditionSummary}>{condition.summary}</Text>
                {condition.precipChance > 10 && (
                  <Text style={styles.conditionDetail}>
                    {condition.precipChance}% chance of rain
                  </Text>
                )}
              </View>
              <View style={[styles.conditionScoreWrap, { backgroundColor: condition.bgColor }]}>
                <Text style={[styles.conditionScore, { color: condition.color }]}>
                  {condition.score}
                </Text>
                <Text style={styles.conditionScoreOf}>/100</Text>
              </View>
            </View>
          )}

          {/* Air Quality */}
          {airQuality && (
            <View style={[styles.conditionBanner, { borderLeftColor: airQuality.color }]}>
              <View style={styles.conditionLeft}>
                <Text style={[styles.conditionLabel, { color: airQuality.color }]}>
                  Air Quality — {airQuality.category}
                </Text>
                <Text style={styles.conditionSummary} numberOfLines={2}>
                  {airQuality.healthRecommendation}
                </Text>
              </View>
              <View style={[styles.conditionScoreWrap, { backgroundColor: airQuality.color + "18" }]}>
                <Text style={[styles.conditionScore, { color: airQuality.color }]}>
                  {airQuality.aqi}
                </Text>
                <Text style={styles.conditionScoreOf}>AQI</Text>
              </View>
            </View>
          )}

          {/* 7-Day Forecast */}
          {forecast.length > 0 && (
            <View style={styles.forecastWrap}>
              <Text style={styles.forecastTitle}>7-Day Forecast</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.forecastRow}
              >
                {forecast.map((day, i) => (
                  <View key={i} style={[styles.forecastDay, i === 0 && styles.forecastDayToday]}>
                    <Text style={[styles.forecastLabel, i === 0 && { color: Colors.primaryLight }]}>
                      {day.dateLabel}
                    </Text>
                    <Text style={styles.forecastEmoji}>{weatherEmoji(day.weatherCode)}</Text>
                    <Text style={styles.forecastHigh}>{day.high}°</Text>
                    <Text style={styles.forecastLow}>{day.low}°</Text>
                    {day.precipChance >= 20 && (
                      <Text style={styles.forecastPrecip}>💧{day.precipChance}%</Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Seasonal Hint */}
          {(() => {
            const hint = getSeasonalHint();
            return hint ? (
              <View style={styles.seasonCard}>
                <Text style={styles.seasonEmoji}>{hint.emoji}</Text>
                <View style={styles.seasonText}>
                  <Text style={styles.seasonHeadline}>{hint.headline}</Text>
                  <Text style={styles.seasonBody}>{hint.body}</Text>
                </View>
              </View>
            ) : null;
          })()}

          {/* Nearby Amenities */}
          {nearbyPlaces.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nearby Amenities</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {nearbyPlaces.slice(0, 8).map((place) => (
                  <View key={place.id} style={styles.amenityCard}>
                    <View style={styles.amenityIconWrap}>
                      <Ionicons name={place.icon as any} size={16} color={Colors.primaryLight} />
                    </View>
                    <Text style={styles.amenityName} numberOfLines={1}>{place.name}</Text>
                    {place.distance != null && (
                      <Text style={styles.amenityDist}>{place.distance} mi</Text>
                    )}
                    {place.isOpen != null && (
                      <Text style={[styles.amenityOpen, { color: place.isOpen ? "#22c55e" : Colors.error }]}>
                        {place.isOpen ? "Open" : "Closed"}
                      </Text>
                    )}
                    {place.rating != null && (
                      <View style={styles.amenityRatingRow}>
                        <Ionicons name="star" size={10} color={Colors.star} />
                        <Text style={styles.amenityRating}>{place.rating}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
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

          {/* Community Condition Reports */}
          <View style={styles.section}>
            <View style={styles.conditionReportHeader}>
              <Text style={styles.sectionTitle}>Trail Conditions</Text>
              <Pressable
                style={styles.reportBtn}
                onPress={() => {
                  if (!user) {
                    Alert.alert("Sign In Required", "Sign in to report conditions.");
                    return;
                  }
                  setShowConditionForm(true);
                }}
                accessibilityLabel="Report current conditions"
                accessibilityRole="button"
              >
                <Ionicons name="add-circle-outline" size={16} color={Colors.primaryLight} />
                <Text style={styles.reportBtnText}>Report</Text>
              </Pressable>
            </View>

            {conditionReports.length === 0 ? (
              <Text style={styles.noReports}>No recent reports. Be the first to share current conditions.</Text>
            ) : (
              conditionReports.map((report) => (
                <View key={report.id} style={styles.conditionReportCard}>
                  <View style={styles.conditionReportTop}>
                    <View style={styles.conditionBadgeRow}>
                      <View style={[styles.statusBadge, report.trailStatus === "open"
                        ? styles.statusOpen : report.trailStatus === "closed"
                        ? styles.statusClosed : styles.statusPartial]}>
                        <Text style={styles.statusBadgeText}>
                          {report.trailStatus === "open" ? "✓ Open"
                            : report.trailStatus === "closed" ? "✗ Closed"
                            : report.trailStatus === "partial" ? "~ Partial"
                            : "? Unknown"}
                        </Text>
                      </View>
                      <View style={styles.crowdBadge}>
                        <Ionicons name="people-outline" size={11} color={Colors.textMuted} />
                        <Text style={styles.crowdBadgeText}>
                          {report.crowding.charAt(0).toUpperCase() + report.crowding.slice(1)}
                        </Text>
                      </View>
                      {report.wildlifeActivity !== "none" && (
                        <View style={styles.crowdBadge}>
                          <Text style={styles.crowdBadgeText}>
                            🐾 {report.wildlifeActivity.charAt(0).toUpperCase() + report.wildlifeActivity.slice(1)} wildlife
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.reportTimestamp}>{timeAgo(report.createdAt)}</Text>
                  </View>
                  {!!report.accessNotes && (
                    <Text style={styles.reportNotes} numberOfLines={3}>{report.accessNotes}</Text>
                  )}
                  <Text style={styles.reportAuthor}>— {report.displayName}</Text>
                </View>
              ))
            )}
          </View>

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

      <ConditionReportForm
        visible={showConditionForm}
        onClose={() => setShowConditionForm(false)}
        onSubmit={handleSubmitConditionReport}
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
  backBtn: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
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
  amenityCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    width: 110,
    alignItems: "center",
    gap: 4,
  },
  amenityIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  amenityName: { color: Colors.text, fontSize: 12, fontWeight: "600", textAlign: "center" },
  amenityDist: { color: Colors.textSecondary, fontSize: 11 },
  amenityOpen: { fontSize: 10, fontWeight: "700" },
  amenityRatingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  amenityRating: { color: Colors.star, fontSize: 11, fontWeight: "600" },
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
  // Condition score banner
  conditionBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
  },
  conditionLeft: { flex: 1, marginRight: 12 },
  conditionLabel: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  conditionSummary: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  conditionDetail: { color: Colors.textMuted, fontSize: 12, marginTop: 3 },
  conditionScoreWrap: {
    alignItems: "center", justifyContent: "center",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 58,
  },
  conditionScore: { fontSize: 24, fontWeight: "800" },
  conditionScoreOf: { color: Colors.textMuted, fontSize: 11, marginTop: -2 },
  // 7-Day Forecast
  forecastWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 14,
  },
  forecastTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  forecastRow: {
    paddingHorizontal: 10,
    gap: 4,
  },
  forecastDay: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    minWidth: 58,
    gap: 3,
  },
  forecastDayToday: {
    backgroundColor: Colors.background,
  },
  forecastLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  forecastEmoji: {
    fontSize: 22,
    lineHeight: 28,
  },
  forecastHigh: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  forecastLow: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  forecastPrecip: {
    color: "#7dd3fc",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  // Seasonal hint
  seasonCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  seasonEmoji: { fontSize: 28, lineHeight: 34 },
  seasonText: { flex: 1 },
  seasonHeadline: { color: Colors.text, fontWeight: "700", fontSize: 14, marginBottom: 4 },
  seasonBody: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  // Condition reports
  conditionReportHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
  },
  reportBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.surfaceLight, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  reportBtnText: { color: Colors.primaryLight, fontSize: 13, fontWeight: "600" },
  noReports: { color: Colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 16 },
  conditionReportCard: {
    backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 8,
  },
  conditionReportTop: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6,
  },
  conditionBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusOpen: { backgroundColor: "#052e16" },
  statusClosed: { backgroundColor: "#2b0707" },
  statusPartial: { backgroundColor: "#2b1a00" },
  statusBadgeText: { color: Colors.primaryLight, fontSize: 11, fontWeight: "700" },
  crowdBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.surfaceLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  crowdBadgeText: { color: Colors.textSecondary, fontSize: 11 },
  reportTimestamp: { color: Colors.textMuted, fontSize: 11, flexShrink: 0 },
  reportNotes: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  reportAuthor: { color: Colors.textMuted, fontSize: 12, fontStyle: "italic" },
});
