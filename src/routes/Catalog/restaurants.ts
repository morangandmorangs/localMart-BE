import express from "express";

import {
  createRestaurant,
  deleteRestaurant,
  getRestaurant,
  listRestaurants,
  updateRestaurant,
} from "../../controllers/restaurant.controller";
import {
  authorize,
  protect,
  requireApprovedProfile,
} from "../../middleware/authmiddleware";
import { ROLES } from "../../types/auth.types";

const router = express.Router();

// Public reads
router.get("/", listRestaurants);
router.get("/:restaurantId", getRestaurant);

// Writes: admins, or merchants whose documents have cleared review.
const adminOnly = [protect, authorize(ROLES.ADMIN)];
const approvedMerchant = [
  protect,
  authorize(ROLES.MERCHANT),
  requireApprovedProfile,
];

router.post("/", ...adminOnly, createRestaurant);
router.patch("/:restaurantId", ...adminOnly, updateRestaurant);
router.delete("/:restaurantId", ...adminOnly, deleteRestaurant);

router.post("/merchant/kitchen", ...approvedMerchant, createRestaurant);
router.patch(
  "/merchant/kitchen/:restaurantId",
  ...approvedMerchant,
  updateRestaurant,
);
router.delete(
  "/merchant/kitchen/:restaurantId",
  ...approvedMerchant,
  deleteRestaurant,
);

export default router;
