import { CustomError } from "../types/error.types";

/**
 * Stable, machine-readable error codes.
 *
 * Clients branch on these, never on message text — messages get reworded,
 * codes do not. errorMiddleware serialises `code` alongside the message.
 */
export const ERROR_CODES = {
  // Auth
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  FORBIDDEN: "FORBIDDEN",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",

  // Partner onboarding
  PROFILE_ON_HOLD: "PROFILE_ON_HOLD",

  // Resources
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  VALIDATION_FAILED: "VALIDATION_FAILED",

  // Upstream
  FIREBASE_UNAVAILABLE: "FIREBASE_UNAVAILABLE",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * An error carrying an HTTP status and a stable code.
 *
 * Throw this from services and controllers; errorMiddleware is the only place
 * it gets serialised, and it reads both fields off the instance.
 */
export class ErrorResponse extends Error implements CustomError {
  public statusCode: number;
  public code: ErrorCode;

  constructor(message: string, statusCode: number, code: ErrorCode) {
    super(message);
    this.name = "ErrorResponse";
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace?.(this, ErrorResponse);
  }

  static unauthorized(message = "Not authenticated") {
    return new ErrorResponse(message, 401, ERROR_CODES.UNAUTHENTICATED);
  }

  static invalidCredentials(message = "Invalid email or password") {
    return new ErrorResponse(message, 401, ERROR_CODES.INVALID_CREDENTIALS);
  }

  static forbidden(message = "Not allowed") {
    return new ErrorResponse(message, 403, ERROR_CODES.FORBIDDEN);
  }

  static notFound(message = "Not found") {
    return new ErrorResponse(message, 404, ERROR_CODES.NOT_FOUND);
  }

  static conflict(message = "Already exists") {
    return new ErrorResponse(message, 409, ERROR_CODES.ALREADY_EXISTS);
  }

  static validation(message = "Validation failed") {
    return new ErrorResponse(message, 400, ERROR_CODES.VALIDATION_FAILED);
  }

  static onHold(message: string) {
    return new ErrorResponse(message, 403, ERROR_CODES.PROFILE_ON_HOLD);
  }
}

export default ErrorResponse;
