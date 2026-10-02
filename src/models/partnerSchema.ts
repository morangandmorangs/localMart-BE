import { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/jwt";
import {
  AUTH_PROVIDERS,
  AuthProvider,
  PROFILE_STATUS,
  PROFILE_STATUS_VALUES,
  ProfileStatus,
  Role,
  isProfileActive,
} from "../types/auth.types";

/** A document a partner must submit before the profile is released. */
export interface IPartnerDocument {
  kind: string;
  /** Where the file lives once uploaded (Cloudinary secure_url). */
  url: string;
  submittedAt: Date;
}

/**
 * Merchants and drivers differ in what they do, not in how they get in: both
 * sign up with email + password or Google, and both are held until their
 * documents are reviewed. That shared shape lives here so the two models
 * cannot drift apart on the security-relevant parts.
 */
export interface IPartner extends Document {
  name: string;
  email: string;
  phoneNumber?: string;
  /** Absent on Google-only accounts, so never assume it exists. */
  password?: string;
  provider: AuthProvider;
  /** Set when the account came from Google via Firebase. */
  firebaseUid?: string;
  profileStatus: ProfileStatus;
  documents: IPartnerDocument[];
  /** Why a reviewer rejected or suspended the profile. */
  reviewNote?: string;
  reviewedAt?: Date;
  isActive: boolean;
  /** FCM web-push device tokens, newest last. */
  fcmTokens: string[];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  matchPassword(enteredPassword: string): Promise<boolean>;
  getSignedJwtToken(): string;
  canOperate(): boolean;
}

const PartnerDocumentSchema = new Schema<IPartnerDocument>(
  {
    kind: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * Builds the shared partner schema for one role.
 *
 * Generic over the concrete partner interface because Mongoose's Schema
 * generic is invariant: a Schema<IPartner> is not assignable to
 * Schema<IDriver>, so each model has to get a schema built at its own type
 * before it can `.add()` its extra fields.
 *
 * @param role which RBAC role tokens minted from this schema carry.
 */
export const createPartnerSchema = <T extends IPartner>(role: Role) => {
  const schema = new Schema<T>(
    {
      name: {
        type: String,
        required: [true, "Please add a name"],
        trim: true,
      },
      email: {
        type: String,
        required: [true, "Please add an email"],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
          /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
          "Please add a valid email",
        ],
      },
      phoneNumber: {
        type: String,
        trim: true,
        match: [/^[6-9]\d{9}$/, "Please provide a valid 10-digit phone number"],
      },
      password: {
        type: String,
        minlength: 6,
        select: false,
      },
      provider: {
        type: String,
        enum: [AUTH_PROVIDERS.PASSWORD, AUTH_PROVIDERS.GOOGLE],
        default: AUTH_PROVIDERS.PASSWORD,
      },
      firebaseUid: {
        type: String,
        unique: true,
        sparse: true,
      },
      // New partners are held, never approved. Anything that releases a
      // profile must do so explicitly through the review flow.
      profileStatus: {
        type: String,
        enum: PROFILE_STATUS_VALUES,
        default: PROFILE_STATUS.PENDING_DOCUMENTS,
      },
      documents: { type: [PartnerDocumentSchema], default: [] },
      reviewNote: { type: String, trim: true },
      reviewedAt: { type: Date },
      isActive: { type: Boolean, default: true },
      fcmTokens: { type: [String], default: [], select: false },
      lastLoginAt: { type: Date },
    },
    { timestamps: true },
  );

  schema.pre("save", async function (this: IPartner) {
    // Google accounts have no password to hash.
    if (!this.password || !this.isModified("password")) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  });

  schema.methods.matchPassword = async function (
    this: IPartner,
    enteredPassword: string,
  ): Promise<boolean> {
    // A Google-only account must never match — comparing against an absent
    // hash would otherwise throw, or worse, be coerced into a pass.
    if (!this.password) return false;
    return bcrypt.compare(enteredPassword, this.password);
  };

  schema.methods.getSignedJwtToken = function (this: IPartner): string {
    return generateToken({ id: String(this._id), role });
  };

  schema.methods.canOperate = function (this: IPartner): boolean {
    return this.isActive && isProfileActive(this.profileStatus);
  };

  return schema;
};
