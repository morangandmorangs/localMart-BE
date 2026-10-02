import mongoose from "mongoose";
import { createPartnerSchema, IPartner } from "./partnerSchema";
import { ROLES } from "../types/auth.types";

export interface IDriver extends IPartner {
  vehicleType?: string;
  vehicleNumber?: string;
  /** Drivers go off-duty without their profile being withdrawn. */
  isAvailable: boolean;
}

const DriverSchema = createPartnerSchema<IDriver>(ROLES.DRIVER);

DriverSchema.add({
  vehicleType: { type: String, trim: true },
  vehicleNumber: { type: String, trim: true, uppercase: true },
  isAvailable: { type: Boolean, default: false },
});

const DriverModel = mongoose.model<IDriver>("Driver", DriverSchema);

export default DriverModel;
