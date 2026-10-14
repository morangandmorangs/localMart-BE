import "dotenv/config";

import { describeDatabase, getDatabaseUrl, getDbTarget } from "../src/config/database";
import prisma from "../src/config/prisma";
import { seedAdmins } from "../src/aPrivilege/seeder";
import { seedCatalog } from "../src/aPrivilege/catalogSeeder";

/**
 * `npm run db:seed` — admin accounts (from SEED_* env vars) and the demo
 * catalogue. Idempotent: existing rows are left alone.
 */
const main = async () => {
  const target = getDbTarget();
  console.log(`Seeding [${target}] ${describeDatabase(getDatabaseUrl())}`);
  // Seeding writes admin accounts, so production needs an explicit yes.
  if (target === "production" && process.env.CONFIRM_PRODUCTION_SEED !== "yes") {
    throw new Error("Refusing to seed production. Re-run with CONFIRM_PRODUCTION_SEED=yes");
  }
  console.log("Admins:", await seedAdmins());
  console.log("Catalogue:", await seedCatalog());
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
