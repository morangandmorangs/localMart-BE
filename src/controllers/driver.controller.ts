import { createPartnerController } from "./partner.controller";
import { driverRepo } from "../services/partner.service";
import { ROLES } from "../types/auth.types";

export const driverController = createPartnerController(
  driverRepo,
  "Driver",
  ROLES.DRIVER,
);

export default driverController;
