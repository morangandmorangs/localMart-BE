import { IAdmin } from "../models/Admin";

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string;
  isActive: boolean;
}

/** One shape for an admin in every response. Never includes the password. */
export const toAdminProfile = (admin: IAdmin): AdminProfile => ({
  id: String(admin._id),
  name: admin.name,
  email: admin.email,
  role: admin.role,
  designation: admin.designation,
  isActive: admin.isActive,
});
