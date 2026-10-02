import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/jwt";
import {
  ADMIN_DESIGNATION_VALUES,
  ADMIN_DESIGNATIONS,
  AdminDesignation,
  ROLES,
} from "../types/auth.types";

export interface IAdmin extends Document {
  name: string;
  email: string;
  phoneNumber?: string;
  password: string;
  /** Constant: an Admin's RBAC role never varies. Seniority is designation. */
  role: typeof ROLES.ADMIN;
  designation: AdminDesignation;
  isActive: boolean;
  /** FCM web-push device tokens, newest last. */
  fcmTokens: string[];
  createdAt: Date;
  updatedAt: Date;
  matchPassword(enteredPassword: string): Promise<boolean>;
  getSignedJwtToken(): string;
}

const AdminSchema = new Schema<IAdmin>(
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
      unique: true,
      sparse: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, "Please provide a valid 10-digit phone number"],
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: [ROLES.ADMIN],
      default: ROLES.ADMIN,
      immutable: true,
    },
    designation: {
      type: String,
      enum: ADMIN_DESIGNATION_VALUES,
      default: ADMIN_DESIGNATIONS.MANAGER,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    fcmTokens: { type: [String], default: [], select: false },
  },
  {
    timestamps: true,
  },
);

// Encrypt password using bcrypt.
AdminSchema.pre("save", async function () {
  // Guard matters on every update that isn't a password change — without it
  // the stored hash would be re-hashed and no password would ever match.
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database.
AdminSchema.methods.matchPassword = async function (
  enteredPassword: string,
): Promise<boolean> {
  return bcrypt.compare(enteredPassword, this.password);
};

// Sign JWT and return.
AdminSchema.methods.getSignedJwtToken = function (): string {
  return generateToken({
    id: String(this._id),
    role: ROLES.ADMIN,
    designation: this.designation,
  });
};

const AdminModel = mongoose.model<IAdmin>("Admin", AdminSchema);

export default AdminModel;
