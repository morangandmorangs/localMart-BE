import Driver, { IDriver } from "../models/Driver";
import { createPartnerController } from "./partner.controller";
import { ROLES } from "../types/auth.types";

export const driverController = createPartnerController<IDriver>(
  Driver,
  "Driver",
  ROLES.DRIVER,
);

export default driverController;
