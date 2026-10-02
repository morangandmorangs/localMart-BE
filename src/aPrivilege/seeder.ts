import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import Admin from "../models/Admin";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import {
  ADMIN_DESIGNATIONS,
  AdminDesignation,
  ROLES,
} from "../types/auth.types";

interface SeedSpec {
  name: string;
  email: string;
  password?: string;
  designation: AdminDesignation;
}

/**
 * The admin accounts this deployment should have: two managers and one
 * developer.
 *
 * Credentials come from the environment and nothing is hard-coded here — a
 * password committed to the repository is a password everyone with repo
 * access holds. An account whose password variable is unset is skipped
 * rather than created with a guessable default.
 */
const seedSpecs = (): SeedSpec[] => [
  {
    name: process.env.SEED_MANAGER_1_NAME || "Sid",
    email: process.env.SEED_MANAGER_1_EMAIL || "",
    password: process.env.SEED_MANAGER_1_PASSWORD,
    designation: ADMIN_DESIGNATIONS.MANAGER,
  },
  {
    name: process.env.SEED_MANAGER_2_NAME || "Kaushik",
    email: process.env.SEED_MANAGER_2_EMAIL || "",
    password: process.env.SEED_MANAGER_2_PASSWORD,
    designation: ADMIN_DESIGNATIONS.MANAGER,
  },
  {
    name: process.env.SEED_DEVELOPER_NAME || "Ilix",
    email: process.env.SEED_DEVELOPER_EMAIL || "",
    password: process.env.SEED_DEVELOPER_PASSWORD,
    designation: ADMIN_DESIGNATIONS.DEVELOPER,
  },
];

export interface SeedOutcome {
  email: string;
  designation: AdminDesignation;
  status: "created" | "exists" | "skipped";
}

/**
 * Creates any missing admin accounts.
 *
 * Idempotent and deliberately non-destructive: an account that already
 * exists is left exactly as it is. Re-seeding never resets a password, so
 * running this against a live database cannot revert an account whose
 * password has since been changed.
 *
 * Passwords are hashed by the model's pre-save hook, which is why each
 * account goes through `new` + `save()` — an update would bypass the hook
 * and store plaintext.
 */
export const seedAdmins = async (): Promise<SeedOutcome[]> => {
  const outcomes: SeedOutcome[] = [];

  for (const spec of seedSpecs()) {
    const email = spec.email.toLowerCase().trim();

    if (!email || !spec.password) {
      if (email) {
        logger.warn(`Skipped seeding ${email}: its SEED_* password is unset.`);
      }
      outcomes.push({
        email: email || "(unset)",
        designation: spec.designation,
        status: "skipped",
      });
      continue;
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      outcomes.push({
        email,
        designation: existing.designation,
        status: "exists",
      });
      continue;
    }

    const admin = new Admin({
      name: spec.name,
      email,
      password: spec.password,
      role: ROLES.ADMIN,
      designation: spec.designation,
    });
    await admin.save();

    outcomes.push({ email, designation: spec.designation, status: "created" });
    logger.info(`Seeded ${spec.designation} admin: ${email}`);
  }

  return outcomes;
};

/**
 * @desc    Seed the admin accounts
 * @route   POST /api/admin/seed
 * @access  Disabled unless ALLOW_ADMIN_SEED=true
 */
export const seedAdminAccounts = asyncHandler(
  async (_req: Request, res: Response) => {
    // This endpoint mints privileged accounts, so it stays shut unless a
    // deployment opts in. Seeding reachable by default is how a staging URL
    // becomes someone else's admin panel. 404, not 403 — a 403 confirms the
    // route exists.
    if (process.env.ALLOW_ADMIN_SEED !== "true") {
      res.status(404).json({
        success: false,
        message: "Not Found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    const outcomes = await seedAdmins();
    const created = outcomes.filter((o) => o.status === "created").length;

    res.status(created > 0 ? 201 : 200).json({
      success: true,
      message:
        created > 0
          ? `Seeded ${created} admin account(s)`
          : "No new admin accounts were created",
      // Passwords are never echoed back, not even ones just set.
      data: outcomes,
    });
  },
);

export default seedAdminAccounts;
