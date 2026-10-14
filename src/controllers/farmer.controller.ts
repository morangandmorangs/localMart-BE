import { createPartnerController } from "./partner.controller";
import { farmerRepo } from "../services/partner.service";
import { ROLES } from "../types/auth.types";

export const farmerController = createPartnerController(
  farmerRepo,
  "Farmer",
  ROLES.FARMER,
);

export default farmerController;
