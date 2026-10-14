import express from "express";

import {
  getAdminProfile,
  listAdmins,
  loginAdmin,
} from "../../controllers/admin.controller";
import {
  authorize,
  protect,
  requireDesignation,
} from "../../middleware/authmiddleware";
import { ADMIN_DESIGNATIONS, ROLES } from "../../types/auth.types";

const router = express.Router();

// Public
router.post("/login", loginAdmin);

// Signed-in admins
router.get("/me", protect, authorize(ROLES.ADMIN), getAdminProfile);

// Super-Admin only: every admin account is a privileged view.
router.get(
  "/accounts",
  protect,
  authorize(ROLES.ADMIN),
  requireDesignation(ADMIN_DESIGNATIONS.SUPER_ADMIN),
  listAdmins,
);

export default router;
