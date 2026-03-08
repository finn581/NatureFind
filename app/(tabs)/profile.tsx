import React from "react";
import { View, Text, Pressable, StyleSheet, Alert, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Colors } from "@/constants/Colors";
import { useAuth } from "@/context/AuthContext";
import { deleteAccount } from "@/services/firebase";

WebBrowser.maybeCompleteAuthSession();

export default function ProfileTab() {
  const { user, loading, signInGoogle, signInApple, signOut } = useAuth();

  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    iosClientId: googleClientId ?? "not-configured",
  });

  React.useEffect(() => {
    if (googleResponse?.type === "success") {
      const { id_token } = googleResponse.params;
      if (id_token) {
        signInGoogle(id_token);
      }
    }
  }, [googleResponse]);

  const handleGoogleSignIn = async () => {
    try {
      await googlePromptAsync();
    } catch (e) {
      Alert.alert("Error", "Google sign-in failed. Please try again.");
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
        Alert.alert(
          "Sign In Error",
          `Apple sign-in failed: ${e.message ?? e.code ?? "Unknown error"}`
        );
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
              if (user) {
                await deleteAccount(user.uid);
              }
            } catch {
              Alert.alert("Error", "Failed to delete account. Please try again.");
            }
          },
        },
      ]
    );
  };

  if (user) {
    return (
      <View style={styles.container}>
        <View style={styles.profileCard}>
          <View style={styles.avatar} accessibilityLabel="Profile avatar">
            <Ionicons name="person" size={40} color={Colors.primaryLight} />
          </View>
          <Text style={styles.displayName}>
            {user.displayName ?? "Park Explorer"}
          </Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="heart" size={24} color={Colors.accent} />
            <Text style={styles.statLabel}>Favorites</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="star" size={24} color={Colors.star} />
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
        </View>

        <Pressable
          style={styles.signOutBtn}
          onPress={handleSignOut}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <Pressable
          style={styles.deleteBtn}
          onPress={handleDeleteAccount}
          accessibilityLabel="Delete account"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
          <Text style={styles.deleteText}>Delete Account</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Image
          source={require("@/assets/images/logo-circle.png")}
          style={styles.heroLogo}
          contentFit="cover"
        />
        <Text style={styles.heroTitle}>NatureFind</Text>
        <Text style={styles.heroSub}>
          Sign in to save favorites and write reviews
        </Text>
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
          <Text style={styles.authBtnText}>Sign in with Google</Text>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 20,
  },
  hero: {
    alignItems: "center",
    marginTop: 40,
    marginBottom: 40,
  },
  heroLogo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    shadowColor: Colors.primaryLight,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 30,
    fontFamily: "Montserrat-Bold",
    letterSpacing: 1.5,
    marginTop: 16,
  },
  heroSub: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: "Montserrat-Medium",
    marginTop: 8,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  authButtons: {
    gap: 12,
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
  profileCard: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 30,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  displayName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  email: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 30,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
  },
  signOutText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: "600",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  deleteText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: "600",
  },
});
