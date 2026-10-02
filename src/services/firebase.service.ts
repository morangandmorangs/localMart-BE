import { DecodedIdToken } from "firebase-admin/auth";

import { getFirebaseAuth } from "../config/firebaseAdmin";
import { ERROR_CODES, ErrorCode } from "../utils/errorResponse";

/**
 * Outcome of verifying a Firebase ID token.
 *
 * Returned rather than thrown so controllers can answer with their own
 * response shape — the caller decides the HTTP body, this decides what
 * happened.
 */
export type VerifyTokenResult =
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; status: number; message: string; code: ErrorCode };

/**
 * Verifies a Firebase ID token against the project's keys.
 *
 * Shared by customer phone-OTP and partner Google sign-in because both hand
 * us an ID token and neither may trust a uid, phone number or email sent in
 * the request body — only what comes back decoded here.
 */
export const verifyFirebaseIdToken = async (
  idToken: string,
): Promise<VerifyTokenResult> => {
  try {
    return { ok: true, decoded: await getFirebaseAuth().verifyIdToken(idToken) };
  } catch (err) {
    // A bad token is the client's problem; an uninitialised Admin SDK is
    // ours, and a 401 would send the client off chasing the wrong fault.
    const message = err instanceof Error ? err.message : "";
    if (message.includes("not initialized")) {
      return {
        ok: false,
        status: 503,
        message: "Authentication is unavailable right now",
        code: ERROR_CODES.FIREBASE_UNAVAILABLE,
      };
    }
    return {
      ok: false,
      status: 401,
      message: "Invalid or expired token",
      code: ERROR_CODES.TOKEN_INVALID,
    };
  }
};
