import FontAwesome from "@expo/vector-icons/FontAwesome";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { AuthProvider } from "@/context/AuthContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import Paywall from "@/components/Paywall";
import { Colors } from "@/constants/Colors";
import { preloadParks, preloadSAParks } from "@/services/preloadService";
import { trackSession } from "@/utils/reviewPrompt";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const parkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
    notification: Colors.accent,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    "Montserrat-Bold": require("../assets/fonts/Montserrat-Bold.ttf"),
    "Montserrat-SemiBold": require("../assets/fonts/Montserrat-SemiBold.ttf"),
    "Montserrat-Medium": require("../assets/fonts/Montserrat-Medium.ttf"),
    ...FontAwesome.font,
  });

  const router = useRouter();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (!loaded) return;
    // Prime park data cache ASAP — map tab reads synchronously on mount
    preloadParks();
    preloadSAParks();
    // Track session for review prompt
    trackSession();
    // Check onboarding before hiding splash
    AsyncStorage.getItem("onboarding_done").then((val) => {
      SplashScreen.hideAsync();
      if (!val) {
        router.replace("/onboarding");
      }
    }).catch(() => {
      SplashScreen.hideAsync();
    });
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <ThemeProvider value={parkTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="onboarding"
              options={{ headerShown: false, gestureEnabled: false, animation: "fade" }}
            />
            <Stack.Screen name="park/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="activity/[name]" options={{ headerShown: false }} />
            <Stack.Screen
              name="sighting/submit"
              options={{ headerShown: false, presentation: "modal" }}
            />
          </Stack>
          <Paywall />
        </ThemeProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
