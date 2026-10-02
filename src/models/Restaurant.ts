import mongoose, { Document, Schema, Types } from "mongoose";

/**
 * Food is ordered from a kitchen, so the Food aisle lists restaurants rather
 * than products.
 *
 * Kept as its own model rather than a Product category: almost none of the
 * product fields apply, and stock counts are not how a kitchen works — it is
 * open or it is not.
 */
export interface IRestaurant extends Document {
  /** Stable public id, e.g. "rest-jonaki". */
  restaurantId: string;
  name: string;
  image: string;
  /** Short descriptor, e.g. "Assamese thali · Home-style". */
  cuisine: string;
  rating: number;
  ratingCount: number;
  /** Typical kitchen time in minutes, before delivery. */
  prepMinutes: number;
  priceForTwo: number;
  isOpen: boolean;
  signatureDishes: string[];
  /** The merchant that runs this kitchen. Absent on seeded demo rows. */
  merchant?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RestaurantSchema = new Schema<IRestaurant>(
  {
    restaurantId: {
      type: String,
      required: [true, "restaurantId is required"],
      unique: true,
      trim: true,
    },
    name: { type: String, required: [true, "Please add a name"], trim: true },
    image: {
      type: String,
      required: [true, "Please add an image"],
      trim: true,
    },
    cuisine: { type: String, required: true, trim: true },
    // Bounded so a bad write cannot render five-and-a-half stars.
    rating: { type: Number, required: true, min: 0, max: 5 },
    ratingCount: { type: Number, required: true, min: 0, default: 0 },
    prepMinutes: { type: Number, required: true, min: 0 },
    priceForTwo: { type: Number, required: true, min: 0 },
    /** Whether the kitchen is taking orders right now. */
    isOpen: { type: Boolean, default: false },
    signatureDishes: { type: [String], default: [] },
    merchant: { type: Schema.Types.ObjectId, ref: "Merchant" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const RestaurantModel = mongoose.model<IRestaurant>(
  "Restaurant",
  RestaurantSchema,
);

export default RestaurantModel;
