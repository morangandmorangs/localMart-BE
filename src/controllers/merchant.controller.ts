import Merchant, { IMerchant } from "../models/Merchant";
import { createPartnerController } from "./partner.controller";
import { ROLES } from "../types/auth.types";

export const merchantController = createPartnerController<IMerchant>(
  Merchant,
  "Merchant",
  ROLES.MERCHANT,
);

export default merchantController;
