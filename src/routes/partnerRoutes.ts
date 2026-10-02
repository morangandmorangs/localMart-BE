import express, { Router } from "express";

import { createPartnerController } from "../controllers/partner.controller";
import {
  authorize,
  protect,
  requireDesignation,
} from "../middleware/authmiddleware";
import { ADMIN_DESIGNATIONS, ROLES, Role } from "../types/auth.types";

/**
 * Merchants and drivers expose the same endpoints, so both routers are built
 * from here against their own controller.
 *
 * Note what is *not* gated on an approved profile: login, /me and document
 * submission all stay open to a held partner, because those are exactly the
 * routes they need to get un-held. Operational routes added later must sit
 * behind `requireApprovedProfile`.
 */
export const createPartnerRouter = (
  controller: ReturnType<typeof createPartnerController>,
  role: Role,
): Router => {
  const router = express.Router();

  // Public
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/auth/google", controller.loginWithGoogle);

  // The partner's own held profile
  router.get("/me", protect, authorize(role), controller.getProfile);
  router.post(
    "/me/documents",
    protect,
    authorize(role),
    controller.submitDocuments,
  );

  // Admin review queue
  router.get("/", protect, authorize(ROLES.ADMIN), controller.list);
  router.patch(
    "/:id/review",
    protect,
    authorize(ROLES.ADMIN),
    requireDesignation(
      ADMIN_DESIGNATIONS.SUPER_ADMIN,
      ADMIN_DESIGNATIONS.MANAGER,
    ),
    controller.review,
  );

  return router;
};
