import farmerController from "../../controllers/farmer.controller";
import {
  addCrop,
  deleteCrop,
  getFarm,
  listCropCatalog,
  loginWithPhone,
  updateCrop,
  updateFarm,
} from "../../controllers/farmerOps.controller";
import { authorize, protect } from "../../middleware/authmiddleware";
import { createPartnerRouter } from "../partnerRoutes";
import { ROLES } from "../../types/auth.types";

const router = createPartnerRouter(farmerController, ROLES.FARMER);

// Phone-OTP sign-in, alongside email/password and Google.
router.post("/auth/phone", loginWithPhone);
router.get("/crop-catalog", listCropCatalog);

// Farm details are open to a held farmer: they are part of getting reviewed.
const farmer = [protect, authorize(ROLES.FARMER)];
router.get("/me/farm", ...farmer, getFarm);
router.put("/me/farm", ...farmer, updateFarm);
router.post("/me/crops", ...farmer, addCrop);
router.patch("/me/crops/:id", ...farmer, updateCrop);
router.delete("/me/crops/:id", ...farmer, deleteCrop);

export default router;
