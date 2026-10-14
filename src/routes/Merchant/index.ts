import merchantController from "../../controllers/merchant.controller";
import {
  getShop,
  listShopOrders,
  setShopOpen,
  updateShopOrderStatus,
} from "../../controllers/merchantOps.controller";
import {
  authorize,
  protect,
  requireApprovedProfile,
} from "../../middleware/authmiddleware";
import { createPartnerRouter } from "../partnerRoutes";
import { ROLES } from "../../types/auth.types";

const router = createPartnerRouter(merchantController, ROLES.MERCHANT);

// The shop's name and open switch are readable while the profile is held, so
// the app can show where the merchant stands; everything that trades is not.
router.get("/me/shop", protect, authorize(ROLES.MERCHANT), getShop);

const approvedMerchant = [protect, authorize(ROLES.MERCHANT), requireApprovedProfile];
router.patch("/me/shop", ...approvedMerchant, setShopOpen);
router.get("/me/orders", ...approvedMerchant, listShopOrders);
router.patch("/me/orders/:id/status", ...approvedMerchant, updateShopOrderStatus);

export default router;
