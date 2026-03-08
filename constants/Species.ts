export interface SpeciesCategory {
  id: string;
  label: string;
  emoji: string;
  icon: string;
  color: string;
  species: string[];
}

export const SPECIES_CATEGORIES: SpeciesCategory[] = [
  {
    id: "bird",
    label: "Bird",
    emoji: "🦅",
    icon: "feather",
    color: "#1a6b9a",
    species: [
      "Bald Eagle", "Red-tailed Hawk", "Great Horned Owl", "Peregrine Falcon",
      "Wild Turkey", "Canada Goose", "Great Blue Heron", "Sandhill Crane",
      "American Robin", "Steller's Jay", "Clark's Nutcracker", "Osprey",
      "Common Raven", "White-tailed Ptarmigan", "Belted Kingfisher",
      "American Kestrel", "Great Egret", "Wood Duck", "Pileated Woodpecker",
      "Northern Harrier", "Snowy Owl", "Trumpeter Swan", "Other Bird",
    ],
  },
  {
    id: "mammal",
    label: "Mammal",
    emoji: "🦌",
    icon: "paw",
    color: "#7d5a0e",
    species: [
      "White-tailed Deer", "Mule Deer", "Elk (Wapiti)", "Moose",
      "Pronghorn", "Bison (American Buffalo)", "Mountain Goat", "Bighorn Sheep",
      "Black Bear", "Grizzly Bear", "Mountain Lion (Cougar)", "Gray Wolf",
      "Coyote", "Red Fox", "River Otter", "American Beaver",
      "Muskrat", "Porcupine", "Raccoon", "Striped Skunk",
      "Virginia Opossum", "Bobcat", "Lynx", "Wolverine",
      "American Marten", "Mink", "Long-tailed Weasel", "Other Mammal",
    ],
  },
  {
    id: "reptile",
    label: "Reptile",
    emoji: "🦎",
    icon: "bug",
    color: "#4a7c59",
    species: [
      "Common Garter Snake", "Western Rattlesnake", "Copperhead", "Eastern Diamondback",
      "Bull Snake", "King Snake", "Corn Snake", "Water Moccasin (Cottonmouth)",
      "Western Fence Lizard", "Collared Lizard", "Gila Monster", "Common Snapping Turtle",
      "Box Turtle", "Painted Turtle", "Loggerhead Sea Turtle", "American Alligator",
      "Common Skink", "Horned Lizard", "Other Reptile",
    ],
  },
  {
    id: "amphibian",
    label: "Amphibian",
    emoji: "🐸",
    icon: "water",
    color: "#2d7a4f",
    species: [
      "American Bullfrog", "Green Frog", "Pacific Tree Frog", "Wood Frog",
      "Spring Peeper", "American Toad", "Spotted Salamander", "Red-backed Salamander",
      "Tiger Salamander", "Mudpuppy", "Eastern Newt", "Rough-skinned Newt",
      "Chorus Frog", "Gray Tree Frog", "Other Amphibian",
    ],
  },
  {
    id: "fish",
    label: "Fish",
    emoji: "🐟",
    icon: "fish",
    color: "#1a5276",
    species: [
      "Rainbow Trout", "Brown Trout", "Brook Trout", "Lake Trout",
      "Chinook Salmon", "Coho Salmon", "Sockeye Salmon", "Atlantic Salmon",
      "Largemouth Bass", "Smallmouth Bass", "Striped Bass", "Channel Catfish",
      "Northern Pike", "Walleye", "Bluegill", "Crappie",
      "Common Carp", "Other Fish",
    ],
  },
  {
    id: "insect",
    label: "Insect & Invertebrate",
    emoji: "🦋",
    icon: "leaf",
    color: "#805ad5",
    species: [
      "Monarch Butterfly", "Eastern Tiger Swallowtail", "Black Swallowtail",
      "Painted Lady", "Red Admiral", "Common Buckeye", "Viceroy",
      "Luna Moth", "Cecropia Moth", "American Lady", "Firefly (Lightning Bug)",
      "Dragonfly", "Damselfly", "Praying Mantis", "Walking Stick",
      "American Bumble Bee", "Honeybee", "Bald-faced Hornet",
      "Tarantula", "Black Widow Spider", "Other Insect/Invertebrate",
    ],
  },
  {
    id: "plant",
    label: "Rare Plant",
    emoji: "🌿",
    icon: "leaf-outline",
    color: "#276221",
    species: [
      "Saguaro Cactus", "Joshua Tree", "Giant Sequoia", "Coast Redwood",
      "Pitcher Plant", "Venus Flytrap", "Sundew", "Lady's Slipper Orchid",
      "Trillium", "Columbine", "Indian Paintbrush", "Bluebonnet",
      "California Poppy", "Shooting Star", "Other Rare Plant",
    ],
  },
  {
    id: "other",
    label: "Other Wildlife",
    emoji: "🔭",
    icon: "telescope",
    color: "#555555",
    species: ["Other Wildlife"],
  },
];

export function getCategoryById(id: string): SpeciesCategory | undefined {
  return SPECIES_CATEGORIES.find((c) => c.id === id);
}
