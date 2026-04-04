import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import Constants from "expo-constants";

const KEYS = {
  actionCount: "review_action_count",
  sessionCount: "review_session_count",
  lastReviewedVersion: "review_last_reviewed_version",
};

const ACTION_THRESHOLD = 3;
const SESSION_THRESHOLD = 3;

function getAppVersion(): string {
  return (
    Constants.expoConfig?.version ??
    Constants.manifest?.version ??
    "unknown"
  );
}

async function getNumber(key: string): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(key);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

async function setNumber(key: string, value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {
    // silently fail
  }
}

/**
 * Call once per app launch to increment the session count.
 */
export async function trackSession(): Promise<void> {
  const current = await getNumber(KEYS.sessionCount);
  await setNumber(KEYS.sessionCount, current + 1);
}

/**
 * Call after a positive user action (e.g. saving a favorite).
 * Triggers the native review prompt when all thresholds are met
 * and the user has not already been prompted for this app version.
 */
export async function trackReviewAction(): Promise<void> {
  try {
    const [actionCount, sessionCount, lastReviewedVersion] = await Promise.all([
      getNumber(KEYS.actionCount),
      getNumber(KEYS.sessionCount),
      AsyncStorage.getItem(KEYS.lastReviewedVersion).catch(() => null),
    ]);

    const newActionCount = actionCount + 1;
    await setNumber(KEYS.actionCount, newActionCount);

    const currentVersion = getAppVersion();
    const alreadyReviewed = lastReviewedVersion === currentVersion;

    if (
      newActionCount >= ACTION_THRESHOLD &&
      sessionCount >= SESSION_THRESHOLD &&
      !alreadyReviewed
    ) {
      const canReview = await StoreReview.hasAction();
      if (!canReview) return;

      // Mark as reviewed before showing prompt to avoid duplicate requests
      await AsyncStorage.setItem(KEYS.lastReviewedVersion, currentVersion);

      // Brief delay so the user's action completes visually first
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));

      await StoreReview.requestReview();
    }
  } catch {
    // silently fail — never interrupt user flow
  }
}
