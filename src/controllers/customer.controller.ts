import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import Customer from "../models/Customer";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import { verifyFirebaseIdToken } from "../services/firebase.service";
import {
  findOrCreateCustomer,
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

    const { customer, isNew } = await findOrCreateCustomer(uid, phoneNumber);

    if (!customer.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is deactivated",
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
      return;
    }

    customer.lastLoginAt = new Date();
    await customer.save();

    const token = customer.getSignedJwtToken();
    logger.info(`Customer logged in: ${customer.phoneNumber}`);

    res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew ? "Account created" : "Login successful",
      data: {
        id: customer._id,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        area: customer.area,
        role: "Customer",
        isNew,
        token,
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
    const customer = await Customer.findById(req.auth?.id);

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

    const customer = await Customer.findById(req.auth?.id);

    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    // phoneNumber and firebaseUid are owned by Firebase, never by this route.
    if (name !== undefined) customer.name = name;
    if (email !== undefined) customer.email = email;
    if (area !== undefined) customer.area = area;
    await customer.save();

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
    const customer = await Customer.findById(req.auth?.id);

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

    const customer = await Customer.findById(req.auth?.id);

    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    customer.addresses.push({ label, line1, city, state, pincode });
    await customer.save();

    const saved = customer.addresses[customer.addresses.length - 1];
    logger.info(`Address added for customer: ${customer.phoneNumber}`);

    res.status(201).json({
      success: true,
      message: "Address added",
      data: toAddressDto(saved),
    });
  },
);
