import { FilterQuery } from "mongoose";

import { IProduct, IProductVariant } from "../models/Product";
import { IRestaurant } from "../models/Restaurant";
import {
  CATEGORY_SLUGS,
  CATEGORY_SLUG_VALUES,
  CategorySlug,
  LOW_STOCK_THRESHOLD,
} from "../types/catalog.types";

/**
 * Wire shape for a product.
 *
 * Deliberately mirrors the client's catalogue types, including `id` rather
 * than `_id` and `variantId` flattened to `id`: the category pages already
 * read that shape from their mock data, so swapping them onto the API is an
 * import change rather than a rewrite. Mongo internals stay server-side.
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
  /** Derived server-side so every client agrees on what sold out means. */
  totalStock: number;
  isSoldOut: boolean;
  isLowStock: boolean;
}

const toVariantDto = (v: IProductVariant) => ({
  id: v.variantId,
  label: v.label,
  price: v.price,
  stockCount: v.stockCount,
});

export const toProductDto = (product: IProduct): ProductDto => {
  const total = product.totalStock();

  return {
    id: product.productId,
    name: product.name,
    image: product.image,
    category: product.category,
    subCategory: product.subCategory,
    ...(product.variants.length > 0
      ? { variants: product.variants.map(toVariantDto) }
      : { price: product.price, stockCount: product.stockCount }),
    ...(product.pack ? { pack: product.pack } : {}),
    ...(product.origin ? { origin: product.origin } : {}),
    ...(product.useFor ? { useFor: product.useFor } : {}),
    ...(product.requiresPrescription ? { requiresPrescription: true } : {}),
    totalStock: total,
    isSoldOut: total === 0,
    isLowStock: total > 0 && total <= LOW_STOCK_THRESHOLD,
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

export const toRestaurantDto = (r: IRestaurant): RestaurantDto => ({
  id: r.restaurantId,
  name: r.name,
  image: r.image,
  cuisine: r.cuisine,
  rating: r.rating,
  ratingCount: r.ratingCount,
  prepMinutes: r.prepMinutes,
  priceForTwo: r.priceForTwo,
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
 * Turns query-string parameters into a Mongo filter.
 *
 * Only ever reads a fixed set of keys. Spreading `req.query` straight into a
 * filter would let a caller inject operators and read rows the route never
 * meant to expose.
 */
export const buildProductFilter = (
  query: ProductQuery,
): FilterQuery<IProduct> => {
  const filter: FilterQuery<IProduct> = { isActive: true };

  if (isCategorySlug(query.category)) {
    filter.category = query.category;
  }
  if (typeof query.subCategory === "string" && query.subCategory.trim()) {
    filter.subCategory = query.subCategory.trim();
  }
  if (typeof query.search === "string" && query.search.trim()) {
    // Escaped: an unescaped user string is a regex injection, and a pattern
    // like "(a+)+" is enough to pin the event loop.
    const safe = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.name = { $regex: safe, $options: "i" };
  }

  return filter;
};

/**
 * Drops sold-out products after the query.
 *
 * Done here rather than in Mongo because stock lives in two shapes — a
 * top-level count or a sum across variants — and expressing that as one
 * query means an aggregation for what is a cheap pass over a page of rows.
 */
export const applyStockFilter = (
  products: IProduct[],
  inStock?: string,
): IProduct[] =>
  inStock === "true" ? products.filter((p) => !p.isSoldOut()) : products;

/** Fields a caller may set on a product. Anything else is ignored. */
export const WRITABLE_PRODUCT_FIELDS = [
  "name",
  "image",
  "category",
  "subCategory",
  "variants",
  "price",
  "stockCount",
  "pack",
  "origin",
  "useFor",
  "requiresPrescription",
  "isActive",
] as const;

/**
 * Copies only writable fields off a request body.
 *
 * An allowlist, not a denylist: `merchant` and `productId` must never be
 * settable by a caller, or one merchant could reassign another's stock.
 */
export const pickProductFields = (
  body: Record<string, unknown>,
): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const field of WRITABLE_PRODUCT_FIELDS) {
    if (body[field] !== undefined) picked[field] = body[field];
  }
  return picked;
};

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

export const pickRestaurantFields = (
  body: Record<string, unknown>,
): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const field of WRITABLE_RESTAURANT_FIELDS) {
    if (body[field] !== undefined) picked[field] = body[field];
  }
  return picked;
};

/** Normalises client variants (`id`) to the stored shape (`variantId`). */
export const normaliseVariants = (
  variants: unknown,
): IProductVariant[] | undefined => {
  if (!Array.isArray(variants)) return undefined;
  return variants.map((v) => ({
    variantId: String(v.variantId ?? v.id ?? "").trim(),
    label: String(v.label ?? "").trim(),
    price: Number(v.price),
    stockCount: Number(v.stockCount ?? 0),
  }));
};

/** The fields the shape rules care about, whether from a body or a document. */
export interface ProductShape {
  productId?: string;
  category?: unknown;
  variants?: unknown;
  price?: unknown;
  requiresPrescription?: unknown;
}

/**
 * The same rules the model enforces in its pre-validate hooks, checked
 * synchronously.
 *
 * Needed because Mongoose's `validateSync()` skips async pre-validate hooks:
 * without this the controller sees a clean document, `save()` throws the hook
 * error, and a plain bad request comes back as a 500 with no error code. The
 * model keeps its hooks as a backstop for writes that don't come through a
 * controller, such as the seeder.
 */
export const validateProductShape = (
  product: ProductShape,
): string | undefined => {
  const id = product.productId ?? "product";
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const hasVariants = variants.length > 0;
  const hasFixedPrice = product.price !== undefined && product.price !== null;

  if (hasVariants && hasFixedPrice) {
    return `A product has either variants or a fixed price, not both. Got both on "${id}".`;
  }
  if (!hasVariants && !hasFixedPrice) {
    return `"${id}" needs either variants, or a price with stockCount.`;
  }
  if (hasVariants) {
    const ids = variants.map((v) =>
      String((v as { variantId?: string; id?: string }).variantId ?? (v as { id?: string }).id ?? ""),
    );
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
