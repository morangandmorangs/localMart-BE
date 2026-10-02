import mongoose, { Document, Schema, Types } from "mongoose";

import {
  CATEGORY_SLUGS,
  CATEGORY_SLUG_VALUES,
  CategorySlug,
} from "../types/catalog.types";

/** One sellable size of a product sold by weight or count. */
export interface IProductVariant {
  /** Stable within a product, e.g. "500g", "whole". */
  variantId: string;
  /** What the shopper picks, e.g. "500 g, cut". */
  label: string;
  price: number;
  stockCount: number;
}

export interface IProduct extends Document {
  /** Stable public id, e.g. "fresh-tomato". Safe to put in a URL. */
  productId: string;
  name: string;
  image: string;
  category: CategorySlug;
  /** Matches a SubCategory.slug in the client's catalogue config. */
  subCategory: string;

  /** Sizes, for anything sold by weight. Excludes price/stockCount. */
  variants: Types.DocumentArray<IProductVariant>;
  /** Fixed-pack price. Only when there are no variants. */
  price?: number;
  /** Fixed-pack stock. Only when there are no variants. */
  stockCount?: number;

  /** Pack description for a fixed pack, e.g. "5 kg bag". */
  pack?: string;
  /** Provenance for fresh produce, e.g. "Brahmaputra catch". */
  origin?: string;
  /** What an OTC medicine treats. */
  useFor?: string;
  /** Rx items never go straight to the cart. */
  requiresPrescription: boolean;

  /** Which merchant stocks this. Absent on seeded demo rows. */
  merchant?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  totalStock(): number;
  isSoldOut(): boolean;
}

const ProductVariantSchema = new Schema<IProductVariant>(
  {
    variantId: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stockCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const ProductSchema = new Schema<IProduct>(
  {
    productId: {
      type: String,
      required: [true, "productId is required"],
      unique: true,
      trim: true,
    },
    name: { type: String, required: [true, "Please add a name"], trim: true },
    image: {
      type: String,
      required: [true, "Please add an image"],
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: CATEGORY_SLUG_VALUES,
    },
    subCategory: { type: String, required: true, trim: true },

    variants: { type: [ProductVariantSchema], default: [] },
    price: { type: Number, min: 0 },
    stockCount: { type: Number, min: 0 },

    pack: { type: String, trim: true },
    origin: { type: String, trim: true },
    useFor: { type: String, trim: true },
    requiresPrescription: { type: Boolean, default: false },

    merchant: { type: Schema.Types.ObjectId, ref: "Merchant" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/**
 * A product is priced one way or the other, never both.
 *
 * Without this a row could carry variants *and* a top-level price, and which
 * one the client charged would come down to render order — the kind of
 * mismatch that only surfaces as a wrong total at checkout.
 */
ProductSchema.pre("validate", function (next) {
  const hasVariants = this.variants && this.variants.length > 0;
  const hasFixedPrice = this.price !== undefined && this.price !== null;

  if (hasVariants && hasFixedPrice) {
    return next(
      new Error(
        "A product has either variants or a fixed price, not both. " +
          `Got both on "${this.productId}".`,
      ),
    );
  }
  if (!hasVariants && !hasFixedPrice) {
    return next(
      new Error(
        `"${this.productId}" needs either variants, or a price with stockCount.`,
      ),
    );
  }
  if (hasVariants) {
    const ids = this.variants.map((v) => v.variantId);
    if (new Set(ids).size !== ids.length) {
      return next(
        new Error(
          `Duplicate variantId on "${this.productId}": ${ids.join(", ")}`,
        ),
      );
    }
  }
  next();
});

/**
 * An Rx flag is only meaningful in the pharmacy aisle. Allowing it anywhere
 * else would put a prescription-gated item on a shelf with a plain Add
 * button.
 */
ProductSchema.pre("validate", function (next) {
  if (this.requiresPrescription && this.category !== CATEGORY_SLUGS.MEDICINE) {
    return next(new Error("Only medicine products may require a prescription"));
  }
  next();
});

/** Stock on hand, summed across variants when the product has them. */
ProductSchema.methods.totalStock = function (this: IProduct): number {
  if (this.variants.length > 0) {
    return this.variants.reduce((sum, v) => sum + v.stockCount, 0);
  }
  return this.stockCount ?? 0;
};

ProductSchema.methods.isSoldOut = function (this: IProduct): boolean {
  return this.totalStock() === 0;
};

// The category pages read by aisle, then by shelf.
ProductSchema.index({ category: 1, subCategory: 1, isActive: 1 });

const ProductModel = mongoose.model<IProduct>("Product", ProductSchema);

export default ProductModel;
