import { CATEGORY_SLUGS, CategorySlug } from "./catalog.types";

/**
 * What kind of business a merchant runs, chosen at signup. It decides what
 * they may list: a restaurant lists kitchens (the Food aisle), a vegetable
 * vendor lists fresh produce, and so on. The values are the wire contract
 * with the merchant app's signup picker.
 */
export const MERCHANT_TYPES = {
  VEGETABLE_VENDOR: "vegetable-vendor",
  MEAT_FISH_SHOP: "meat-fish-shop",
  RESTAURANT: "restaurant",
  GROCERY_STORE: "grocery-store",
  PHARMACY: "pharmacy",
  // Existing merchants, and shops that sell across aisles.
  GENERAL_STORE: "general-store",
} as const;

export type MerchantType = (typeof MERCHANT_TYPES)[keyof typeof MERCHANT_TYPES];

export const MERCHANT_TYPE_VALUES = Object.values(MERCHANT_TYPES) as MerchantType[];

/** Product aisles each type may list in. Restaurants list kitchens, not products. */
export const PRODUCT_CATEGORIES_BY_TYPE: Record<MerchantType, CategorySlug[]> = {
  "vegetable-vendor": [CATEGORY_SLUGS.FRESH],
  "meat-fish-shop": [CATEGORY_SLUGS.FRESH],
  restaurant: [],
  "grocery-store": [CATEGORY_SLUGS.GROCERY],
  pharmacy: [CATEGORY_SLUGS.MEDICINE],
  "general-store": [CATEGORY_SLUGS.FRESH, CATEGORY_SLUGS.GROCERY, CATEGORY_SLUGS.MEDICINE],
};

export const isMerchantType = (value: unknown): value is MerchantType =>
  typeof value === "string" && MERCHANT_TYPE_VALUES.includes(value as MerchantType);

/** A non-empty list of known types, without repeats. */
export const parseMerchantTypes = (value: unknown): MerchantType[] | null => {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isMerchantType)) {
    return null;
  }
  return [...new Set(value)];
};

/** Narrows what the database returns (plain strings) to known types. */
export const knownMerchantTypes = (value: unknown): MerchantType[] =>
  Array.isArray(value) ? value.filter(isMerchantType) : [];

/** Every aisle open to a merchant running these types. */
export const allowedCategories = (types: MerchantType[]): CategorySlug[] => [
  ...new Set(types.flatMap((t) => PRODUCT_CATEGORIES_BY_TYPE[t])),
];

export const canListCategory = (types: MerchantType[], category: string): boolean =>
  allowedCategories(types).includes(category as CategorySlug);

export const canRunKitchen = (types: MerchantType[]): boolean =>
  types.includes(MERCHANT_TYPES.RESTAURANT);
