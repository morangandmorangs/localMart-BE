import merchantController from "../../controllers/merchant.controller";
import { createPartnerRouter } from "../partnerRoutes";
import { ROLES } from "../../types/auth.types";

export default createPartnerRouter(merchantController, ROLES.MERCHANT);
