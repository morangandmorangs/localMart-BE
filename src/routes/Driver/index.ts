import driverController from "../../controllers/driver.controller";
import { createPartnerRouter } from "../partnerRoutes";
import { ROLES } from "../../types/auth.types";

export default createPartnerRouter(driverController, ROLES.DRIVER);
