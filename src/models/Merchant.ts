import mongoose from "mongoose";
import { createPartnerSchema, IPartner } from "./partnerSchema";
import { ROLES } from "../types/auth.types";

export interface IMerchant extends IPartner {
  shopName?: string;
  /** Area the shop serves; matched against the served-areas list. */
  area?: string;
}

const MerchantSchema = createPartnerSchema<IMerchant>(ROLES.MERCHANT);

MerchantSchema.add({
  shopName: { type: String, trim: true },
  area: { type: String, trim: true },
});

const MerchantModel = mongoose.model<IMerchant>("Merchant", MerchantSchema);

export default MerchantModel;
