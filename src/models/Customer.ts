import mongoose, { Document, Schema, Types } from "mongoose";
import { generateToken } from "../utils/jwt";
import { ROLES } from "../types/auth.types";

/** A delivery address a customer has saved. */
export interface IAddress {
  _id: Types.ObjectId;
  label: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

/**
 * Customers authenticate with Firebase phone OTP only — there is no password
 * on this model by design. Firebase owns the credential; we store the uid it
 * issues and trust a verified ID token.
 */
export interface ICustomer extends Document {
  firebaseUid: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  /** Delivery area, checked against the served-areas list by the client. */
  area?: string;
  addresses: Types.DocumentArray<IAddress>;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  getSignedJwtToken(): string;
}

const AddressSchema = new Schema<IAddress>({
  label: { type: String, required: [true, "Label is required"], trim: true },
  line1: { type: String, required: [true, "Address line is required"], trim: true },
  city: { type: String, required: [true, "City is required"], trim: true },
  state: { type: String, required: [true, "State is required"], trim: true },
  pincode: { type: String, required: [true, "Pincode is required"], trim: true },
});

const CustomerSchema = new Schema<ICustomer>(
  {
    firebaseUid: {
      type: String,
      required: [true, "Firebase uid is required"],
      unique: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
    },
    name: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    area: { type: String, trim: true },
    addresses: { type: [AddressSchema], default: [] },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

CustomerSchema.methods.getSignedJwtToken = function (): string {
  return generateToken({ id: String(this._id), role: ROLES.CUSTOMER });
};

const CustomerModel = mongoose.model<ICustomer>("Customer", CustomerSchema);

export default CustomerModel;
