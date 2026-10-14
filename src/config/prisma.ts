import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { getDatabaseUrl } from "./database";

/**
 * The one Prisma client for the process.
 *
 * Credentials are hidden by default (the old `select: false`): a query that
 * needs a password hash must ask for it with `omit: { password: false }`, so
 * a profile response can never leak one by forgetting to strip it.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
  omit: {
    admin: { password: true },
    merchant: { password: true },
    driver: { password: true },
  },
});

export default prisma;
