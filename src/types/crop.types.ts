/**
 * Crops a farmer can record, with the typical days from planting to harvest.
 * These are rule-of-thumb figures for the main growing season; real timing
 * moves with variety, weather and region, which is why the result is shown to
 * farmers as an estimate.
 */
export const CROPS = {
  rice: { label: "Rice (paddy)", days: 120 },
  wheat: { label: "Wheat", days: 130 },
  maize: { label: "Maize", days: 100 },
  tomato: { label: "Tomato", days: 80 },
  potato: { label: "Potato", days: 90 },
  onion: { label: "Onion", days: 120 },
  cabbage: { label: "Cabbage", days: 75 },
  cauliflower: { label: "Cauliflower", days: 90 },
  brinjal: { label: "Brinjal (eggplant)", days: 100 },
  okra: { label: "Okra (lady finger)", days: 55 },
  chilli: { label: "Chilli", days: 110 },
  carrot: { label: "Carrot", days: 80 },
  spinach: { label: "Spinach", days: 40 },
  coriander: { label: "Coriander", days: 45 },
  cucumber: { label: "Cucumber", days: 60 },
  pumpkin: { label: "Pumpkin", days: 100 },
  peas: { label: "Peas", days: 70 },
  radish: { label: "Radish", days: 35 },
  sugarcane: { label: "Sugarcane", days: 365 },
  banana: { label: "Banana", days: 330 },
  mustard: { label: "Mustard", days: 110 },
  groundnut: { label: "Groundnut", days: 110 },
  soybean: { label: "Soybean", days: 100 },
} as const;

export type CropSlug = keyof typeof CROPS;

export const CROP_SLUGS = Object.keys(CROPS) as CropSlug[];

export const isCropSlug = (value: unknown): value is CropSlug =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(CROPS, value);

export const LAND_UNITS = ["acre", "hectare", "bigha"] as const;
export type LandUnit = (typeof LAND_UNITS)[number];

/** Planting date plus the crop's typical days to harvest. */
export const expectedHarvestDate = (crop: CropSlug, plantedOn: Date): Date => {
  const out = new Date(plantedOn);
  out.setUTCDate(out.getUTCDate() + CROPS[crop].days);
  return out;
};
