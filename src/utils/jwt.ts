import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/auth.types";
import ErrorResponse, { ERROR_CODES } from "./errorResponse";

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Resolved per call rather than at import time so the seeder and the server
 * both pick up dotenv regardless of import order.
 *
 * There is deliberately no fallback secret: a default would quietly sign
 * forgeable tokens in any environment that forgot to set one.
 */
const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Generate one with: openssl rand -hex 32",
    );
  }
  return secret;
};

const getTtlSeconds = (): number => {
  const raw = process.env.JWT_EXPIRES_IN_SECONDS;
  if (!raw) return DEFAULT_TTL_SECONDS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
};

export const generateToken = (payload: JwtPayload): string =>
  jwt.sign(payload, getSecret(), { expiresIn: getTtlSeconds() });

/** Verifies and narrows a bearer token, or throws an ErrorResponse. */
export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ErrorResponse(
        "Session expired, sign in again",
        401,
        ERROR_CODES.TOKEN_EXPIRED,
      );
    }
    throw new ErrorResponse("Invalid token", 401, ERROR_CODES.TOKEN_INVALID);
  }
};

/** Pulls the token out of `Authorization: Bearer <token>`. */
export const extractBearerToken = (header?: string): string | undefined => {
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  return token || undefined;
};
