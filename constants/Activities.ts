export interface ActivitySearchConfig {
  googleTypes: string[];
  keyword: string | null;
  sectionTitle: string;
  emptyMessage: string;
  icon: string;
}

export interface ActivityConfig {
  name: string;
  icon: string;
  color: string;
  darkColor: string;
  accentColor: string;
  description: string;
  tips: string[];
  bestSeason: string;
  photo: string;
  searchConfig: ActivitySearchConfig;
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
      "Break in new boots before hitting the trail",
      "Start early to avoid afternoon heat and storms",
      "Follow Leave No Trace principles",
      "Carry the 10 essentials on every hike",
    ],
    bestSeason: "Spring & Fall",
    photo: "https://images.unsplash.com/photo-1759504744184-fca96a8e99d0?w=600&q=80&fit=crop",
    searchConfig: {
      googleTypes: [],
      keyword: "hiking trails trailhead",
      sectionTitle: "Nearby Hiking Trails",
      emptyMessage: "No hiking trails found nearby",
      icon: "walk",
    },
  },
  {
    name: "Camping",
    icon: "bonfire",
    color: "#744210",
    darkColor: "#4a2c0a",
    accentColor: "#f59e0b",
    description: "Sleep under the stars at iconic campgrounds nationwide",
    tips: [
      "Test your gear at home before the trip",
      "Store food in bear canisters where required",
      "Arrive before dark to set up camp",
      "Check fire restrictions before building a campfire",
    ],
    bestSeason: "Summer & Fall",
    photo: "https://images.unsplash.com/photo-1747763709371-8cf6d91a2623?w=600&q=80&fit=crop",
    searchConfig: {
      googleTypes: ["campground"],
      keyword: null,
      sectionTitle: "Nearby Campgrounds",
      emptyMessage: "No campgrounds found nearby",
      icon: "bonfire",
    },
  },
  {
    name: "Fishing",
    icon: "water",
    color: "#1a5276",
    darkColor: "#0d2e45",
    accentColor: "#5dade2",
    description: "Cast a line in pristine rivers, lakes, and coastlines",
    tips: [
      "Check local regulations and obtain permits",
      "Dawn and dusk are peak feeding times",
      "Match your lure to local baitfish",
      "Practice catch-and-release when possible",
    ],
    bestSeason: "Spring & Summer",
    photo: "https://images.unsplash.com/photo-1724514415178-c87e1d00acd0?w=600&q=80&fit=crop",
    searchConfig: {
      googleTypes: [],
      keyword: "fishing spot bait tackle",
      sectionTitle: "Nearby Fishing Spots",
      emptyMessage: "No fishing spots found nearby",
      icon: "water",
    },
  },
  {
    name: "Golf",
    icon: "golf",
    color: "#166534",
    darkColor: "#0d3d1f",
    accentColor: "#4ade80",
    description: "Find golf courses near parks and scenic destinations",
    tips: [
      "Book tee times in advance, especially on weekends",
      "Check the dress code before arriving at the course",
      "Repair your divots and ball marks on the green",
      "Stay hydrated and wear sunscreen on the course",
    ],
    bestSeason: "Spring & Summer",
    photo: "https://images.unsplash.com/photo-1768396747921-5a18367415d2?w=600&q=80&fit=crop",
    searchConfig: {
      googleTypes: ["golf_course"],
      keyword: null,
      sectionTitle: "Nearby Golf Courses",
      emptyMessage: "No golf courses found nearby",
      icon: "golf",
    },
  },
  {
    name: "Boating & Jet Skiing",
    icon: "boat",
    color: "#0c4a6e",
    darkColor: "#082f49",
    accentColor: "#0ea5e9",
    description: "Hit the water at marinas, lakes, and coastal launches",
    tips: [
      "Always wear a life jacket — it's the law in most states",
      "Check weather and water conditions before heading out",
      "Follow no-wake zones and posted speed limits",
      "File a float plan with someone on shore",
    ],
    bestSeason: "Summer",
    photo: "https://images.unsplash.com/photo-1648484983838-b47185140bee?w=600&q=80&fit=crop",
    searchConfig: {
      googleTypes: ["marina"],
      keyword: "boat rental jet ski",
      sectionTitle: "Nearby Marinas & Boat Rentals",
      emptyMessage: "No marinas found nearby",
      icon: "boat",
    },
  },
  {
    name: "Kayaking",
    icon: "boat",
    color: "#155e75",
    darkColor: "#0c3d4f",
    accentColor: "#38bdf8",
    description: "Paddle crystal-clear rivers, lakes, and coastal waterways",
    tips: [
      "Always wear a PFD (life jacket)",
      "Check water conditions and weather before launch",
      "Learn to self-rescue before going out alone",
      "Dress for the water temperature, not the air",
    ],
    bestSeason: "Summer & Fall",
    photo: "https://images.unsplash.com/photo-1769197047973-265783a7f1f4?w=600&q=80&fit=crop",
    searchConfig: {
      googleTypes: [],
      keyword: "kayak rental canoe paddleboard",
      sectionTitle: "Nearby Kayak & Paddle Rentals",
      emptyMessage: "No kayak rentals found nearby",
      icon: "boat",
    },
  },
  {
    name: "Mountain Biking",
    icon: "bicycle",
    color: "#713f12",
    darkColor: "#451f06",
    accentColor: "#fb923c",
    description: "Shred singletrack through forests, deserts, and mountain passes",
    tips: [
      "Wear a helmet — always, no exceptions",
      "Start with green trails and work up",
      "Yield to hikers and horses on shared trails",
      "Check tire pressure before every ride",
    ],
    bestSeason: "Summer & Fall",
    photo: "https://images.unsplash.com/photo-1677002080216-052df311712c?w=600&q=80&fit=crop",
    searchConfig: {
      googleTypes: [],
      keyword: "mountain bike trails bike park",
      sectionTitle: "Nearby Mountain Bike Trails",
      emptyMessage: "No mountain bike trails found nearby",
      icon: "bicycle",
    },
  },
];
