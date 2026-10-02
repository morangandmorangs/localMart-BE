import express, { Response } from "express";
import asyncHandler from "express-async-handler";

import Admin from "../models/Admin";
import Merchant from "../models/Merchant";
import { authorize, protect } from "../middleware/authmiddleware";
import {
  removeDeviceToken,
  saveDeviceToken,
} from "../services/notification.service";
import { AuthedRequest, ROLES } from "../types/auth.types";
import { ERROR_CODES } from "../utils/errorResponse";

const router = express.Router();

const modelFor = (req: AuthedRequest) =>
  req.auth?.role === ROLES.ADMIN ? Admin : Merchant;

const readToken = (req: AuthedRequest, res: Response) => {
  const token = String(req.body?.token ?? "").trim();
  if (!token || token.length > 4096) {
    res.status(400).json({
      success: false,
      message: "A device token is required",
      code: ERROR_CODES.VALIDATION_FAILED,
    });
    return null;
  }
  return token;
};

router.use(protect, authorize(ROLES.ADMIN, ROLES.MERCHANT));

router.post(
  "/token",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const token = readToken(req, res);
    if (!token) return;
    await saveDeviceToken(modelFor(req), req.auth!.id, token);
    res.status(200).json({ success: true, message: "Order alerts enabled" });
  }),
);

router.delete(
  "/token",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const token = readToken(req, res);
    if (!token) return;
    await removeDeviceToken(modelFor(req), req.auth!.id, token);
    res.status(200).json({ success: true, message: "Order alerts disabled" });
  }),
);

export default router;
