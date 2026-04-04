import { Share, Platform } from "react-native";

interface ShareParkParams {
  parkName: string;
  parkState: string;
  parkCode: string;
  description?: string;
}

export async function sharePark({
  parkName,
  parkState,
  parkCode,
  description,
}: ShareParkParams): Promise<void> {
  const url = `https://finn581.github.io/NatureFind/parks/${slugify(parkName)}.html`;
  const shortDesc = description
    ? description.slice(0, 100) + (description.length > 100 ? "..." : "")
    : `Explore ${parkName} in ${parkState}`;

  await Share.share(
    {
      title: `${parkName} — NatureFind`,
      message:
        Platform.OS === "ios"
          ? `Check out ${parkName} in ${parkState}! ${shortDesc}\n\n${url}`
          : `Check out ${parkName} in ${parkState}! ${shortDesc}`,
      url: Platform.OS === "ios" ? url : undefined,
    },
    {
      subject: `${parkName} — NatureFind`,
      dialogTitle: `Share ${parkName}`,
    }
  );
}

interface ShareTripParams {
  destination: string;
  days: number;
  highlights: string[];
}

export async function shareTrip({
  destination,
  days,
  highlights,
}: ShareTripParams): Promise<void> {
  const highlightText = highlights
    .slice(0, 3)
    .map((h) => `• ${h}`)
    .join("\n");
  const message = `My ${days}-day trip to ${destination} planned with NatureFind:\n${highlightText}\n\nPlan your own trip: https://apps.apple.com/app/naturefind/id6759922299`;

  await Share.share(
    {
      title: `${days}-Day Trip to ${destination}`,
      message,
    },
    {
      subject: `Trip to ${destination}`,
      dialogTitle: "Share Trip Plan",
    }
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
