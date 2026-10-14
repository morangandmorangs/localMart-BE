import prisma from "../config/prisma";
import { generateToken } from "../utils/jwt";
import {
  PROFILE_STATUS,
  ProfileStatus,
  Role,
  isProfileActive,
} from "../types/auth.types";

/** A document a partner must submit before the profile is released. */
export interface PartnerDocument {
  kind: string;
  /** Where the file lives once uploaded (Cloudinary secure_url). */
  url: string;
  submittedAt: string;
}

/**
 * The columns Merchant and Driver share. Both tables repeat them, so the
 * controller can be written once against this shape.
 */
export interface PartnerRow {
  id: string;
  name: string;
  /** Null only for a farmer who signed up with a phone OTP. */
  email: string | null;
  phoneNumber: string | null;
  /** Hidden unless asked for with `omit: { password: false }`. */
  password?: string | null;
  provider: string;
  firebaseUid: string | null;
  profileStatus: string;
  documents: unknown;
  reviewNote: string | null;
  reviewedAt: Date | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  /** Merchants only. */
  businessTypes?: string[];
}

/**
 * The slice of a Prisma delegate the partner controller uses. Merchant and
 * Driver delegates have different generated types, so a lookup table over
 * them does not reconcile; describing just these calls keeps one controller.
 */
export interface PartnerRepo {
  findById(id: string): Promise<PartnerRow | null>;
  findByEmail(email: string, withPassword?: boolean): Promise<PartnerRow | null>;
  findByFirebaseUid(uid: string): Promise<PartnerRow | null>;
  create(data: Record<string, unknown>): Promise<PartnerRow>;
  update(id: string, data: Record<string, unknown>): Promise<PartnerRow>;
  list(status?: string): Promise<PartnerRow[]>;
}

interface PartnerDelegate {
  findUnique(args: Record<string, unknown>): Promise<PartnerRow | null>;
  findMany(args: Record<string, unknown>): Promise<PartnerRow[]>;
  create(args: Record<string, unknown>): Promise<PartnerRow>;
  update(args: Record<string, unknown>): Promise<PartnerRow>;
}

const repoFor = (delegate: PartnerDelegate): PartnerRepo => ({
  findById: (id) => delegate.findUnique({ where: { id } }),
  findByEmail: (email, withPassword = false) =>
    delegate.findUnique({
      where: { email },
      ...(withPassword ? { omit: { password: false } } : {}),
    }),
  findByFirebaseUid: (firebaseUid) =>
    delegate.findUnique({ where: { firebaseUid } }),
  create: (data) => delegate.create({ data }),
  update: (id, data) => delegate.update({ where: { id }, data }),
  list: (status) =>
    delegate.findMany({
      where: status ? { profileStatus: status } : {},
      orderBy: { createdAt: "desc" },
    }),
});

export const merchantRepo = repoFor(
  prisma.merchant as unknown as PartnerDelegate,
);
export const driverRepo = repoFor(prisma.driver as unknown as PartnerDelegate);
export const farmerRepo = repoFor(prisma.farmer as unknown as PartnerDelegate);

export interface PartnerProfile {
  id: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  provider: string;
  profileStatus: ProfileStatus;
  documents: PartnerDocument[];
  reviewNote?: string;
  /** False while the profile is held — the client shows the hold UI. */
  canOperate: boolean;
  /** Merchants only: what kind of business this is. */
  businessTypes?: string[];
}

/** An active account whose profile has been approved may trade. */
export const canOperate = (partner: PartnerRow): boolean =>
  partner.isActive && isProfileActive(partner.profileStatus as ProfileStatus);

export const readDocuments = (partner: PartnerRow): PartnerDocument[] =>
  Array.isArray(partner.documents)
    ? (partner.documents as PartnerDocument[])
    : [];

/** One shape for a partner in every response, merchant or driver. */
export const toPartnerProfile = (partner: PartnerRow): PartnerProfile => ({
  id: partner.id,
  name: partner.name,
  email: partner.email ?? undefined,
  phoneNumber: partner.phoneNumber ?? undefined,
  provider: partner.provider,
  profileStatus: partner.profileStatus as ProfileStatus,
  documents: readDocuments(partner),
  reviewNote: partner.reviewNote ?? undefined,
  canOperate: canOperate(partner),
  ...(partner.businessTypes ? { businessTypes: partner.businessTypes } : {}),
});

export const signPartnerToken = (partner: PartnerRow, role: Role): string =>
  generateToken({ id: partner.id, role });

/** Statuses a reviewer may move a profile to. */
export const REVIEWABLE_STATUSES: ProfileStatus[] = [
  PROFILE_STATUS.APPROVED,
  PROFILE_STATUS.REJECTED,
  PROFILE_STATUS.SUSPENDED,
  PROFILE_STATUS.UNDER_REVIEW,
];

/**
 * Where a profile lands after documents are submitted.
 *
 * Re-submitting after a rejection puts the profile back in the queue, but an
 * already-approved partner is not knocked out of service for adding a
 * document — that would take a working shop offline for a routine upload.
 */
export const nextStatusAfterSubmission = (
  current: ProfileStatus,
): ProfileStatus =>
  current === PROFILE_STATUS.APPROVED
    ? PROFILE_STATUS.APPROVED
    : PROFILE_STATUS.UNDER_REVIEW;

/** A suspended account is a decision, not a queue state — no re-submitting. */
export const canSubmitDocuments = (current: ProfileStatus): boolean =>
  current !== PROFILE_STATUS.SUSPENDED;

export interface DocumentSubmission {
  kind: string;
  url: string;
}

/** Validates a submission payload, returning the first problem found. */
export const validateSubmissions = (
  submissions: unknown,
): string | undefined => {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return "At least one document is required";
  }
  for (const doc of submissions) {
    if (!doc?.kind || !doc?.url) return "Each document needs a kind and a url";
  }
  return undefined;
};
