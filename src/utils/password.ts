import bcrypt from "bcryptjs";

/** Hashes a plaintext password. Every write that stores one goes through here. */
export const hashPassword = async (plain: string): Promise<string> =>
  bcrypt.hash(plain, await bcrypt.genSalt(10));

/**
 * Compares a candidate against a stored hash.
 *
 * A Google-only account has no hash, and must never match — comparing against
 * an absent hash would otherwise throw, or worse, be coerced into a pass.
 */
export const matchPassword = async (
  candidate: string,
  hash?: string | null,
): Promise<boolean> => (hash ? bcrypt.compare(candidate, hash) : false);
