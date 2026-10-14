import { NextFunction, Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import ErrorResponse, { ERROR_CODES } from "../utils/errorResponse";
import { extractBearerToken, verifyToken } from "../utils/jwt";
import {
  AuthedRequest,
  JwtPayload,
  PROFILE_STATUS,
  ROLES,
  Role,
} from "../types/auth.types";

/** Where to look a principal up, by the role stamped in its token. */
const FIND_ACTIVE_FLAG: Record<
  Role,
  (id: string) => Promise<{ isActive: boolean } | null>
> = {
  [ROLES.ADMIN]: (id) =>
    prisma.admin.findUnique({ where: { id }, select: { isActive: true } }),
  [ROLES.CUSTOMER]: (id) =>
    prisma.customer.findUnique({ where: { id }, select: { isActive: true } }),
  [ROLES.MERCHANT]: (id) =>
    prisma.merchant.findUnique({ where: { id }, select: { isActive: true } }),
  [ROLES.DRIVER]: (id) =>
    prisma.driver.findUnique({ where: { id }, select: { isActive: true } }),
  [ROLES.FARMER]: (id) =>
    prisma.farmer.findUnique({ where: { id }, select: { isActive: true } }),
};

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

    const find = FIND_ACTIVE_FLAG[payload.role];
    if (!find) {
      throw ErrorResponse.unauthorized("Unknown role in token");
    }

    const principal = await find(payload.id);
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
    // delegates' query types don't unify, and only partners have a status.
    const select = { profileStatus: true } as const;
    const where = { id: req.auth.id };
    const partner =
      req.auth.role === ROLES.MERCHANT
        ? await prisma.merchant.findUnique({ where, select })
        : req.auth.role === ROLES.DRIVER
          ? await prisma.driver.findUnique({ where, select })
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
