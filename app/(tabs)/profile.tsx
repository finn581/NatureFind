import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { OfflineMapsManager } from "@/components/OfflineMapsManager";
import {
  deleteAccount,
  countFavorites,
  countUserReviews,
  countUserSightings,
  countVisits,
  getRecentVisits,
} from "@/services/firebase";

WebBrowser.maybeCompleteAuthSession();

interface UserStats {
  favorites: number;
  reviews: number;
  sightings: number;
  visits: number;
}

export default function ProfileTab() {
  const { user, loading, signInGoogle, signInApple, signInEmail, signOut } = useAuth();
  const { isPro } = useSubscription();
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const router = useRouter();

  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    iosClientId: googleClientId ?? "not-configured",
  });

  const [stats, setStats] = useState<UserStats>({ favorites: 0, reviews: 0, sightings: 0, visits: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [recentVisits, setRecentVisits] = useState<{ parkCode: string; parkName: string }[]>([]);

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const { id_token } = googleResponse.params;
      if (id_token) signInGoogle(id_token);
    }
  }, [googleResponse]);

  useEffect(() => {
    if (!user) {
      setStats({ favorites: 0, reviews: 0, sightings: 0, visits: 0 });
      setRecentVisits([]);
      return;
    }
    setStatsLoading(true);
    Promise.allSettled([
      countFavorites(user.uid),
      countUserReviews(user.uid),
      countUserSightings(user.uid),
      countVisits(user.uid),
      getRecentVisits(user.uid, 3),
    ]).then(([f, r, s, v, rv]) => {
      setStats({
        favorites: f.status === "fulfilled" ? f.value : 0,
        reviews:   r.status === "fulfilled" ? r.value : 0,
        sightings: s.status === "fulfilled" ? s.value : 0,
        visits:    v.status === "fulfilled" ? v.value : 0,
      });
      if (rv.status === "fulfilled") setRecentVisits(rv.value);
      setStatsLoading(false);
    });
  }, [user]);

  const handleGoogleSignIn = async () => {
    try {
      await googlePromptAsync();
    } catch {
      Alert.alert("Error", "Google sign-in failed. Please try again.");
    }
  };

  const handleEmailSignIn = async () => {
    if (!emailInput.trim() || !passwordInput.trim()) {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }
    setEmailLoading(true);
    try {
      await signInEmail(emailInput.trim(), passwordInput.trim());
    } catch (e: any) {
      const msg = e.code === "auth/invalid-credential"
        ? "Invalid email or password."
        : e.code === "auth/user-not-found"
        ? "No account found with that email."
        : e.code === "auth/wrong-password"
        ? "Incorrect password."
        : e.message ?? "Sign in failed.";
      Alert.alert("Sign In Error", msg);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const nonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (credential.identityToken) {
        await signInApple(credential.identityToken, nonce);
      }
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Sign In Error", `Apple sign-in failed: ${e.message ?? e.code ?? "Unknown error"}`);
      }
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all saved data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (user) await deleteAccount(user.uid);
            } catch {
              Alert.alert("Error", "Failed to delete account. Please try again.");
            }
          },
        },
      ]
    );
  };

  if (user) {
    const initials = (user.displayName ?? "P").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{user.displayName ?? "Park Explorer"}</Text>
          {user.email ? <Text style={styles.email}>{user.email}</Text> : null}
          {isPro ? (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          ) : (
            <View style={styles.memberBadge}>
              <Ionicons name="leaf" size={12} color={Colors.primaryLight} />
              <Text style={styles.memberText}>Nature Explorer</Text>
            </View>
          )}
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {statsLoading ? (
            <ActivityIndicator color={Colors.primaryLight} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <StatCard icon="heart" color={Colors.error} value={stats.favorites} label="Saved Parks" onPress={() => router.push("/(tabs)/community")} />
              <StatCard icon="star" color="#facc15" value={stats.reviews} label="Reviews" />
              <StatCard icon="eye" color="#7dd3fc" value={stats.sightings} label="Sightings" onPress={() => router.push("/sighting/submit")} />
              <StatCard icon="map" color={Colors.primaryLight} value={stats.visits} label="Parks Visited" />
            </>
          )}
        </View>

        {/* Recent visits */}
        {recentVisits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Visited</Text>
            {recentVisits.map((v) => (
              <Pressable
                key={v.parkCode}
                style={styles.visitRow}
                onPress={() => router.push(`/park/${v.parkCode}`)}
              >
                <Ionicons name="location" size={16} color={Colors.primaryLight} />
                <Text style={styles.visitName} numberOfLines={1}>{v.parkName}</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        {/* More Apps */}
        <View style={styles.moreAppsSection}>
          <Text style={styles.moreAppsHeading}>More Apps by Finn</Text>
          <Pressable
            style={styles.appCard}
            onPress={() => Linking.openURL("https://apps.apple.com/app/pettrace-pet-safety-scanner/id6761043968")}
            accessibilityLabel="Open PetTrace on the App Store"
            accessibilityRole="button"
          >
            <Text style={styles.appCardEmoji}>🐾</Text>
            <View style={styles.appCardInfo}>
              <Text style={styles.appCardName}>PetTrace</Text>
              <Text style={styles.appCardDesc}>Pet safety scanner — plant toxicity, pet ID & recovery</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#aaa" />
          </Pressable>
          <Pressable
            style={styles.appCard}
            onPress={() => Linking.openURL("https://apps.apple.com/app/carefind-find-doctors-nearby/id6760765478")}
            accessibilityLabel="Open CareFind on the App Store"
            accessibilityRole="button"
          >
            <Text style={styles.appCardEmoji}>🏥</Text>
            <View style={styles.appCardInfo}>
              <Text style={styles.appCardName}>CareFind</Text>
              <Text style={styles.appCardDesc}>Find doctors, dentists & specialists near you</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#aaa" />
          </Pressable>
        </View>

        {/* Offline Maps */}
        <OfflineMapsManager />

        {/* Actions */}
        <View style={styles.section}>
          <Pressable
            style={styles.actionBtn}
            onPress={handleSignOut}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={20} color={Colors.error} />
            <Text style={styles.actionBtnText}>Sign Out</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={handleDeleteAccount}
            accessibilityLabel="Delete account"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
            <Text style={styles.actionBtnText}>Delete Account</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>NatureFind · v1.0.0</Text>
      </ScrollView>
    );
  }

  // ── Signed-out state ─────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Image
          source={require("@/assets/images/logo-circle.png")}
          style={styles.heroLogo}
          contentFit="cover"
        />
        <Text style={styles.heroTitle}>NatureFind</Text>
        <Text style={styles.heroSub}>Sign in to save favorites, write reviews, and track your adventures</Text>
      </View>

      <View style={styles.benefitsList}>
        {["Save favorite parks & plan trips", "Log wildlife sightings on the trail", "Write reviews and share conditions", "Track every park you've visited"].map((b) => (
          <View key={b} style={styles.benefitRow}>
            <View style={styles.benefitDot} />
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={styles.authButtons}>
        <Pressable
          style={[styles.googleBtn, (!googleRequest || !googleClientId) && styles.btnDisabled]}
          onPress={handleGoogleSignIn}
          disabled={!googleRequest || !googleClientId}
          accessibilityLabel="Sign in with Google"
          accessibilityRole="button"
        >
          <Ionicons name="logo-google" size={20} color={Colors.white} />
          <Text style={styles.authBtnText}>Continue with Google</Text>
        </Pressable>

        {Platform.OS === "ios" && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
            cornerRadius={10}
            style={styles.appleNativeBtn}
            onPress={handleAppleSignIn}
          />
        )}

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or sign in with email</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput
          style={styles.emailInput}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          value={emailInput}
          onChangeText={setEmailInput}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.emailInput}
          placeholder="Password"
          placeholderTextColor={Colors.textMuted}
          value={passwordInput}
          onChangeText={setPasswordInput}
          secureTextEntry
          autoCapitalize="none"
        />
        <Pressable
          style={[styles.emailBtn, emailLoading && styles.btnDisabled]}
          onPress={handleEmailSignIn}
          disabled={emailLoading}
        >
          {emailLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.authBtnText}>Sign In</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function StatCard({
  icon,
  color,
  value,
  label,
  onPress,
}: {
  icon: string;
  color: string;
  value: number;
  label: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress} style={styles.statCardOuter}>{content}</Pressable>;
  }
  return <View style={styles.statCardOuter}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },

  // ── Profile card ──
  profileCard: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 24,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  displayName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  email: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 10,
  },
  proBadge: {
    backgroundColor: "#FACC15",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  proBadgeText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.surface + "aa",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  memberText: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: "600",
  },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  statCardOuter: {
    width: "47.5%",
  },
  statCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "800",
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  // ── Sections ──
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },

  // ── Recent visits ──
  visitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  visitName: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
  },

  // ── Action buttons ──
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 10,
  },
  deleteBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.error + "55",
  },
  actionBtnText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: "600",
  },

  version: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },

  // ── More Apps ──
  moreAppsSection: {
    marginBottom: 20,
  },
  moreAppsHeading: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  appCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e1e2e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  appCardEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  appCardInfo: {
    flex: 1,
  },
  appCardName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  appCardDesc: {
    color: "#aaa",
    fontSize: 13,
  },

  // ── Signed-out ──
  hero: {
    alignItems: "center",
    marginTop: 48,
    marginBottom: 32,
    paddingHorizontal: 24,
  },
  heroLogo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    shadowColor: Colors.primaryLight,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 28,
    fontFamily: "Montserrat-Bold",
    letterSpacing: 1.5,
    marginTop: 16,
  },
  heroSub: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  benefitsList: {
    marginHorizontal: 24,
    marginBottom: 28,
    gap: 12,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  benefitDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.primaryLight,
  },
  benefitText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  authButtons: {
    gap: 12,
    marginHorizontal: 24,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4285F4",
    borderRadius: 10,
    paddingVertical: 14,
    gap: 10,
  },
  appleNativeBtn: {
    height: 48,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  authBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  emailInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emailBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
