import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import { verifyFirebaseIdToken } from "../services/firebase.service";
import {
  canOperate,
  signPartnerToken,
} from "../services/partner.service";
import {
  AUTH_PROVIDERS,
  AuthedRequest,
  PROFILE_STATUS,
  ROLES,
} from "../types/auth.types";
import {
  CROPS,
  LAND_UNITS,
  expectedHarvestDate,
  isCropSlug,
} from "../types/crop.types";
import { ERROR_CODES } from "../utils/errorResponse";
import logger from "../utils/logger";

const PINCODE_PATTERN = /^\d{6}$/;

const bad = (res: Response, message: string) =>
  res.status(400).json({
    success: false,
    message,
    code: ERROR_CODES.VALIDATION_FAILED,
  });

/** Firebase gives "+919876543210"; we store the 10 digits partners type. */
const tenDigits = (phone: string): string => phone.replace(/\D/g, "").slice(-10);

const text = (value: unknown): string | null => {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
};

/**
 * @desc    Sign in (or sign up) with a phone number, proved by a Firebase
 *          phone-OTP ID token
 * @route   POST /api/farmers/auth/phone
 * @access  Public
 */
export const loginWithPhone = asyncHandler(
  async (req: Request, res: Response) => {
    const { idToken, name } = req.body;
    if (!idToken) return void bad(res, "idToken is required");

    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified.ok) {
      res.status(verified.status).json({
        success: false,
        message: verified.message,
        code: verified.code,
      });
      return;
    }

    const { uid, phone_number } = verified.decoded;
    // Only the decoded token is trusted; a phone number in the body is not.
    if (!phone_number) return void bad(res, "A verified phone number is required");
    const phone = tenDigits(phone_number);

    const existing =
      (await prisma.farmer.findUnique({ where: { firebaseUid: uid } })) ??
      (await prisma.farmer.findUnique({ where: { phoneNumber: phone } }));

    if (existing && !existing.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is deactivated",
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
      return;
    }

    const isNew = !existing;
    const farmer = existing
      ? await prisma.farmer.update({
          where: { id: existing.id },
          data: { firebaseUid: uid, lastLoginAt: new Date() },
        })
      : await prisma.farmer.create({
          data: {
            name: text(name) ?? "Farmer",
            phoneNumber: phone,
            firebaseUid: uid,
            provider: AUTH_PROVIDERS.PHONE,
            profileStatus: PROFILE_STATUS.PENDING_DOCUMENTS,
            lastLoginAt: new Date(),
          },
        });

    logger.info(`Farmer logged in with phone: ${phone}`);
    res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew ? "Account created" : "Login successful",
      data: {
        id: farmer.id,
        name: farmer.name,
        email: farmer.email ?? undefined,
        role: ROLES.FARMER,
        profileStatus: farmer.profileStatus,
        canOperate: canOperate(farmer),
        isNew,
        token: signPartnerToken(farmer, ROLES.FARMER),
      },
    });
  },
);

/** Crops with their typical days to harvest, for the app's picker. */
export const listCropCatalog = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: Object.entries(CROPS).map(([slug, c]) => ({ slug, ...c })),
  });
};

const farmDetails = (f: {
  addressLine: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  landSize: number | null;
  landUnit: string;
}) => ({
  addressLine: f.addressLine,
  village: f.village,
  district: f.district,
  state: f.state,
  pincode: f.pincode,
  landSize: f.landSize,
  landUnit: f.landUnit,
});

/**
 * @desc    The farmer's farm profile: address, land and crops
 * @route   GET /api/farmers/me/farm
 * @access  Farmer
 *
 * Open to a held farmer: filling this in is part of getting reviewed.
 */
export const getFarm = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const farmer = await prisma.farmer.findUnique({
    where: { id: String(req.auth?.id) },
    include: { crops: { orderBy: { expectedHarvestOn: "asc" } } },
  });
  if (!farmer) {
    res.status(404).json({
      success: false,
      message: "Farmer not found",
      code: ERROR_CODES.NOT_FOUND,
    });
    return;
  }
  res.status(200).json({
    success: true,
    data: { ...farmDetails(farmer), crops: farmer.crops },
  });
});

/**
 * @desc    Update address and land size
 * @route   PUT /api/farmers/me/farm
 * @access  Farmer
 */
export const updateFarm = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const { addressLine, village, district, state, pincode, landSize, landUnit } =
      req.body;

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries({
      addressLine,
      village,
      district,
      state,
    })) {
      if (value !== undefined) data[key] = text(value);
    }

    if (pincode !== undefined) {
      const code = text(pincode);
      if (code && !PINCODE_PATTERN.test(code)) {
        return void bad(res, "Pincode must be 6 digits");
      }
      data.pincode = code;
    }

    if (landSize !== undefined) {
      const size = Number(landSize);
      if (!Number.isFinite(size) || size <= 0) {
        return void bad(res, "Land size must be a number above 0");
      }
      data.landSize = size;
    }

    if (landUnit !== undefined) {
      if (!LAND_UNITS.includes(landUnit)) {
        return void bad(res, `Land unit must be one of: ${LAND_UNITS.join(", ")}`);
      }
      data.landUnit = landUnit;
    }

    const farmer = await prisma.farmer.update({
      where: { id: String(req.auth?.id) },
      data,
    });
    res.status(200).json({ success: true, data: farmDetails(farmer) });
  },
);

/**
 * @desc    Record a planting; the harvest date is calculated here
 * @route   POST /api/farmers/me/crops
 * @access  Farmer
 */
export const addCrop = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { crop, variety, area, plantedOn } = req.body;

  if (!isCropSlug(crop)) {
    return void bad(res, `crop must be one of: ${Object.keys(CROPS).join(", ")}`);
  }
  const planted = new Date(plantedOn);
  if (!plantedOn || Number.isNaN(planted.getTime())) {
    return void bad(res, "plantedOn must be a valid date");
  }
  if (area !== undefined && area !== null && area !== "") {
    if (!Number.isFinite(Number(area)) || Number(area) <= 0) {
      return void bad(res, "Area must be a number above 0");
    }
  }

  const created = await prisma.farmerCrop.create({
    data: {
      farmerId: String(req.auth?.id),
      crop,
      variety: text(variety),
      area: area === undefined || area === null || area === "" ? null : Number(area),
      plantedOn: planted,
      expectedHarvestOn: expectedHarvestDate(crop, planted),
    },
  });
  res.status(201).json({ success: true, data: created });
});

/**
 * @desc    Mark a crop harvested, or fix its details
 * @route   PATCH /api/farmers/me/crops/:id
 * @access  Farmer
 */
export const updateCrop = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const existing = await prisma.farmerCrop.findFirst({
      where: { id: String(req.params.id), farmerId: String(req.auth?.id) },
    });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Crop not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    const { variety, area, plantedOn, harvested } = req.body;
    const data: Record<string, unknown> = {};
    if (variety !== undefined) data.variety = text(variety);
    if (area !== undefined) {
      if (area !== null && (!Number.isFinite(Number(area)) || Number(area) <= 0)) {
        return void bad(res, "Area must be a number above 0");
      }
      data.area = area === null ? null : Number(area);
    }
    if (plantedOn !== undefined) {
      const planted = new Date(plantedOn);
      if (Number.isNaN(planted.getTime())) {
        return void bad(res, "plantedOn must be a valid date");
      }
      data.plantedOn = planted;
      data.expectedHarvestOn = expectedHarvestDate(
        existing.crop as keyof typeof CROPS,
        planted,
      );
    }
    if (harvested !== undefined) {
      data.harvestedOn = harvested ? new Date() : null;
    }

    const updated = await prisma.farmerCrop.update({
      where: { id: existing.id },
      data,
    });
    res.status(200).json({ success: true, data: updated });
  },
);

/**
 * @desc    Remove a crop record
 * @route   DELETE /api/farmers/me/crops/:id
 * @access  Farmer
 */
export const deleteCrop = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const { count } = await prisma.farmerCrop.deleteMany({
      where: { id: String(req.params.id), farmerId: String(req.auth?.id) },
    });
    if (count === 0) {
      res.status(404).json({
        success: false,
        message: "Crop not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }
    res.status(200).json({ success: true });
  },
);
