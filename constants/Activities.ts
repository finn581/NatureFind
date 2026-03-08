export interface ActivityConfig {
  name: string;
  icon: string;
  color: string;
  darkColor: string;
  accentColor: string;
  description: string;
  tips: string[];
  bestSeason: string;
  photo: string | number;
}

export const ACTIVITY_LIST: ActivityConfig[] = [
  {
    name: "Hiking",
    icon: "trail-sign",
    color: "#2d6a4f",
    darkColor: "#1b4332",
    accentColor: "#52b788",
    description: "Explore thousands of trails across America's wild places",
    tips: [
      "Start early to avoid crowds and midday heat",
      "Carry at least 2L of water per person for day hikes",
      "Tell someone your planned route and return time",
      "Download offline maps before heading out",
    ],
    bestSeason: "Spring & Fall",
    photo: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&q=80&fit=crop",
  },
  {
    name: "Camping",
    icon: "bonfire",
    color: "#744210",
    darkColor: "#4a2c0a",
    accentColor: "#f59e0b",
    description: "Sleep under the stars at iconic campgrounds nationwide",
    tips: [
      "Reserve sites months in advance for popular parks",
      "Check fire regulations — bans change seasonally",
      "Store food in bear boxes or hang it 10 feet high",
      "Leave no trace — pack out everything you pack in",
    ],
    bestSeason: "Summer & Fall",
    photo: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&q=80&fit=crop",
  },
  {
    name: "Fishing",
    icon: "water",
    color: "#1a5276",
    darkColor: "#0d2e45",
    accentColor: "#5dade2",
    description: "Cast a line in pristine rivers, lakes, and coastlines",
    tips: [
      "A federal fishing license is required in most parks",
      "Many park waters are catch & release only — check local rules",
      "Fly fishing thrives in cold mountain streams like in Yellowstone",
      "Early morning and late evening are prime bite windows",
    ],
    bestSeason: "Spring & Summer",
    photo: require("../assets/images/fishing.jpeg"),
  },
  {
    name: "Wildlife Watching",
    icon: "paw",
    color: "#7d5a0e",
    darkColor: "#4d3808",
    accentColor: "#f0c419",
    description: "Spot bears, wolves, elk, and rare birds in their habitat",
    tips: [
      "Dawn and dusk offer the best wildlife activity windows",
      "Maintain at least 100 yards distance from bears and wolves",
      "Bring binoculars or a spotting scope for safe observation",
      "Move slowly, stay quiet, and position yourself downwind",
    ],
    bestSeason: "Year Round",
    photo: "https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=600&q=80&fit=crop",
  },
  {
    name: "Stargazing",
    icon: "moon",
    color: "#2e1760",
    darkColor: "#180c36",
    accentColor: "#a78bfa",
    description: "Experience the darkest, most stunning skies in North America",
    tips: [
      "Plan visits around new moon phases for the darkest skies",
      "Allow 20–30 minutes for your eyes to fully dark-adapt",
      "Use a red flashlight — it preserves your night vision",
      "International Dark Sky Parks like Cherry Springs offer certified darkness",
    ],
    bestSeason: "Winter & Fall",
    photo: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&q=80&fit=crop",
  },
  {
    name: "Climbing",
    icon: "flag",
    color: "#7b241c",
    darkColor: "#4e1610",
    accentColor: "#f87171",
    description: "Scale granite walls and sandstone towers across the American West",
    tips: [
      "Check for seasonal route closures during raptor nesting season",
      "Yosemite, Zion, and Joshua Tree are world-class destinations",
      "Hire a certified guide for your first multi-pitch routes",
      "Always leave fixed gear in good condition for the next party",
    ],
    bestSeason: "Spring & Fall",
    photo: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=600&q=80&fit=crop",
  },
];
