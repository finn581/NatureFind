// Gemini AI API — Trip planning and recommendations
// Uses Gemini Flash for fast, low-cost inference

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? "";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TripSuggestion {
  parkName: string;
  parkCode?: string;
  whyVisit: string;
  bestTrail: string;
  campground: string;
  wildlife: string;
  tips: string;
}

export interface TripPlan {
  title: string;
  summary: string;
  days: TripDay[];
  packingTips: string[];
}

export interface TripDay {
  day: number;
  label: string; // e.g. "Day 1 — Drive & Explore"
  activities: TripActivity[];
}

export interface TripActivity {
  time: string; // "Morning", "Afternoon", "Evening"
  title: string;
  description: string;
  type: "drive" | "hike" | "camp" | "explore" | "wildlife" | "eat";
}

// ─── Generate Trip Plan ──────────────────────────────────────────────────────

export async function generateTripPlan(
  location: string,
  days: number,
  interests: string[],
  month: string,
  parksNearby?: string[],
): Promise<TripPlan | null> {
  if (!API_KEY) return null;

  const parkContext = parksNearby?.length
    ? `\nParks near the user: ${parksNearby.join(", ")}`
    : "";

  const prompt = `You are an expert outdoor trip planner. Create a ${days}-day trip plan for someone near ${location} in ${month}.

Their interests: ${interests.join(", ")}
${parkContext}

Return a JSON object (no markdown, no code fences) with this exact structure:
{
  "title": "Short trip title",
  "summary": "2-3 sentence overview",
  "days": [
    {
      "day": 1,
      "label": "Day 1 — Theme",
      "activities": [
        {
          "time": "Morning",
          "title": "Activity name",
          "description": "1-2 sentence description with specific trail/park names",
          "type": "hike"
        }
      ]
    }
  ],
  "packingTips": ["tip 1", "tip 2", "tip 3", "tip 4", "tip 5"]
}

Rules:
- Use real park names, real trail names, real campground names
- Include specific distances and difficulty levels for hikes
- Consider ${month} weather and seasonal wildlife
- Include driving times between locations
- Mix activities: hiking, wildlife watching, scenic viewpoints, campfire evenings
- Be specific — "Cascade Falls Trail (2.4 mi, moderate)" not "go for a hike"
- Activity types: drive, hike, camp, explore, wildlife, eat`;

  try {
    const resp = await fetch(`${BASE}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!resp.ok) {
      console.warn("[Gemini] API error:", resp.status);
      return null;
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const plan: TripPlan = JSON.parse(text);
    return plan;
  } catch (e) {
    console.warn("[Gemini] trip plan failed:", e);
    return null;
  }
}

// ─── Quick Park Recommendation ───────────────────────────────────────────────

export async function getQuickRecommendation(
  parkName: string,
  month: string,
): Promise<string | null> {
  if (!API_KEY) return null;

  const prompt = `In 2-3 sentences, what makes ${parkName} special to visit in ${month}? Mention one specific trail or activity and any seasonal wildlife. Be enthusiastic but concise.`;

  try {
    const resp = await fetch(`${BASE}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}
