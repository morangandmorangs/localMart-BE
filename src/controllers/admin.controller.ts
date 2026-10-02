import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import Admin from "../models/Admin";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import { toAdminProfile } from "../services/admin.service";
import { AuthedRequest } from "../types/auth.types";

/**
 * @desc    Sign in an admin
 * @route   POST /api/admin/auth/login
 * @access  Public
 */
export const loginAdmin = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const admin = await Admin.findOne({
      email: String(email).toLowerCase().trim(),
    }).select("+password");

    // One response for both an unknown email and a wrong password, so this
    // cannot be used to discover which admin accounts exist.
    if (!admin || !(await admin.matchPassword(password))) {
      logger.info(`Failed Admin login: ${email}`);
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
        code: ERROR_CODES.INVALID_CREDENTIALS,
      });
      return;
    }

    if (!admin.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is deactivated",
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
      return;
    }

    const token = admin.getSignedJwtToken();
    logger.info(`Admin logged in: ${admin.email} (${admin.designation})`);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        designation: admin.designation,
        token,
      },
    });
  },
);

/**
 * @desc    The signed-in admin
 * @route   GET /api/admin/auth/me
 * @access  Admin
 */
export const getAdminProfile = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const admin = await Admin.findById(req.auth?.id);

    if (!admin) {
      res.status(404).json({
        success: false,
        message: "Admin not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    res.status(200).json({ success: true, data: toAdminProfile(admin) });
  },
);

/**
 * @desc    Every admin account
 * @route   GET /api/admin/auth/accounts
 * @access  Admin (Super-Admin)
 */
export const listAdmins = asyncHandler(
  async (_req: Request, res: Response) => {
    const admins = await Admin.find().sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins.map(toAdminProfile),
    });
  },
);
