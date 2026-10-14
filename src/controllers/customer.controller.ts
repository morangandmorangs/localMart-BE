import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import { verifyFirebaseIdToken } from "../services/firebase.service";
import {
  signCustomerToken,
  toAddressDto,
  toCustomerProfile,
} from "../services/customer.service";
import { AuthedRequest } from "../types/auth.types";

/**
 * @desc    Exchange a Firebase phone-OTP token for a session
 * @route   POST /api/customers/auth/firebase
 * @access  Public
 *
 * The client runs the OTP challenge with the Firebase SDK; this verifies the
 * resulting ID token. The phone number is read off the decoded token, never
 * off the request body.
 */
export const loginCustomer = asyncHandler(
  async (req: Request, res: Response) => {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({
        success: false,
        message: "idToken is required",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const verified = await verifyFirebaseIdToken(idToken);

    if (!verified.ok) {
      logger.info("Failed Customer login: Firebase token rejected");
      res.status(verified.status).json({
        success: false,
        message: verified.message,
        code: verified.code,
      });
      return;
    }

    const { uid, phone_number: phoneNumber } = verified.decoded;

    if (!phoneNumber) {
      res.status(400).json({
        success: false,
        message: "This sign-in has no phone number. Customers must use phone OTP.",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    // Matches on uid first, then phone number: a customer who re-registers
    // their number in Firebase comes back with a new uid, and matching only
    // on uid would strand their order history behind a duplicate record.
    const existing =
      (await prisma.customer.findUnique({ where: { firebaseUid: uid } })) ??
      (await prisma.customer.findUnique({ where: { phoneNumber } }));

    if (existing && !existing.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is deactivated",
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
      return;
    }

    const isNew = !existing;
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: { firebaseUid: uid, lastLoginAt: new Date() },
        })
      : await prisma.customer.create({
          data: { firebaseUid: uid, phoneNumber, lastLoginAt: new Date() },
        });

    const token = signCustomerToken(customer);
    logger.info(`Customer logged in: ${customer.phoneNumber}`);

    res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew ? "Account created" : "Login successful",
      data: {
        id: customer.id,
        name: customer.name ?? undefined,
        phoneNumber: customer.phoneNumber,
        area: customer.area ?? undefined,
        role: "Customer",
        isNew,
        token,
      },
    });
  },
);

/**
 * @desc    Sign in by phone number alone, with no OTP. DEVELOPMENT ONLY.
 * @route   POST /api/customers/auth/dev
 * @access  Disabled unless ALLOW_DEV_LOGIN=true, and never in production
 *
 * Real sign-in is Firebase phone OTP, which needs a native Firebase module
 * and a dev build. This lets the customer app be exercised against a local
 * backend without one. It is a sign-in with no proof of identity, so it is
 * double-locked: it needs an explicit opt-in AND refuses to exist when
 * NODE_ENV is production, whatever the flag says. 404, not 403, so a probe
 * can't confirm the route is there.
 */
export const loginCustomerDev = asyncHandler(
  async (req: Request, res: Response) => {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.ALLOW_DEV_LOGIN !== "true"
    ) {
      res.status(404).json({
        success: false,
        message: "Not Found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    const phoneNumber = String(req.body?.phoneNumber ?? "").trim();
    if (!/^\+?\d{10,15}$/.test(phoneNumber)) {
      res.status(400).json({
        success: false,
        message: "A phone number of 10 to 15 digits is required",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    // "signup" and "signin" are explicit so a mistyped number can't silently
    // create an account. Without an intent the old create-or-login applies.
    const intent = req.body?.intent;
    const name = String(req.body?.name ?? "").trim() || undefined;

    const existing = await prisma.customer.findUnique({ where: { phoneNumber } });
    if (intent === "signup" && existing) {
      res.status(409).json({
        success: false,
        message: "An account with this number already exists. Sign in instead.",
        code: ERROR_CODES.ALREADY_EXISTS,
      });
      return;
    }
    if (intent === "signin" && !existing) {
      res.status(404).json({
        success: false,
        message: "No account with this number. Sign up first.",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }
    if (existing && !existing.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is deactivated",
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
      return;
    }

    const isNew = !existing;
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: { lastLoginAt: new Date() },
        })
      : await prisma.customer.create({
          data: {
            // Namespaced so it can never collide with a real Firebase uid.
            firebaseUid: `dev:${phoneNumber}`,
            phoneNumber,
            name,
            lastLoginAt: new Date(),
          },
        });

    logger.warn(`DEV LOGIN used for customer ${phoneNumber}`);
    res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew ? "Account created" : "Login successful",
      data: {
        id: customer.id,
        name: customer.name ?? undefined,
        phoneNumber: customer.phoneNumber,
        area: customer.area ?? undefined,
        role: "Customer",
        isNew,
        token: signCustomerToken(customer),
      },
    });
  },
);

/**
 * @desc    The signed-in customer
 * @route   GET /api/customers/me
 * @access  Customer
 */
export const getCustomerProfile = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const customer = await prisma.customer.findUnique({
      where: { id: String(req.auth?.id) },
    });

    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    res.status(200).json({ success: true, data: toCustomerProfile(customer) });
  },
);

/**
 * @desc    Update name, email or delivery area
 * @route   PATCH /api/customers/me
 * @access  Customer
 */
export const updateCustomerProfile = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const { name, email, area } = req.body;

    const found = await prisma.customer.findUnique({
      where: { id: String(req.auth?.id) },
    });

    if (!found) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    // phoneNumber and firebaseUid are owned by Firebase, never by this route.
    const customer = await prisma.customer.update({
      where: { id: found.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(email !== undefined
          ? { email: String(email).toLowerCase().trim() }
          : {}),
        ...(area !== undefined ? { area: String(area).trim() } : {}),
      },
    });

    res.status(200).json({
      success: true,
      message: "Profile updated",
      data: toCustomerProfile(customer),
    });
  },
);

/**
 * @desc    The signed-in customer's saved addresses
 * @route   GET /api/customers/me/addresses
 * @access  Customer
 */
export const listAddresses = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const customer = await prisma.customer.findUnique({
      where: { id: String(req.auth?.id) },
      include: { addresses: { orderBy: { createdAt: "asc" } } },
    });

    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: customer.addresses.map(toAddressDto),
    });
  },
);

/**
 * @desc    Save a new delivery address
 * @route   POST /api/customers/me/addresses
 * @access  Customer
 */
export const addAddress = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const { label, line1, city, state, pincode } = req.body;

    if (!label || !line1 || !city || !state || !pincode) {
      res.status(400).json({
        success: false,
        message: "label, line1, city, state and pincode are all required",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { id: String(req.auth?.id) },
    });

    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    const saved = await prisma.address.create({
      data: {
        customerId: customer.id,
        label: String(label).trim(),
        line1: String(line1).trim(),
        city: String(city).trim(),
        state: String(state).trim(),
        pincode: String(pincode).trim(),
      },
    });
    logger.info(`Address added for customer: ${customer.phoneNumber}`);

    res.status(201).json({
      success: true,
      message: "Address added",
      data: toAddressDto(saved),
    });
  },
);
