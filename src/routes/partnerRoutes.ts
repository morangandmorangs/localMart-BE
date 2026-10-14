import express, { Router } from "express";

import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import { cloudinaryConfigured } from "../config/cloudinaryConfig";
import { uploadBuffer } from "../config/helperUpload";
import { documentUpload } from "../config/multerConfig";
import { AuthedRequest } from "../types/auth.types";
import { ERROR_CODES } from "../utils/errorResponse";
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

  // Hosts one file and returns its URL; the client then sends the URLs to
  // /me/documents. Split in two so a failed upload doesn't lose the others.
  router.post(
    "/me/documents/upload",
    protect,
    authorize(role),
    documentUpload.single("file"),
    asyncHandler(async (req: Request, res: Response) => {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({
          success: false,
          message: "Attach a JPG, PNG, WebP or PDF file under 5 MB",
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        return;
      }
      if (!cloudinaryConfigured()) {
        res.status(503).json({
          success: false,
          message: "Document upload is not available right now",
          code: ERROR_CODES.INTERNAL,
        });
        return;
      }
      const owner = (req as AuthedRequest).auth?.id;
      const url = await uploadBuffer(
        file.buffer,
        `local-mart/${role.toLowerCase()}-documents/${owner}`,
      );
      res.status(201).json({ success: true, data: { url } });
    }),
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
