import type { SAPark } from "@/services/wdpaApi";

export interface CuratedParkData {
  description: string;
  photoUrl: string;
  highlights: string[];
}

/**
 * Hand-curated descriptions, photos, and highlights for featured SA parks.
 * Keyed by park name (must match WDPA or fallback name exactly).
 */
export const CURATED_SA_PARKS: Record<string, CuratedParkData> = {
  // ── Chile ──────────────────────────────────────────────────────────
  "Torres del Paine": {
    description:
      "Patagonia's crown jewel, Torres del Paine protects jagged granite towers, vast glaciers, and turquoise lakes in one of the most dramatic mountain landscapes on Earth.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Torres_del_Paine_-_valle_del_franc%C3%A9s.jpg/1280px-Torres_del_Paine_-_valle_del_franc%C3%A9s.jpg",
    highlights: [
      "The iconic granite Torres (towers) rising over 2,800 m",
      "Grey Glacier and its floating icebergs on Lago Grey",
      "Multi-day W Trek through valleys, lakes, and forests",
    ],
  },
  Lauca: {
    description:
      "Perched above 4,000 m in Chile's far north, Lauca National Park shelters high-altitude wetlands, snow-capped volcanoes, and some of the world's highest lakes.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Lago_Chungar%C3%A1_and_Volcan_Parinacota.jpg/1280px-Lago_Chungar%C3%A1_and_Volcan_Parinacota.jpg",
    highlights: [
      "Lago Chungara at 4,517 m with Parinacota volcano backdrop",
      "Wild vicuna herds grazing across the altiplano",
      "Andean flamingos nesting on bofedal wetlands",
    ],
  },
  "Vicente Perez Rosales": {
    description:
      "Chile's oldest national park wraps around the emerald waters of Lago Todos los Santos, with the near-perfect cone of Volcan Osorno dominating the skyline.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Volc%C3%A1n_Osorno_from_Lago_Todos_los_Santos.jpg/1280px-Volc%C3%A1n_Osorno_from_Lago_Todos_los_Santos.jpg",
    highlights: [
      "Petrohue Falls cascading over volcanic basalt",
      "Volcan Osorno's snow-capped summit and ski slopes",
      "Lago Todos los Santos boat crossings through Valdivian rainforest",
    ],
  },

  // ── Argentina ──────────────────────────────────────────────────────
  "Los Glaciares": {
    description:
      "Home to the Perito Moreno Glacier and the granite spires of Mount Fitz Roy, Los Glaciares is a UNESCO World Heritage Site spanning the Southern Patagonian Ice Field.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Perito_Moreno_Glacier_Patagonia_Argentina_Luca_Galuzzi_2005.JPG/1280px-Perito_Moreno_Glacier_Patagonia_Argentina_Luca_Galuzzi_2005.JPG",
    highlights: [
      "Perito Moreno Glacier calving massive icebergs into Lago Argentino",
      "Mount Fitz Roy's legendary granite spires at sunrise",
      "Boat excursions past Upsala and Spegazzini glaciers",
    ],
  },
  "Nahuel Huapi": {
    description:
      "Argentina's first national park, Nahuel Huapi encompasses a vast glacial lake framed by Andean peaks and dense Patagonian forests in the Lake District.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Nahuel_Huapi_National_Park_Lago_Nahuel_Huapi.jpg/1280px-Nahuel_Huapi_National_Park_Lago_Nahuel_Huapi.jpg",
    highlights: [
      "Cerro Tronador glacier hike with thundering ice avalanches",
      "Circuito Chico scenic drive along the lakeshore",
      "Arrayanes Forest of cinnamon-barked myrtle trees on Victoria Island",
    ],
  },
  Iguazu: {
    description:
      "The Argentine side of Iguazu Falls offers walkways directly above 275 cascades, including the thundering Devil's Throat where mist and rainbows engulf visitors.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Iguazu_D%C3%A9cembre_2007_-_Panorama_3.jpg/1280px-Iguazu_D%C3%A9cembre_2007_-_Panorama_3.jpg",
    highlights: [
      "Devil's Throat catwalk over the widest curtain of water",
      "Subtropical Atlantic Forest teeming with toucans and coatis",
      "Zodiac boat rides into the base of the falls",
    ],
  },

  // ── Peru ────────────────────────────────────────────────────────────
  Huascaran: {
    description:
      "Peru's highest peak and the world's tallest tropical mountain anchor this UNESCO Biosphere Reserve in the Cordillera Blanca, filled with turquoise glacial lakes.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Laguna_69%2C_Parque_Nacional_Huascar%C3%A1n.jpg/1280px-Laguna_69%2C_Parque_Nacional_Huascar%C3%A1n.jpg",
    highlights: [
      "Laguna 69 day hike to a vivid turquoise glacial lake",
      "Santa Cruz Trek through high-altitude valleys and passes",
      "Pastoruri Glacier accessible on a moderate day trip",
    ],
  },
  Manu: {
    description:
      "Spanning from Andean cloud forests down to lowland Amazon jungle, Manu is one of the most biodiverse places on Earth with over 1,000 bird species recorded.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Manu_National_Park-70.jpg/1280px-Manu_National_Park-70.jpg",
    highlights: [
      "Macaw clay licks where hundreds of parrots gather at dawn",
      "Giant otters in oxbow lakes of the lowland zone",
      "Mixed flocks of tanagers and antbirds in cloud forest canopy",
    ],
  },

  // ── Colombia ────────────────────────────────────────────────────────
  Tayrona: {
    description:
      "Where the Sierra Nevada de Santa Marta plunges into the Caribbean, Tayrona protects pristine beaches backed by tropical forest and ancient Tairona ruins.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Parque_Tayrona_-_Colombia_%2842%29.JPG/1280px-Parque_Tayrona_-_Colombia_%2842%29.JPG",
    highlights: [
      "Cabo San Juan beach with clifftop hammock camping",
      "Pueblito archaeological site of the ancient Tairona civilization",
      "Snorkeling in crystal-clear Caribbean coves",
    ],
  },
  "El Cocuy": {
    description:
      "Colombia's premier high-mountain destination, El Cocuy features a dramatic chain of snow-capped peaks, glacial lakes, and rocky moraines above 4,500 m.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/PNN_El_Cocuy.jpg/1280px-PNN_El_Cocuy.jpg",
    highlights: [
      "Pulpito del Diablo rock formation towering above the glacier",
      "Laguna Grande de la Sierra ringed by snowfields",
      "Multi-day trek along the Sierra Nevada del Cocuy ridge",
    ],
  },

  // ── Ecuador ─────────────────────────────────────────────────────────
  Galapagos: {
    description:
      "The volcanic archipelago that inspired Darwin's theory of evolution, the Galapagos Islands host fearless wildlife found nowhere else, from marine iguanas to blue-footed boobies.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Gal%C3%A1pagos_Inseln_Karte.png/1280px-Gal%C3%A1pagos_Inseln_Karte.png",
    highlights: [
      "Giant tortoise breeding centers on Santa Cruz and Isabela",
      "Snorkeling with sea lions, penguins, and hammerhead sharks",
      "Blue-footed booby courtship dances on North Seymour Island",
    ],
  },
  Cotopaxi: {
    description:
      "Dominated by the near-perfect snowcapped cone of Cotopaxi volcano at 5,897 m, this park offers high-altitude hiking, wild horses, and Andean condors on the paramo grasslands.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Cotopaxi_volcano_2008-06-27T1322.jpg/1280px-Cotopaxi_volcano_2008-06-27T1322.jpg",
    highlights: [
      "Summit attempt on one of the world's highest active volcanoes",
      "Laguna de Limpiopungo with volcano reflections at dawn",
      "Wild horse herds roaming the paramo grasslands",
    ],
  },

  // ── Brazil ──────────────────────────────────────────────────────────
  "Chapada Diamantina": {
    description:
      "A sprawling table-mountain wilderness in Bahia's interior, Chapada Diamantina hides underground rivers, towering waterfalls, and blue-water caverns amid cerrado savanna.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Poco_Azul_Chapada_Diamantina.jpg/1280px-Poco_Azul_Chapada_Diamantina.jpg",
    highlights: [
      "Poco Azul underground cave pool lit by morning sunbeams",
      "Cachoeira da Fumaca, Brazil's tallest waterfall at 340 m",
      "Vale do Pati multi-day trek through remote plateaus and valleys",
    ],
  },
  "Lencois Maranhenses": {
    description:
      "A surreal landscape of vast white sand dunes interspersed with thousands of seasonal rainwater lagoons that glow brilliant blue and green from January to September.",
    photoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Len%C3%A7%C3%B3is_Maranhenses%2C_Maranh%C3%A3o.jpg/1280px-Len%C3%A7%C3%B3is_Maranhenses%2C_Maranh%C3%A3o.jpg",
    highlights: [
      "Swimming in crystal-clear freshwater lagoons between dunes",
      "Lagoa Azul and Lagoa Bonita, the park's most photogenic pools",
      "4WD and trekking expeditions across 155,000 hectares of dunes",
    ],
  },
};

/**
 * Fallback park list used when the WDPA API is unreachable.
 * ~20 curated entries across Chile, Argentina, Peru, Colombia, Ecuador, and Brazil.
 */
export const FALLBACK_SA_PARKS: SAPark[] = [
  // ── Chile ──────────────────────────────────────────────────────────
  {
    id: "sa_001",
    name: "Torres del Paine",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 2422,
    country: "Chile",
    countryISO3: "CHL",
    latitude: -51.0,
    longitude: -73.1,
    managementAuthority: "CONAF",
    link: "",
  },
  {
    id: "sa_002",
    name: "Lauca",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 1379,
    country: "Chile",
    countryISO3: "CHL",
    latitude: -18.2,
    longitude: -69.3,
    managementAuthority: "CONAF",
    link: "",
  },
  {
    id: "sa_003",
    name: "Vicente Perez Rosales",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 2536,
    country: "Chile",
    countryISO3: "CHL",
    latitude: -41.1,
    longitude: -72.0,
    managementAuthority: "CONAF",
    link: "",
  },
  {
    id: "sa_004",
    name: "Pan de Azucar",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 438,
    country: "Chile",
    countryISO3: "CHL",
    latitude: -26.1,
    longitude: -70.6,
    managementAuthority: "CONAF",
    link: "",
  },

  // ── Argentina ──────────────────────────────────────────────────────
  {
    id: "sa_005",
    name: "Los Glaciares",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 7269,
    country: "Argentina",
    countryISO3: "ARG",
    latitude: -49.3,
    longitude: -73.0,
    managementAuthority: "APN",
    link: "",
  },
  {
    id: "sa_006",
    name: "Nahuel Huapi",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 7171,
    country: "Argentina",
    countryISO3: "ARG",
    latitude: -41.1,
    longitude: -71.3,
    managementAuthority: "APN",
    link: "",
  },
  {
    id: "sa_007",
    name: "Iguazu",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 677,
    country: "Argentina",
    countryISO3: "ARG",
    latitude: -25.7,
    longitude: -54.4,
    managementAuthority: "APN",
    link: "",
  },
  {
    id: "sa_008",
    name: "Talampaya",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 2138,
    country: "Argentina",
    countryISO3: "ARG",
    latitude: -29.8,
    longitude: -68.0,
    managementAuthority: "APN",
    link: "",
  },

  // ── Peru ────────────────────────────────────────────────────────────
  {
    id: "sa_009",
    name: "Huascaran",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 3400,
    country: "Peru",
    countryISO3: "PER",
    latitude: -9.2,
    longitude: -77.6,
    managementAuthority: "SERNANP",
    link: "",
  },
  {
    id: "sa_010",
    name: "Manu",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 17163,
    country: "Peru",
    countryISO3: "PER",
    latitude: -12.0,
    longitude: -71.5,
    managementAuthority: "SERNANP",
    link: "",
  },
  {
    id: "sa_011",
    name: "Machu Picchu Historical Sanctuary",
    designation: "Historical Sanctuary",
    iucnCategory: "III",
    areaKm2: 326,
    country: "Peru",
    countryISO3: "PER",
    latitude: -13.2,
    longitude: -72.5,
    managementAuthority: "SERNANP",
    link: "",
  },

  // ── Colombia ────────────────────────────────────────────────────────
  {
    id: "sa_012",
    name: "Tayrona",
    designation: "National Natural Park",
    iucnCategory: "II",
    areaKm2: 150,
    country: "Colombia",
    countryISO3: "COL",
    latitude: 11.3,
    longitude: -74.0,
    managementAuthority: "PNN",
    link: "",
  },
  {
    id: "sa_013",
    name: "El Cocuy",
    designation: "National Natural Park",
    iucnCategory: "II",
    areaKm2: 3060,
    country: "Colombia",
    countryISO3: "COL",
    latitude: 6.4,
    longitude: -72.3,
    managementAuthority: "PNN",
    link: "",
  },
  {
    id: "sa_014",
    name: "Los Nevados",
    designation: "National Natural Park",
    iucnCategory: "II",
    areaKm2: 583,
    country: "Colombia",
    countryISO3: "COL",
    latitude: 4.8,
    longitude: -75.4,
    managementAuthority: "PNN",
    link: "",
  },

  // ── Ecuador ─────────────────────────────────────────────────────────
  {
    id: "sa_015",
    name: "Galapagos",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 7995,
    country: "Ecuador",
    countryISO3: "ECU",
    latitude: -0.8,
    longitude: -91.1,
    managementAuthority: "DPNG",
    link: "",
  },
  {
    id: "sa_016",
    name: "Cotopaxi",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 334,
    country: "Ecuador",
    countryISO3: "ECU",
    latitude: -0.7,
    longitude: -78.4,
    managementAuthority: "MAE",
    link: "",
  },
  {
    id: "sa_017",
    name: "Yasuni",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 9820,
    country: "Ecuador",
    countryISO3: "ECU",
    latitude: -1.0,
    longitude: -75.9,
    managementAuthority: "MAE",
    link: "",
  },

  // ── Brazil ──────────────────────────────────────────────────────────
  {
    id: "sa_018",
    name: "Chapada Diamantina",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 1524,
    country: "Brazil",
    countryISO3: "BRA",
    latitude: -12.6,
    longitude: -41.4,
    managementAuthority: "ICMBio",
    link: "",
  },
  {
    id: "sa_019",
    name: "Lencois Maranhenses",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 1550,
    country: "Brazil",
    countryISO3: "BRA",
    latitude: -2.5,
    longitude: -43.1,
    managementAuthority: "ICMBio",
    link: "",
  },
  {
    id: "sa_020",
    name: "Iguacu",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 1852,
    country: "Brazil",
    countryISO3: "BRA",
    latitude: -25.6,
    longitude: -54.3,
    managementAuthority: "ICMBio",
    link: "",
  },
  {
    id: "sa_021",
    name: "Aparados da Serra",
    designation: "National Park",
    iucnCategory: "II",
    areaKm2: 102,
    country: "Brazil",
    countryISO3: "BRA",
    latitude: -29.2,
    longitude: -50.1,
    managementAuthority: "ICMBio",
    link: "",
  },
];
