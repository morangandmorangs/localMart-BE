import { NextFunction, Response } from "express";
import asyncHandler from "express-async-handler";

import Admin from "../models/Admin";
import Customer from "../models/Customer";
import Driver from "../models/Driver";
import Merchant from "../models/Merchant";
import ErrorResponse, { ERROR_CODES } from "../utils/errorResponse";
import { extractBearerToken, verifyToken } from "../utils/jwt";
import {
  AuthedRequest,
  JwtPayload,
  PROFILE_STATUS,
  ROLES,
  Role,
} from "../types/auth.types";

/**
 * The slice of a Mongoose model this file needs. The four models have
 * different document generics, so a plain lookup table over them produces a
 * union whose `findById` overloads don't reconcile; describing just the two
 * calls we make keeps one table instead of four branches.
 */
interface PrincipalModel {
  findById(id: string): {
    select(fields: string): PromiseLike<{ isActive: boolean } | null>;
  };
}

/** Where to look a principal up, by the role stamped in its token. */
const MODEL_BY_ROLE = {
  [ROLES.ADMIN]: Admin,
  [ROLES.CUSTOMER]: Customer,
  [ROLES.MERCHANT]: Merchant,
  [ROLES.DRIVER]: Driver,
} as unknown as Record<Role, PrincipalModel>;

/**
 * Verifies the bearer token and confirms the principal still exists and is
 * active.
 *
 * The database round-trip is deliberate: a token stays valid until it
 * expires, so without it a deleted or disabled account would keep working for
 * the rest of the token's life.
 */
export const protect = asyncHandler(
  async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw ErrorResponse.unauthorized("No token provided");
    }

    const payload: JwtPayload = verifyToken(token);

    const model = MODEL_BY_ROLE[payload.role];
    if (!model) {
      throw ErrorResponse.unauthorized("Unknown role in token");
    }

    const principal = await model.findById(payload.id).select("isActive");
    if (!principal) {
      throw ErrorResponse.unauthorized("Account no longer exists");
    }
    if (!principal.isActive) {
      throw new ErrorResponse(
        "This account has been disabled",
        403,
        ERROR_CODES.ACCOUNT_DISABLED,
      );
    }

    req.auth = payload;
    next();
  },
);

/**
 * Restricts a route to the given roles. Always mount after `protect`.
 *
 * `authorize(ROLES.ADMIN)` — admins only
 * `authorize(ROLES.MERCHANT, ROLES.DRIVER)` — either partner kind
 */
export const authorize =
  (...roles: Role[]) =>
  (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return next(ErrorResponse.unauthorized());
    }
    if (!roles.includes(req.auth.role)) {
      return next(
        ErrorResponse.forbidden(
          `This route is restricted to: ${roles.join(", ")}`,
        ),
      );
    }
    next();
  };

/**
 * Blocks a partner whose profile is still held.
 *
 * Sign-in deliberately stays open to held partners — they need to get in to
 * submit documents and watch their status — so the hold is enforced here, on
 * the routes that actually trade, rather than at the login gate.
 */
export const requireApprovedProfile = asyncHandler(
  async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw ErrorResponse.unauthorized();
    }

    // Queried per branch rather than through a shared variable: the two
    // models' query types don't unify, and only partners have a status.
    const partner =
      req.auth.role === ROLES.MERCHANT
        ? await Merchant.findById(req.auth.id).select("profileStatus")
        : req.auth.role === ROLES.DRIVER
          ? await Driver.findById(req.auth.id).select("profileStatus")
          : null;

    if (req.auth.role !== ROLES.MERCHANT && req.auth.role !== ROLES.DRIVER) {
      throw ErrorResponse.forbidden("Not a partner account");
    }
    if (!partner) {
      throw ErrorResponse.unauthorized("Account no longer exists");
    }

    if (partner.profileStatus !== PROFILE_STATUS.APPROVED) {
      throw ErrorResponse.onHold(
        `Your profile is ${partner.profileStatus}. Submit your documents and wait for approval before using this.`,
      );
    }

    next();
  },
);

/** Narrows an admin route to specific designations, e.g. Super-Admin only. */
export const requireDesignation =
  (...designations: string[]) =>
  (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.auth || req.auth.role !== ROLES.ADMIN) {
      return next(ErrorResponse.forbidden("Admins only"));
    }
    if (
      !req.auth.designation ||
      !designations.includes(req.auth.designation)
    ) {
      return next(
        ErrorResponse.forbidden(
          `Requires one of: ${designations.join(", ")}`,
        ),
      );
    }
    next();
  };
