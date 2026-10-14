import type { Prisma } from "../generated/prisma/client";
import {
  CATEGORY_SLUGS,
  CATEGORY_SLUG_VALUES,
  CategorySlug,
  LOW_STOCK_THRESHOLD,
} from "../types/catalog.types";

/** Variants come back in the order the merchant listed them. */
export const PRODUCT_INCLUDE = {
  variants: { orderBy: { position: "asc" } },
} satisfies Prisma.ProductInclude;

export type ProductWithVariants = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_INCLUDE;
}>;

export type RestaurantRow = Prisma.RestaurantGetPayload<object>;

/** One sellable size of a product sold by weight or count. */
export interface ProductVariantInput {
  /** Stable within a product, e.g. "500g", "whole". */
  variantId: string;
  /** What the shopper picks, e.g. "500 g, cut". */
  label: string;
  price: number;
  stockCount: number;
}

/**
 * Wire shape for a product.
 *
 * Deliberately mirrors the client's catalogue types, including `id` rather
 * than the row id and `variantId` flattened to `id`: the category pages
 * already read that shape from their mock data, so swapping them onto the API
 * is an import change rather than a rewrite. Database internals stay
 * server-side.
 */
export interface ProductDto {
  id: string;
  name: string;
  image: string;
  category: CategorySlug;
  subCategory: string;
  variants?: { id: string; label: string; price: number; stockCount: number }[];
  price?: number;
  stockCount?: number;
  pack?: string;
  origin?: string;
  useFor?: string;
  requiresPrescription?: boolean;
  /** False once retired or hidden by its merchant. Public lists never include these. */
  isActive: boolean;
  /** Derived server-side so every client agrees on what sold out means. */
  totalStock: number;
  isSoldOut: boolean;
  isLowStock: boolean;
  /** Has stock to sell. The inverse of `isSoldOut`, named for the catalog filter. */
  isAvailable: boolean;
}

/** Stock on hand, summed across variants when the product has them. */
export const totalStock = (product: ProductWithVariants): number =>
  product.variants.length > 0
    ? product.variants.reduce((sum, v) => sum + v.stockCount, 0)
    : (product.stockCount ?? 0);

export const isSoldOut = (product: ProductWithVariants): boolean =>
  totalStock(product) === 0;

export const toProductDto = (product: ProductWithVariants): ProductDto => {
  const total = totalStock(product);

  return {
    id: product.productId,
    name: product.name,
    image: product.image,
    category: product.category as CategorySlug,
    subCategory: product.subCategory,
    ...(product.variants.length > 0
      ? {
          variants: product.variants.map((v) => ({
            id: v.variantId,
            label: v.label,
            price: Number(v.price),
            stockCount: v.stockCount,
          })),
        }
      : {
          price: product.price === null ? undefined : Number(product.price),
          stockCount: product.stockCount ?? undefined,
        }),
    ...(product.pack ? { pack: product.pack } : {}),
    ...(product.origin ? { origin: product.origin } : {}),
    ...(product.useFor ? { useFor: product.useFor } : {}),
    ...(product.requiresPrescription ? { requiresPrescription: true } : {}),
    isActive: product.isActive,
    totalStock: total,
    isSoldOut: total === 0,
    isLowStock: total > 0 && total <= LOW_STOCK_THRESHOLD,
    isAvailable: total > 0,
  };
};

export interface RestaurantDto {
  id: string;
  name: string;
  image: string;
  cuisine: string;
  rating: number;
  ratingCount: number;
  prepMinutes: number;
  priceForTwo: number;
  isOpen: boolean;
  signatureDishes: string[];
}

export const toRestaurantDto = (r: RestaurantRow): RestaurantDto => ({
  id: r.restaurantId,
  name: r.name,
  image: r.image,
  cuisine: r.cuisine,
  rating: Number(r.rating),
  ratingCount: r.ratingCount,
  prepMinutes: r.prepMinutes,
  priceForTwo: Number(r.priceForTwo),
  isOpen: r.isOpen,
  signatureDishes: r.signatureDishes,
});

export const isCategorySlug = (value: unknown): value is CategorySlug =>
  typeof value === "string" &&
  CATEGORY_SLUG_VALUES.includes(value as CategorySlug);

export interface ProductQuery {
  category?: string;
  subCategory?: string;
  /** "true" hides anything with no stock left. */
  inStock?: string;
  /** Case-insensitive substring match on the name. */
  search?: string;
}

/**
 * Turns query-string parameters into a Prisma filter.
 *
 * Only ever reads a fixed set of keys. Spreading `req.query` straight into a
 * filter would let a caller reach columns the route never meant to expose.
 */
export const buildProductFilter = (
  query: ProductQuery,
): Prisma.ProductWhereInput => {
  const filter: Prisma.ProductWhereInput = { isActive: true };

  if (isCategorySlug(query.category)) {
    filter.category = query.category;
  }
  if (typeof query.subCategory === "string" && query.subCategory.trim()) {
    filter.subCategory = query.subCategory.trim();
  }
  if (typeof query.search === "string" && query.search.trim()) {
    filter.name = { contains: query.search.trim(), mode: "insensitive" };
  }

  return filter;
};

/**
 * Drops sold-out products after the query.
 *
 * Done here rather than in SQL because stock lives in two shapes — a
 * top-level count or a sum across variants — and expressing that as one
 * query means an aggregation for what is a cheap pass over a page of rows.
 */
export const applyStockFilter = (
  products: ProductWithVariants[],
  inStock?: string,
): ProductWithVariants[] =>
  inStock === "true" ? products.filter((p) => !isSoldOut(p)) : products;

/**
 * How the catalog treats stock.
 *
 * - `preview`: no stock has been connected yet (fresh seed). Every product is
 *   listed, and clients do not show a stock status.
 * - `live`: stock has been connected from the warehouse or a merchant. Only
 *   available products are listed, and clients show their stock status.
 *
 * `CATALOG_STOCK_MODE` forces one for a deployment; the default `auto` goes
 * live as soon as any product has stock.
 */
export type CatalogMode = "preview" | "live";

export const resolveCatalogMode = (
  anyStocked: boolean,
  override = process.env.CATALOG_STOCK_MODE,
): CatalogMode => {
  if (override === "preview" || override === "live") return override;
  return anyStocked ? "live" : "preview";
};

/** True if any product, or any size of one, has stock. */
export const hasAnyStock = async (
  db: Pick<typeof import("../config/prisma").default, "product" | "productVariant">,
): Promise<boolean> => {
  const [fixed, sized] = await Promise.all([
    db.product.findFirst({
      where: { isActive: true, stockCount: { gt: 0 } },
      select: { id: true },
    }),
    db.productVariant.findFirst({
      where: { stockCount: { gt: 0 }, product: { isActive: true } },
      select: { id: true },
    }),
  ]);
  return Boolean(fixed || sized);
};

/** Fields a caller may set on a product. Anything else is ignored. */
export const WRITABLE_PRODUCT_FIELDS = [
  "name",
  "image",
  "category",
  "subCategory",
  "price",
  "stockCount",
  "pack",
  "origin",
  "useFor",
  "requiresPrescription",
  "isActive",
] as const;

export const WRITABLE_RESTAURANT_FIELDS = [
  "name",
  "image",
  "cuisine",
  "rating",
  "ratingCount",
  "prepMinutes",
  "priceForTwo",
  "isOpen",
  "signatureDishes",
  "isActive",
] as const;

/** Strings are trimmed on the way in, as the old schema's `trim` did. */
const clean = (value: unknown): unknown =>
  typeof value === "string"
    ? value.trim()
    : Array.isArray(value)
      ? value.map(clean)
      : value;

const pick = (
  body: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const field of allowed) {
    if (body[field] !== undefined) picked[field] = clean(body[field]);
  }
  return picked;
};

/**
 * Copies only writable fields off a request body.
 *
 * An allowlist, not a denylist: `merchant` and `productId` must never be
 * settable by a caller, or one merchant could reassign another's stock.
 * Variants are not here — they go through `normaliseVariants`.
 */
export const pickProductFields = (
  body: Record<string, unknown>,
): Record<string, unknown> => pick(body, WRITABLE_PRODUCT_FIELDS);

export const pickRestaurantFields = (
  body: Record<string, unknown>,
): Record<string, unknown> => pick(body, WRITABLE_RESTAURANT_FIELDS);

/** Normalises client variants (`id`) to the stored shape (`variantId`). */
export const normaliseVariants = (
  variants: unknown,
): ProductVariantInput[] | undefined => {
  if (!Array.isArray(variants)) return undefined;
  return variants.map((v) => ({
    variantId: String(v.variantId ?? v.id ?? "").trim(),
    label: String(v.label ?? "").trim(),
    price: Number(v.price),
    stockCount: Number(v.stockCount ?? 0),
  }));
};

/** Nested-create input for a product's variants, in the order given. */
export const variantRows = (variants: ProductVariantInput[]) =>
  variants.map((v, position) => ({ ...v, position }));

/** A product as it would stand after a write, whether new or merged. */
export interface ProductCandidate {
  productId: string;
  name?: unknown;
  image?: unknown;
  category?: unknown;
  subCategory?: unknown;
  variants?: ProductVariantInput[];
  price?: unknown;
  stockCount?: unknown;
  requiresPrescription?: unknown;
}

const isBlank = (v: unknown): boolean =>
  typeof v !== "string" || v.trim() === "";

const isNonNegative = (v: unknown): boolean =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Everything a product must satisfy before it is written: the field rules the
 * old Mongoose schema carried, plus the cross-field rules its pre-validate
 * hooks enforced. Returns the first problem, or undefined if it is fine.
 *
 * The Rx-only-in-medicine rule and the non-negative checks also exist as
 * CHECK constraints, as a backstop for writes that skip this (the seeder, a
 * psql session). The variants-or-price rule spans two tables, so this is the
 * only place it is enforced.
 */
export const validateProduct = (
  product: ProductCandidate,
): string | undefined => {
  const id = product.productId || "product";
  const variants = product.variants ?? [];
  const hasVariants = variants.length > 0;
  const hasFixedPrice = product.price !== undefined && product.price !== null;

  if (isBlank(product.name)) return "Please add a name";
  if (isBlank(product.image)) return "Please add an image";
  if (!isCategorySlug(product.category)) {
    return `category must be one of: ${CATEGORY_SLUG_VALUES.join(", ")}`;
  }
  if (isBlank(product.subCategory)) return "subCategory is required";

  if (hasVariants && hasFixedPrice) {
    return `A product has either variants or a fixed price, not both. Got both on "${id}".`;
  }
  if (!hasVariants && !hasFixedPrice) {
    return `"${id}" needs either variants, or a price with stockCount.`;
  }
  if (hasFixedPrice) {
    if (!isNonNegative(product.price)) return "price must be 0 or more";
    if (
      product.stockCount !== undefined &&
      product.stockCount !== null &&
      !(Number.isInteger(product.stockCount) && isNonNegative(product.stockCount))
    ) {
      return "stockCount must be a whole number, 0 or more";
    }
  }
  if (hasVariants) {
    for (const v of variants) {
      if (!v.variantId || !v.label) return "Each variant needs an id and a label";
      if (!isNonNegative(v.price)) return `Variant "${v.variantId}": price must be 0 or more`;
      if (!Number.isInteger(v.stockCount) || v.stockCount < 0) {
        return `Variant "${v.variantId}": stockCount must be a whole number, 0 or more`;
      }
    }
    const ids = variants.map((v) => v.variantId);
    if (new Set(ids).size !== ids.length) {
      return `Duplicate variantId on "${id}": ${ids.join(", ")}`;
    }
  }
  if (
    product.requiresPrescription &&
    product.category !== CATEGORY_SLUGS.MEDICINE
  ) {
    return "Only medicine products may require a prescription";
  }
  return undefined;
};

/** A restaurant as it would stand after a write. */
export interface RestaurantCandidate {
  restaurantId: string;
  name?: unknown;
  image?: unknown;
  cuisine?: unknown;
  rating?: unknown;
  ratingCount?: unknown;
  prepMinutes?: unknown;
  priceForTwo?: unknown;
}

export const validateRestaurant = (
  r: RestaurantCandidate,
): string | undefined => {
  if (isBlank(r.name)) return "Please add a name";
  if (isBlank(r.image)) return "Please add an image";
  if (isBlank(r.cuisine)) return "cuisine is required";
  // Bounded so a bad write cannot render five-and-a-half stars.
  if (!isNonNegative(r.rating) || (r.rating as number) > 5) {
    return "rating must be between 0 and 5";
  }
  if (r.ratingCount !== undefined && !(Number.isInteger(r.ratingCount) && isNonNegative(r.ratingCount))) {
    return "ratingCount must be a whole number, 0 or more";
  }
  if (!(Number.isInteger(r.prepMinutes) && isNonNegative(r.prepMinutes))) {
    return "prepMinutes must be a whole number, 0 or more";
  }
  if (!isNonNegative(r.priceForTwo)) return "priceForTwo must be 0 or more";
  return undefined;
};
