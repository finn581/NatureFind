// constants/OfflineRegions.ts

export interface OfflineRegionDef {
  id: string;
  name: string;
  country: string;
  countryFlag: string;
  bounds: { sw: [number, number]; ne: [number, number] }; // [lng, lat]
  minZoom: number;
  maxZoom: number;
  estimatedSizeMB: number;
}

export const OFFLINE_REGIONS: OfflineRegionDef[] = [
  {
    id: "tdp_patagonia_south",
    name: "Torres del Paine & Patagonia South",
    country: "Chile",
    countryFlag: "\u{1F1E8}\u{1F1F1}",
    bounds: { sw: [-75.0, -52.5], ne: [-70.0, -50.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 120,
  },
  {
    id: "fitz_roy_glaciares",
    name: "Fitz Roy & Los Glaciares",
    country: "Argentina",
    countryFlag: "\u{1F1E6}\u{1F1F7}",
    bounds: { sw: [-73.5, -50.5], ne: [-72.0, -49.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 80,
  },
  {
    id: "cusco_inca_trail",
    name: "Cusco, Sacred Valley & Inca Trail",
    country: "Peru",
    countryFlag: "\u{1F1F5}\u{1F1EA}",
    bounds: { sw: [-73.0, -14.0], ne: [-71.5, -13.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 70,
  },
  {
    id: "cordillera_blanca",
    name: "Cordillera Blanca & Huayhuash",
    country: "Peru",
    countryFlag: "\u{1F1F5}\u{1F1EA}",
    bounds: { sw: [-78.0, -10.5], ne: [-76.5, -8.5] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 75,
  },
  {
    id: "atacama",
    name: "Atacama Desert",
    country: "Chile",
    countryFlag: "\u{1F1E8}\u{1F1F1}",
    bounds: { sw: [-69.5, -24.5], ne: [-67.5, -22.5] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 60,
  },
  {
    id: "ciudad_perdida",
    name: "Ciudad Perdida & Sierra Nevada",
    country: "Colombia",
    countryFlag: "\u{1F1E8}\u{1F1F4}",
    bounds: { sw: [-74.5, 10.5], ne: [-73.0, 11.5] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 70,
  },
  {
    id: "cocora_coffee",
    name: "Cocora Valley & Coffee Region",
    country: "Colombia",
    countryFlag: "\u{1F1E8}\u{1F1F4}",
    bounds: { sw: [-76.0, 4.2], ne: [-75.0, 5.2] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 55,
  },
  {
    id: "galapagos",
    name: "Galapagos Islands",
    country: "Ecuador",
    countryFlag: "\u{1F1EA}\u{1F1E8}",
    bounds: { sw: [-92.0, -1.5], ne: [-89.0, 0.8] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 40,
  },
  {
    id: "cotopaxi_volcanoes",
    name: "Cotopaxi & Avenue of Volcanoes",
    country: "Ecuador",
    countryFlag: "\u{1F1EA}\u{1F1E8}",
    bounds: { sw: [-79.0, -1.5], ne: [-78.0, 0.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 65,
  },
  {
    id: "chapada_diamantina",
    name: "Chapada Diamantina",
    country: "Brazil",
    countryFlag: "\u{1F1E7}\u{1F1F7}",
    bounds: { sw: [-42.0, -13.3], ne: [-40.8, -12.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 70,
  },
  {
    id: "iguazu_atlantic",
    name: "Iguazu & Atlantic Forest",
    country: "Brazil",
    countryFlag: "\u{1F1E7}\u{1F1F7}",
    bounds: { sw: [-55.0, -26.0], ne: [-53.5, -25.0] },
    minZoom: 8,
    maxZoom: 15,
    estimatedSizeMB: 55,
  },
];
