import { IPartner, IPartnerDocument } from "../models/partnerSchema";
import { PROFILE_STATUS, ProfileStatus } from "../types/auth.types";

export interface PartnerProfile {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  provider: string;
  profileStatus: ProfileStatus;
  documents: IPartnerDocument[];
  reviewNote?: string;
  /** False while the profile is held — the client shows the hold UI. */
  canOperate: boolean;
}

/** One shape for a partner in every response, merchant or driver. */
export const toPartnerProfile = (partner: IPartner): PartnerProfile => ({
  id: String(partner._id),
  name: partner.name,
  email: partner.email,
  phoneNumber: partner.phoneNumber,
  provider: partner.provider,
  profileStatus: partner.profileStatus,
  documents: partner.documents,
  reviewNote: partner.reviewNote,
  canOperate: partner.canOperate(),
});

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
