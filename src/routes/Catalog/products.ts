import express from "express";

import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../../controllers/product.controller";
import {
  authorize,
  protect,
  requireApprovedProfile,
} from "../../middleware/authmiddleware";
import { ROLES } from "../../types/auth.types";

const router = express.Router();

// Public reads — the category pages are browsable without signing in.
router.get("/", listProducts);
router.get("/:productId", getProduct);

/**
 * Writes.
 *
 * Admins pass straight through; merchants must additionally be approved, so
 * a partner still on document hold cannot list stock. That is the whole
 * point of the hold, and enforcing it here rather than at login is why
 * requireApprovedProfile exists.
 */
const adminOnly = [protect, authorize(ROLES.ADMIN)];
const approvedMerchant = [
  protect,
  authorize(ROLES.MERCHANT),
  requireApprovedProfile,
];

router.post("/", ...adminOnly, createProduct);
router.patch("/:productId", ...adminOnly, updateProduct);
router.delete("/:productId", ...adminOnly, deleteProduct);

router.post("/merchant/stock", ...approvedMerchant, createProduct);
router.patch("/merchant/stock/:productId", ...approvedMerchant, updateProduct);
router.delete("/merchant/stock/:productId", ...approvedMerchant, deleteProduct);

export default router;
