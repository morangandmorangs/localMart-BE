import driverController from "../../controllers/driver.controller";
import {
  advanceDelivery,
  listDeliveries,
  setOnline,
} from "../../controllers/driverOps.controller";
import {
  authorize,
  protect,
  requireApprovedProfile,
} from "../../middleware/authmiddleware";
import { createPartnerRouter } from "../partnerRoutes";
import { ROLES } from "../../types/auth.types";

const router = createPartnerRouter(driverController, ROLES.DRIVER);

// Deliveries are work, so they sit behind an approved profile.
const approvedDriver = [protect, authorize(ROLES.DRIVER), requireApprovedProfile];
router.get("/me/deliveries", ...approvedDriver, listDeliveries);
router.post("/me/deliveries/:id/advance", ...approvedDriver, advanceDelivery);
router.patch("/me/online", ...approvedDriver, setOnline);

export default router;
