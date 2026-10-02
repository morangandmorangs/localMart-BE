import mongoose, { Document, Schema, Types } from "mongoose";

/** One line of an order — a snapshot at purchase time, not a Product ref:
 *  a product's price or name changing later must not rewrite past orders. */
export interface IOrderItem {
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
  /** Merchant that stocks the product; absent on seeded demo rows. */
  merchant?: Types.ObjectId;
}

/** Delivery address at order time — a snapshot, not a ref to the customer's
 *  saved address: that address may be edited or deleted after the order. */
export interface IOrderAddress {
  label: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

export type PaymentMethod = "gpay" | "phonepe";

export interface IOrder extends Document {
  customer: Types.ObjectId;
  items: Types.DocumentArray<IOrderItem>;
  address: IOrderAddress;
  paymentMethod: PaymentMethod;
  total: number;
  status: "placed";
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: String, required: true, trim: true },
    variantId: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    merchant: { type: Schema.Types.ObjectId, ref: "Merchant" },
  },
  { _id: false },
);

const OrderAddressSchema = new Schema<IOrderAddress>(
  {
    label: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const OrderSchema = new Schema<IOrder>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: (items: IOrderItem[]) => items.length > 0,
        message: "An order needs at least one item",
      },
    },
    address: { type: OrderAddressSchema, required: true },
    paymentMethod: { type: String, required: true, enum: ["gpay", "phonepe"] },
    total: { type: Number, required: true, min: 0 },
    // One status for now — no fulfillment workflow yet.
    status: { type: String, required: true, enum: ["placed"], default: "placed" },
  },
  { timestamps: true },
);

// The admin order list reads newest-first.
OrderSchema.index({ createdAt: -1 });

const OrderModel = mongoose.model<IOrder>("Order", OrderSchema);

export default OrderModel;
