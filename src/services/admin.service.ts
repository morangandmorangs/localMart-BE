import type { Admin } from "../generated/prisma/client";

/** An admin as read by default — the password hash is omitted. */
type AdminRow = Omit<Admin, "password">;
import { generateToken } from "../utils/jwt";
import { AdminDesignation, ROLES } from "../types/auth.types";

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string;
  isActive: boolean;
}

/** One shape for an admin in every response. Never includes the password. */
export const toAdminProfile = (admin: AdminRow): AdminProfile => ({
  id: admin.id,
  name: admin.name,
  email: admin.email,
  role: ROLES.ADMIN,
  designation: admin.designation,
  isActive: admin.isActive,
});

export const signAdminToken = (admin: Pick<AdminRow, "id" | "designation">): string =>
  generateToken({
    id: admin.id,
    role: ROLES.ADMIN,
    designation: admin.designation as AdminDesignation,
  });
