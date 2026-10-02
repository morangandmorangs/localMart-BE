import { Request } from "express";

/**
 * The four actors in the system. This is the RBAC axis — every authenticated
 * principal is exactly one of these, and `authorize()` gates on it.
 */
export const ROLES = {
  ADMIN: "Admin",
  CUSTOMER: "Customer",
  MERCHANT: "Merchant",
  DRIVER: "Driver",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES = Object.values(ROLES) as Role[];

/**
 * Seniority within the Admin role. Separate from `role` on purpose: an admin
 * is one RBAC actor, and this says what kind. Branch-Admin was dropped —
 * Local Mart has no branches.
 */
export const ADMIN_DESIGNATIONS = {
  SUPER_ADMIN: "Super-Admin",
  MANAGER: "Manager",
  DEVELOPER: "Developer",
} as const;

export type AdminDesignation =
  (typeof ADMIN_DESIGNATIONS)[keyof typeof ADMIN_DESIGNATIONS];

export const ADMIN_DESIGNATION_VALUES = Object.values(
  ADMIN_DESIGNATIONS,
) as AdminDesignation[];

/**
 * Merchants and drivers cannot trade until their documents are checked, so
 * their account exists and can sign in while the profile itself is held.
 */
export const PROFILE_STATUS = {
  /** Signed up, nothing submitted yet. */
  PENDING_DOCUMENTS: "pending-documents",
  /** Documents in, waiting on a human. */
  UNDER_REVIEW: "under-review",
  APPROVED: "approved",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
} as const;

export type ProfileStatus =
  (typeof PROFILE_STATUS)[keyof typeof PROFILE_STATUS];

export const PROFILE_STATUS_VALUES = Object.values(
  PROFILE_STATUS,
) as ProfileStatus[];

/** Only an approved partner may act; every other state is "on hold". */
export const isProfileActive = (status: ProfileStatus): boolean =>
  status === PROFILE_STATUS.APPROVED;

/** How a partner proved who they are. */
export const AUTH_PROVIDERS = {
  PASSWORD: "password",
  GOOGLE: "google",
  PHONE: "phone",
} as const;

export type AuthProvider =
  (typeof AUTH_PROVIDERS)[keyof typeof AUTH_PROVIDERS];

/** What we put in the JWT. Keep it small — it travels on every request. */
export interface JwtPayload {
  id: string;
  role: Role;
  designation?: AdminDesignation;
}

/** A request that has been through `protect`. */
export interface AuthedRequest extends Request {
  auth?: JwtPayload;
}
