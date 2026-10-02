/**
 * Which aisle a product sits in. These slugs are the contract with the
 * client's /category/:slug routes and its catalogue config — changing one
 * breaks a URL, so they are declared once here.
 */
export const CATEGORY_SLUGS = {
  FRESH: "livestock-vegetables",
  GROCERY: "grocery",
  FOOD: "food",
  MEDICINE: "medicine",
} as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[keyof typeof CATEGORY_SLUGS];

export const CATEGORY_SLUG_VALUES = Object.values(
  CATEGORY_SLUGS,
) as CategorySlug[];

/**
 * Below this, the client says how few are left rather than just "in stock".
 * Kept in step with LOW_STOCK_THRESHOLD in the client's catalogue.
 */
export const LOW_STOCK_THRESHOLD = 10;
