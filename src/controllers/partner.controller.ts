import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { Model } from "mongoose";

import { IPartner } from "../models/partnerSchema";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import { verifyFirebaseIdToken } from "../services/firebase.service";
import {
  REVIEWABLE_STATUSES,
  canSubmitDocuments,
  nextStatusAfterSubmission,
  toPartnerProfile,
  validateSubmissions,
} from "../services/partner.service";
import {
  AUTH_PROVIDERS,
  AuthedRequest,
  PROFILE_STATUS,
  ProfileStatus,
  Role,
} from "../types/auth.types";

/**
 * Merchant and driver endpoints are identical in shape — same sign-in, same
 * document hold — so both route files mount handlers built here against
 * their own model.
 *
 * @param model  the partner model to read and write.
 * @param label  how to name this partner kind in messages ("Merchant").
 * @param role   the role reported back to the client.
 */
export const createPartnerController = <T extends IPartner>(
  model: Model<T>,
  label: string,
  role: Role,
) => ({
  /**
   * @desc    Register a partner. The profile starts held.
   * @route   POST /register
   * @access  Public
   */
  register: asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, phoneNumber } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        message: "Name, email and password are required",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    if (String(password).length < 6) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const normalisedEmail = String(email).toLowerCase().trim();

    if (await model.findOne({ email: normalisedEmail })) {
      res.status(409).json({
        success: false,
        message: `A ${label.toLowerCase()} with this email already exists`,
        code: ERROR_CODES.ALREADY_EXISTS,
      });
      return;
    }

    // profileStatus is never taken from the body — a registration that could
    // set it to "approved" would hand out an unreviewed partner.
    const partner = new model({
      name,
      email: normalisedEmail,
      password,
      phoneNumber,
      provider: AUTH_PROVIDERS.PASSWORD,
      profileStatus: PROFILE_STATUS.PENDING_DOCUMENTS,
    } as Partial<T>);
    await partner.save();

    const token = partner.getSignedJwtToken();
    logger.info(`${label} registered: ${partner.email}`);

    res.status(201).json({
      success: true,
      message: "Registration successful. Upload your documents for review.",
      data: {
        id: partner._id,
        name: partner.name,
        email: partner.email,
        role,
        profileStatus: partner.profileStatus,
        canOperate: partner.canOperate(),
        token,
      },
    });
  }),

  /**
   * @desc    Sign in with email and password
   * @route   POST /login
   * @access  Public
   *
   * A held partner still gets a token: they need to be inside to upload
   * documents and watch their status. The hold is enforced per-route by
   * requireApprovedProfile, not at this gate.
   */
  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const partner = await model
      .findOne({ email: String(email).toLowerCase().trim() })
      .select("+password");

    // One response for both failures, so this cannot enumerate accounts.
    if (!partner || !(await partner.matchPassword(password))) {
      logger.info(`Failed ${label} login: ${email}`);
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
        code: ERROR_CODES.INVALID_CREDENTIALS,
      });
      return;
    }

    if (!partner.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is deactivated",
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
      return;
    }

    partner.lastLoginAt = new Date();
    await partner.save();

    const token = partner.getSignedJwtToken();
    logger.info(`${label} logged in: ${partner.email}`);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        id: partner._id,
        name: partner.name,
        email: partner.email,
        role,
        profileStatus: partner.profileStatus,
        canOperate: partner.canOperate(),
        token,
      },
    });
  }),

  /**
   * @desc    Sign in with Google, proved by a Firebase ID token
   * @route   POST /auth/google
   * @access  Public
   */
  loginWithGoogle: asyncHandler(async (req: Request, res: Response) => {
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
      logger.info(`Failed ${label} Google login: token rejected`);
      res.status(verified.status).json({
        success: false,
        message: verified.message,
        code: verified.code,
      });
      return;
    }

    const { uid, email: googleEmail, email_verified, name } = verified.decoded;

    // An unverified email must not link to an existing account — otherwise
    // anyone could claim a partner by signing up with their address.
    if (!googleEmail || email_verified === false) {
      res.status(400).json({
        success: false,
        message: "A verified Google email is required to sign in",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const email = googleEmail.toLowerCase();
    let partner = await model.findOne({ firebaseUid: uid });
    let isNew = false;

    if (!partner) {
      // Same inbox, same person: link rather than duplicate.
      partner = await model.findOne({ email });

      if (partner) {
        partner.firebaseUid = uid;
      } else {
        partner = new model({
          name: name || email.split("@")[0],
          email,
          firebaseUid: uid,
          provider: AUTH_PROVIDERS.GOOGLE,
          profileStatus: PROFILE_STATUS.PENDING_DOCUMENTS,
        } as Partial<T>);
        isNew = true;
      }
    }

    if (!partner.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is deactivated",
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
      return;
    }

    partner.lastLoginAt = new Date();
    await partner.save();

    const token = partner.getSignedJwtToken();
    logger.info(`${label} logged in with Google: ${partner.email}`);

    res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew ? "Account created" : "Login successful",
      data: {
        id: partner._id,
        name: partner.name,
        email: partner.email,
        role,
        profileStatus: partner.profileStatus,
        canOperate: partner.canOperate(),
        isNew,
        token,
      },
    });
  }),

  /**
   * @desc    The partner's own profile, including why it is held
   * @route   GET /me
   * @access  Merchant | Driver
   */
  getProfile: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const partner = await model.findById(req.auth?.id);

    if (!partner) {
      res.status(404).json({
        success: false,
        message: `${label} not found`,
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    res.status(200).json({ success: true, data: toPartnerProfile(partner) });
  }),

  /**
   * @desc    Submit documents and enter the review queue
   * @route   POST /me/documents
   * @access  Merchant | Driver
   *
   * Takes already-hosted URLs; the upload itself belongs to the
   * multer/Cloudinary pipeline, which is still a stub.
   */
  submitDocuments: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { documents } = req.body;

    const problem = validateSubmissions(documents);
    if (problem) {
      res.status(400).json({
        success: false,
        message: problem,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const partner = await model.findById(req.auth?.id);

    if (!partner) {
      res.status(404).json({
        success: false,
        message: `${label} not found`,
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    if (!canSubmitDocuments(partner.profileStatus)) {
      res.status(403).json({
        success: false,
        message: "This account is suspended. Contact support.",
        code: ERROR_CODES.PROFILE_ON_HOLD,
      });
      return;
    }

    partner.documents.push(
      ...documents.map((doc: { kind: string; url: string }) => ({
        kind: doc.kind,
        url: doc.url,
        submittedAt: new Date(),
      })),
    );

    const next = nextStatusAfterSubmission(partner.profileStatus);
    if (next !== partner.profileStatus) {
      partner.profileStatus = next;
      partner.reviewNote = undefined;
    }
    await partner.save();

    logger.info(
      `${label} submitted ${documents.length} document(s): ${partner.email}`,
    );

    res.status(200).json({
      success: true,
      message: "Documents submitted for review",
      data: toPartnerProfile(partner),
    });
  }),

  /**
   * @desc    The review queue
   * @route   GET /?status=under-review
   * @access  Admin
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as ProfileStatus | undefined;
    const filter = status ? { profileStatus: status } : {};
    const partners = await model.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: partners.length,
      data: partners.map(toPartnerProfile),
    });
  }),

  /**
   * @desc    Approve, reject or suspend a held profile
   * @route   PATCH /:id/review
   * @access  Admin (Super-Admin | Manager)
   */
  review: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { status, note } = req.body;

    if (!REVIEWABLE_STATUSES.includes(status)) {
      res.status(400).json({
        success: false,
        message: `Status must be one of: ${REVIEWABLE_STATUSES.join(", ")}`,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    // Anything other than an approval has to say why, or the partner is left
    // held with no idea what to fix.
    if (status !== PROFILE_STATUS.APPROVED && !note) {
      res.status(400).json({
        success: false,
        message: "A note is required when not approving",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const partner = await model.findById(req.params.id);

    if (!partner) {
      res.status(404).json({
        success: false,
        message: `${label} not found`,
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    partner.profileStatus = status;
    partner.reviewNote = note;
    partner.reviewedAt = new Date();
    await partner.save();

    logger.info(
      `${label} ${partner.email} set to ${status} by admin ${req.auth?.id}`,
    );

    res.status(200).json({
      success: true,
      message: `${label} profile ${status}`,
      data: toPartnerProfile(partner),
    });
  }),
});
