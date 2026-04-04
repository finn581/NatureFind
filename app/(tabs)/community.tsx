import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "@/constants/Colors";
import { useAuth } from "@/context/AuthContext";
import {
  getCommunityPosts,
  addCommunityPost,
  toggleCommunityLike,
  hasLikedPost,
  addCommunityComment,
  getCommunityComments,
  uploadCommunityPhoto,
  reportCommunityPost,
  deleteCommunityPost,
  getRecentSightings,
  getRecentReviewsFeed,
  getRecentConditionReportsFeed,
  type CommunityPost,
  type CommunityComment,
  type SightingDoc,
  type ReviewDoc,
  type ConditionReportDoc,
} from "@/services/firebase";
import { getPreloadedParks } from "@/services/preloadService";
import { useRouter } from "expo-router";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: any): string {
  let ms: number;
  if (typeof ts?.toMillis === "function") ms = ts.toMillis();
  else if (typeof ts?.seconds === "number") ms = ts.seconds * 1000;
  else if (typeof ts === "number") ms = ts;
  else return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function tsToMs(ts: any): number {
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  if (typeof ts === "number") return ts;
  return 0;
}

/** Resolve parkCode → parkName from preloaded NPS data. */
function resolveParkName(parkCode: string): string {
  const parks = getPreloadedParks();
  if (!parks) return parkCode.toUpperCase();
  const match = parks.find((p) => p.parkCode === parkCode);
  return match?.fullName ?? parkCode.toUpperCase();
}

// ─── Unified Feed Item ────────────────────────────────────────────────────────

type FeedType = "post" | "sighting" | "review" | "condition";

interface FeedItem {
  id: string;
  type: FeedType;
  timestamp: number;
  post?: CommunityPost;
  sighting?: SightingDoc;
  review?: ReviewDoc & { parkCode: string };
  condition?: ConditionReportDoc & { parkCode: string };
}

// ─── Segment tabs ─────────────────────────────────────────────────────────────

type Segment = "activity" | "photos" | "sightings";

const SEGMENTS: { key: Segment; label: string; icon: string }[] = [
  { key: "activity", label: "Activity", icon: "pulse-outline" },
  { key: "photos", label: "Photos", icon: "camera-outline" },
  { key: "sightings", label: "Sightings", icon: "eye-outline" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function CommunityTab() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [segment, setSegment] = useState<Segment>("activity");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [sightings, setSightings] = useState<SightingDoc[]>([]);
  const [reviews, setReviews] = useState<(ReviewDoc & { parkCode: string })[]>([]);
  const [conditions, setConditions] = useState<(ConditionReportDoc & { parkCode: string })[]>([]);
  const [likes, setLikes] = useState<Record<string, boolean>>({});

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showComments, setShowComments] = useState<string | null>(null);

  // ── Load all data ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    try {
      const [postsData, sightingsData, reviewsData, conditionsData] = await Promise.allSettled([
        getCommunityPosts(30),
        getRecentSightings(30, 50),
        getRecentReviewsFeed(15),
        getRecentConditionReportsFeed(10),
      ]);
      if (postsData.status === "fulfilled") setPosts(postsData.value);
      if (sightingsData.status === "fulfilled") setSightings(sightingsData.value);
      if (reviewsData.status === "fulfilled") setReviews(reviewsData.value);
      if (conditionsData.status === "fulfilled") setConditions(conditionsData.value);

      // Check likes for posts
      if (user && postsData.status === "fulfilled") {
        const likeMap: Record<string, boolean> = {};
        await Promise.allSettled(
          postsData.value.slice(0, 15).map(async (p) => {
            if (p.id) likeMap[p.id] = await hasLikedPost(p.id, user.uid);
          })
        );
        setLikes(likeMap);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  // ── Unified feed (Activity tab) ────────────────────────────────────────────

  const activityFeed = useMemo((): FeedItem[] => {
    const items: FeedItem[] = [];
    for (const p of posts) {
      items.push({ id: `post-${p.id}`, type: "post", timestamp: tsToMs(p.createdAt), post: p });
    }
    for (const s of sightings) {
      items.push({ id: `sight-${s.id}`, type: "sighting", timestamp: tsToMs(s.timestamp), sighting: s });
    }
    for (const r of reviews) {
      items.push({ id: `rev-${r.id}`, type: "review", timestamp: tsToMs(r.createdAt), review: r });
    }
    for (const c of conditions) {
      items.push({ id: `cond-${c.id}`, type: "condition", timestamp: tsToMs(c.createdAt), condition: c });
    }
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [posts, sightings, reviews, conditions]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const requireAuth = (action: string): boolean => {
    if (user) return true;
    Alert.alert("Sign in required", `Sign in to ${action}.`, [
      { text: "Cancel" },
      { text: "Profile", onPress: () => router.push("/(tabs)/profile") },
    ]);
    return false;
  };

  const handleLike = async (postId: string) => {
    if (!requireAuth("like posts")) return;
    const wasLiked = likes[postId] ?? false;
    setLikes((prev) => ({ ...prev, [postId]: !wasLiked }));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, likeCount: p.likeCount + (wasLiked ? -1 : 1) } : p
      )
    );
    try {
      await toggleCommunityLike(postId, user!.uid);
    } catch {
      setLikes((prev) => ({ ...prev, [postId]: wasLiked }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likeCount: p.likeCount + (wasLiked ? 1 : -1) } : p
        )
      );
    }
  };

  const handleReport = (postId: string) => {
    if (!requireAuth("report posts")) return;
    Alert.alert("Report Post", "Report this post for inappropriate content?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: () => {
          reportCommunityPost(postId, user!.uid, "inappropriate").catch(() => {});
          Alert.alert("Reported", "Thanks for helping keep the community safe.");
        },
      },
    ]);
  };

  const handleDeletePost = (postId: string, photoUrl?: string) => {
    Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCommunityPost(postId, photoUrl);
            setPosts((prev) => prev.filter((p) => p.id !== postId));
          } catch {
            Alert.alert("Error", "Failed to delete post.");
          }
        },
      },
    ]);
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (authLoading || (loading && posts.length === 0 && sightings.length === 0)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const currentData =
    segment === "activity" ? activityFeed
    : segment === "photos" ? posts.map((p): FeedItem => ({ id: `post-${p.id}`, type: "post", timestamp: tsToMs(p.createdAt), post: p }))
    : sightings.map((s): FeedItem => ({ id: `sight-${s.id}`, type: "sighting", timestamp: tsToMs(s.timestamp), sighting: s }));

  return (
    <View style={styles.container}>
      <FlatList
        data={currentData}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primaryLight} />}
        ListHeaderComponent={
          <>
            {/* ── Segment tabs ── */}
            <View style={styles.segmentBar}>
              {SEGMENTS.map(({ key, label, icon }) => (
                <Pressable
                  key={key}
                  style={[styles.segmentTab, segment === key && styles.segmentTabActive]}
                  onPress={() => setSegment(key)}
                >
                  <Ionicons
                    name={icon as any}
                    size={16}
                    color={segment === key ? Colors.primaryLight : Colors.textMuted}
                  />
                  <Text style={[styles.segmentLabel, segment === key && styles.segmentLabelActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Sighting spotlight (only on Activity tab) ── */}
            {segment === "activity" && sightings.length > 0 && (
              <View style={styles.spotlightSection}>
                <View style={styles.spotlightHeader}>
                  <Text style={styles.spotlightTitle}>Recent Wildlife Sightings</Text>
                  <Pressable onPress={() => setSegment("sightings")}>
                    <Text style={styles.seeAllText}>See all</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.spotlightScroll}
                >
                  {sightings.slice(0, 10).map((s) => (
                    <Pressable
                      key={s.id}
                      style={styles.spotlightCard}
                      onPress={() => s.parkCode && router.push(`/park/${s.parkCode}`)}
                    >
                      {s.photoUrls?.[0] ? (
                        <Image source={{ uri: s.photoUrls[0] }} style={styles.spotlightImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.spotlightImage, styles.spotlightPlaceholder]}>
                          <Text style={{ fontSize: 32 }}>{s.species.emoji}</Text>
                        </View>
                      )}
                      <View style={styles.spotlightInfo}>
                        <Text style={styles.spotlightEmoji}>{s.species.emoji}</Text>
                        <Text style={styles.spotlightSpecies} numberOfLines={1}>
                          {s.species.commonName}
                        </Text>
                        <Text style={styles.spotlightPark} numberOfLines={1}>
                          {s.parkName}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            user={user}
            likes={likes}
            onLike={handleLike}
            onComment={(postId) => setShowComments(postId)}
            onReport={handleReport}
            onDelete={handleDeletePost}
            onParkPress={(code) => router.push(`/park/${code}`)}
            onSightingPress={(s) => s.parkCode && router.push(`/park/${s.parkCode}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyFeed}>
            {segment === "photos" ? (
              <>
                <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No photos yet</Text>
                <Text style={styles.emptyText}>
                  Be the first to share a photo from the trail
                </Text>
              </>
            ) : segment === "sightings" ? (
              <>
                <Text style={{ fontSize: 48 }}>🦌</Text>
                <Text style={styles.emptyTitle}>No sightings yet</Text>
                <Text style={styles.emptyText}>
                  Spot wildlife? Report it from any park page
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="earth-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>The community is just getting started</Text>
                <Text style={styles.emptyText}>
                  Share photos, report sightings, and review parks to build the feed
                </Text>
              </>
            )}
            {!user && (
              <Pressable style={styles.signInBtn} onPress={() => router.push("/(tabs)/profile")}>
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.signInText}>Sign in to contribute</Text>
              </Pressable>
            )}
          </View>
        }
        contentContainerStyle={currentData.length === 0 ? styles.emptyList : styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating create button */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          if (!requireAuth("create posts")) return;
          setShowCreate(true);
        }}
        accessibilityLabel="Create post"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Create post modal */}
      <CreatePostModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        user={user}
        onCreated={() => {
          setShowCreate(false);
          handleRefresh();
        }}
      />

      {/* Comments modal */}
      <CommentsModal
        postId={showComments}
        onClose={() => setShowComments(null)}
        user={user}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEED CARD — renders different card types
// ═══════════════════════════════════════════════════════════════════════════════

function FeedCard({
  item,
  user,
  likes,
  onLike,
  onComment,
  onReport,
  onDelete,
  onParkPress,
  onSightingPress,
}: {
  item: FeedItem;
  user: any;
  likes: Record<string, boolean>;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onReport: (id: string) => void;
  onDelete: (id: string, photoUrl?: string) => void;
  onParkPress: (code: string) => void;
  onSightingPress: (s: SightingDoc) => void;
}) {
  if (item.type === "post" && item.post) return (
    <PostCard
      post={item.post}
      user={user}
      liked={likes[item.post.id!] ?? false}
      onLike={() => onLike(item.post!.id!)}
      onComment={() => onComment(item.post!.id!)}
      onReport={() => onReport(item.post!.id!)}
      onDelete={() => onDelete(item.post!.id!, item.post!.photoUrl)}
      onParkPress={onParkPress}
    />
  );
  if (item.type === "sighting" && item.sighting) return (
    <SightingCard sighting={item.sighting} onPress={() => onSightingPress(item.sighting!)} />
  );
  if (item.type === "review" && item.review) return (
    <ReviewCard review={item.review} onParkPress={onParkPress} />
  );
  if (item.type === "condition" && item.condition) return (
    <ConditionCard condition={item.condition} onParkPress={onParkPress} />
  );
  return null;
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  user,
  liked,
  onLike,
  onComment,
  onReport,
  onDelete,
  onParkPress,
}: {
  post: CommunityPost;
  user: any;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
  onReport: () => void;
  onDelete: () => void;
  onParkPress: (code: string) => void;
}) {
  const isOwn = user?.uid === post.uid;
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(post.displayName ?? "?")[0].toUpperCase()}</Text>
        </View>
        <View style={styles.postHeaderInfo}>
          <Text style={styles.postAuthor}>{post.displayName}</Text>
          <Text style={styles.postTime}>{timeAgo(post.createdAt)}</Text>
        </View>
        <Pressable
          onPress={() => {
            if (isOwn) {
              Alert.alert("Post Options", undefined, [
                { text: "Delete Post", style: "destructive", onPress: onDelete },
                { text: "Cancel", style: "cancel" },
              ]);
            } else {
              onReport();
            }
          }}
          hitSlop={12}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Image source={{ uri: post.photoUrl }} style={styles.postImage} contentFit="cover" />

      <View style={styles.postActions}>
        <Pressable style={styles.actionBtn} onPress={onLike}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={22}
            color={liked ? Colors.error : Colors.text}
          />
          {post.likeCount > 0 && <Text style={styles.actionCount}>{post.likeCount}</Text>}
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.text} />
          {post.commentCount > 0 && <Text style={styles.actionCount}>{post.commentCount}</Text>}
        </Pressable>
      </View>

      {post.caption ? (
        <Text style={styles.caption}>
          <Text style={styles.captionAuthor}>{post.displayName} </Text>
          {post.caption}
        </Text>
      ) : null}

      {post.parkName ? (
        <Pressable onPress={() => post.parkCode && onParkPress(post.parkCode)}>
          <Text style={styles.parkTag}>
            <Ionicons name="location-outline" size={12} color={Colors.primaryLight} />{" "}
            {post.parkName}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Sighting Card ────────────────────────────────────────────────────────────

function SightingCard({ sighting: s, onPress }: { sighting: SightingDoc; onPress: () => void }) {
  const confidenceColor =
    s.confidence === "certain" ? "#22c55e" : s.confidence === "probable" ? "#f59e0b" : "#94a3b8";

  return (
    <Pressable style={styles.sightingCard} onPress={onPress}>
      <View style={styles.cardTypeBadge}>
        <Ionicons name="eye-outline" size={11} color={Colors.primaryLight} />
        <Text style={styles.cardTypeText}>Wildlife Sighting</Text>
      </View>

      <View style={styles.sightingBody}>
        <View style={styles.sightingLeft}>
          <Text style={styles.sightingEmoji}>{s.species.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.sightingSpecies}>{s.species.commonName}</Text>
            <Text style={styles.sightingMeta}>
              {s.count > 1 ? `${s.count} spotted` : "1 spotted"} · {s.species.categoryLabel}
            </Text>
          </View>
        </View>

        {s.photoUrls?.[0] ? (
          <Image source={{ uri: s.photoUrls[0] }} style={styles.sightingThumb} contentFit="cover" />
        ) : null}
      </View>

      {s.notes ? (
        <Text style={styles.sightingNotes} numberOfLines={2}>"{s.notes}"</Text>
      ) : null}

      <View style={styles.sightingFooter}>
        <View style={[styles.confidenceDot, { backgroundColor: confidenceColor }]} />
        <Text style={[styles.confidenceText, { color: confidenceColor }]}>{s.confidence}</Text>
        <Text style={styles.sightingDivider}>·</Text>
        <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
        <Text style={styles.sightingPark} numberOfLines={1}>{s.parkName}</Text>
        <Text style={styles.sightingDivider}>·</Text>
        <Text style={styles.sightingTime}>{timeAgo(s.timestamp)}</Text>
      </View>

      <View style={styles.sightingReporter}>
        <View style={styles.miniAvatar}>
          <Text style={styles.miniAvatarText}>{(s.userDisplayName ?? "?")[0].toUpperCase()}</Text>
        </View>
        <Text style={styles.reporterName}>{s.userDisplayName}</Text>
      </View>
    </Pressable>
  );
}

// ─── Review Card ──────────────────────────────────────────────────────────────

function ReviewCard({
  review: r,
  onParkPress,
}: {
  review: ReviewDoc & { parkCode: string };
  onParkPress: (code: string) => void;
}) {
  const parkName = resolveParkName(r.parkCode);
  const stars = Array.from({ length: 5 }, (_, i) => i < r.rating);

  return (
    <Pressable style={styles.reviewCard} onPress={() => onParkPress(r.parkCode)}>
      <View style={styles.cardTypeBadge}>
        <Ionicons name="star-outline" size={11} color="#facc15" />
        <Text style={styles.cardTypeText}>Park Review</Text>
      </View>

      <View style={styles.reviewHeader}>
        <View style={styles.miniAvatar}>
          <Text style={styles.miniAvatarText}>{(r.displayName ?? "?")[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewAuthor}>{r.displayName}</Text>
          <View style={styles.starRow}>
            {stars.map((filled, i) => (
              <Ionicons key={i} name={filled ? "star" : "star-outline"} size={14} color="#facc15" />
            ))}
            <Text style={styles.reviewTime}>{timeAgo(r.createdAt)}</Text>
          </View>
        </View>
      </View>

      {r.text ? (
        <Text style={styles.reviewText} numberOfLines={3}>"{r.text}"</Text>
      ) : null}

      {r.imageUrls && r.imageUrls.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reviewPhotos}>
          {r.imageUrls.slice(0, 3).map((url, i) => (
            <Image key={i} source={{ uri: url }} style={styles.reviewThumb} contentFit="cover" />
          ))}
        </ScrollView>
      )}

      <View style={styles.reviewParkRow}>
        <Ionicons name="location-outline" size={13} color={Colors.primaryLight} />
        <Text style={styles.reviewParkName} numberOfLines={1}>{parkName}</Text>
        <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

// ─── Condition Report Card ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open: "#22c55e",
  partial: "#f59e0b",
  closed: "#ef4444",
  unknown: "#94a3b8",
};

const CROWDING_LABELS: Record<string, string> = {
  empty: "Empty",
  light: "Light",
  moderate: "Moderate",
  crowded: "Crowded",
};

const WILDLIFE_LABELS: Record<string, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
  none: "None",
};

function ConditionCard({
  condition: c,
  onParkPress,
}: {
  condition: ConditionReportDoc & { parkCode: string };
  onParkPress: (code: string) => void;
}) {
  const parkName = resolveParkName(c.parkCode);
  const statusColor = STATUS_COLORS[c.trailStatus] ?? "#94a3b8";

  return (
    <Pressable style={styles.conditionCard} onPress={() => onParkPress(c.parkCode)}>
      <View style={styles.cardTypeBadge}>
        <Ionicons name="flag-outline" size={11} color={statusColor} />
        <Text style={styles.cardTypeText}>Trail Condition Report</Text>
      </View>

      <View style={styles.conditionBadges}>
        <View style={[styles.condBadge, { borderColor: statusColor }]}>
          <View style={[styles.condDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.condBadgeText, { color: statusColor }]}>
            {c.trailStatus === "open" ? "Open" : c.trailStatus === "partial" ? "Partially Open" : c.trailStatus === "closed" ? "Closed" : "Unknown"}
          </Text>
        </View>
        <View style={styles.condBadge}>
          <Ionicons name="people-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.condBadgeText}>{CROWDING_LABELS[c.crowding] ?? c.crowding}</Text>
        </View>
        <View style={styles.condBadge}>
          <Ionicons name="paw-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.condBadgeText}>{WILDLIFE_LABELS[c.wildlifeActivity] ?? c.wildlifeActivity}</Text>
        </View>
      </View>

      {c.accessNotes ? (
        <Text style={styles.condNotes} numberOfLines={2}>{c.accessNotes}</Text>
      ) : null}

      <View style={styles.condFooter}>
        <View style={styles.miniAvatar}>
          <Text style={styles.miniAvatarText}>{(c.displayName ?? "?")[0].toUpperCase()}</Text>
        </View>
        <Text style={styles.reporterName}>{c.displayName}</Text>
        <Text style={styles.sightingDivider}>·</Text>
        <Ionicons name="location-outline" size={12} color={Colors.primaryLight} />
        <Text style={styles.reviewParkName} numberOfLines={1}>{parkName}</Text>
        <Text style={styles.sightingDivider}>·</Text>
        <Text style={styles.sightingTime}>{timeAgo(c.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE POST MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function CreatePostModal({
  visible,
  onClose,
  user,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  user: any;
  onCreated: () => void;
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Camera access is required to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const handlePost = async () => {
    if (!imageUri || !user) return;
    setPosting(true);
    try {
      const photoUrl = await uploadCommunityPhoto(user.uid, imageUri);
      await addCommunityPost({
        uid: user.uid,
        displayName: user.displayName ?? "Explorer",
        photoUrl,
        caption: caption.trim(),
      });
      setImageUri(null);
      setCaption("");
      onCreated();
    } catch {
      Alert.alert("Error", "Failed to create post. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const handleClose = () => {
    setImageUri(null);
    setCaption("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalBackdrop}
      >
        <View style={styles.createSheet}>
          <View style={styles.modalHandleBar} />
          <View style={styles.createHeader}>
            <Pressable onPress={handleClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Text style={styles.createTitle}>New Post</Text>
            <Pressable onPress={handlePost} disabled={posting || !imageUri}>
              {posting ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={[styles.shareText, !imageUri && styles.shareDisabled]}>Share</Text>
              )}
            </Pressable>
          </View>

          {imageUri ? (
            <Pressable onPress={pickImage}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" />
            </Pressable>
          ) : (
            <View style={styles.imagePicker}>
              <Pressable style={styles.pickBtn} onPress={pickImage}>
                <Ionicons name="images-outline" size={28} color={Colors.primaryLight} />
                <Text style={styles.pickText}>Gallery</Text>
              </Pressable>
              <Pressable style={styles.pickBtn} onPress={takePhoto}>
                <Ionicons name="camera-outline" size={28} color={Colors.primaryLight} />
                <Text style={styles.pickText}>Camera</Text>
              </Pressable>
            </View>
          )}

          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption..."
            placeholderTextColor={Colors.textMuted}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={300}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENTS MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function CommentsModal({
  postId,
  onClose,
  user,
}: {
  postId: string | null;
  onClose: () => void;
  user: any;
}) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    getCommunityComments(postId)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  const handleSend = async () => {
    if (!postId || !text.trim() || !user) return;
    setSending(true);
    try {
      await addCommunityComment(postId, {
        uid: user.uid,
        displayName: user.displayName ?? "Explorer",
        text: text.trim(),
      });
      setText("");
      const updated = await getCommunityComments(postId);
      setComments(updated);
    } catch {
      Alert.alert("Error", "Failed to post comment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={!!postId} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalBackdrop}
      >
        <View style={styles.commentsSheet}>
          <View style={styles.modalHandleBar} />
          <View style={styles.commentsHeader}>
            <Text style={styles.commentsTitle}>Comments</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></Pressable>
          </View>

          {loading ? (
            <View style={styles.commentLoading}><ActivityIndicator color={Colors.primary} /></View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id!}
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>{(item.displayName ?? "?")[0].toUpperCase()}</Text>
                  </View>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>{item.displayName}</Text>
                    <Text style={styles.commentText}>{item.text}</Text>
                    <Text style={styles.commentTime}>{timeAgo(item.createdAt)}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.noComments}>No comments yet</Text>}
              contentContainerStyle={styles.commentsList}
              showsVerticalScrollIndicator={false}
            />
          )}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder={user ? "Add a comment..." : "Sign in to comment"}
              placeholderTextColor={Colors.textMuted}
              value={text}
              onChangeText={setText}
              maxLength={200}
              editable={!!user}
            />
            <Pressable onPress={handleSend} disabled={sending || !text.trim() || !user}>
              {sending ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="send" size={22} color={text.trim() && user ? Colors.primary : Colors.textMuted} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background },
  list: { paddingBottom: 80 },
  emptyList: { flex: 1 },

  // ── Segment bar ──
  segmentBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  segmentTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentTabActive: {
    backgroundColor: Colors.primaryDark + "44",
  },
  segmentLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  segmentLabelActive: {
    color: Colors.primaryLight,
  },

  // ── Spotlight carousel ──
  spotlightSection: {
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  spotlightHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  spotlightTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  seeAllText: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: "600",
  },
  spotlightScroll: {
    paddingHorizontal: 12,
    gap: 10,
    paddingBottom: 12,
  },
  spotlightCard: {
    width: 140,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    overflow: "hidden",
    marginRight: 10,
  },
  spotlightImage: {
    width: 140,
    height: 100,
  },
  spotlightPlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  spotlightInfo: {
    padding: 8,
  },
  spotlightEmoji: {
    fontSize: 16,
    marginBottom: 2,
  },
  spotlightSpecies: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  spotlightPark: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },

  // ── Empty state ──
  emptyFeed: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 24,
  },
  signInText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },

  // ── Post card ──
  postCard: {
    backgroundColor: Colors.surface,
    marginBottom: 1,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  postHeaderInfo: { flex: 1 },
  postAuthor: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  postTime: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  postImage: {
    width: "100%",
    aspectRatio: 4 / 3,
  },
  postActions: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionCount: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "500",
  },
  caption: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  captionAuthor: { fontWeight: "700" },
  parkTag: {
    color: Colors.primaryLight,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },

  // ── Sighting card ──
  sightingCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primaryLight,
  },
  sightingBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  sightingLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sightingEmoji: { fontSize: 28 },
  sightingSpecies: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  sightingMeta: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  sightingThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  sightingNotes: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 8,
    lineHeight: 18,
  },
  sightingFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
  },
  confidenceDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  sightingDivider: {
    color: Colors.textMuted,
    fontSize: 11,
    marginHorizontal: 2,
  },
  sightingPark: {
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
  },
  sightingTime: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  sightingReporter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },

  // ── Review card ──
  reviewCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#facc15",
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  reviewAuthor: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 3,
  },
  reviewTime: {
    color: Colors.textMuted,
    fontSize: 11,
    marginLeft: 6,
  },
  reviewText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 10,
    lineHeight: 18,
  },
  reviewPhotos: {
    marginTop: 10,
  },
  reviewThumb: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: 6,
  },
  reviewParkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  reviewParkName: {
    color: Colors.primaryLight,
    fontSize: 12,
    flex: 1,
  },

  // ── Condition card ──
  conditionCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
  },
  conditionBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  condBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  condDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  condBadgeText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  condNotes: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  condFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },

  // ── Card type badge ──
  cardTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  cardTypeText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Mini avatar (shared) ──
  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  miniAvatarText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  reporterName: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },

  // ── FAB ──
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },

  // ── Create modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  createSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 30,
    maxHeight: "85%",
  },
  modalHandleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  createHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  createTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  shareText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  shareDisabled: { opacity: 0.4 },
  imagePicker: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 30,
    paddingVertical: 40,
  },
  pickBtn: {
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 24,
    width: 120,
  },
  pickText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "500",
  },
  previewImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginTop: 14,
  },
  captionInput: {
    color: Colors.text,
    fontSize: 15,
    marginTop: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    minHeight: 44,
    maxHeight: 100,
  },

  // ── Comments modal ──
  commentsSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "70%",
    paddingHorizontal: 16,
  },
  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  commentsTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  commentLoading: {
    paddingVertical: 40,
    alignItems: "center",
  },
  commentsList: { paddingVertical: 10 },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  commentBody: { flex: 1 },
  commentAuthor: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  commentText: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  commentTime: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  noComments: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 30,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 10,
    paddingBottom: 20,
  },
  commentInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 80,
  },
});
