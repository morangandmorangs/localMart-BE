import "dotenv/config";
import { defineConfig } from "prisma/config";

import { getCliDatabaseUrl } from "./src/config/database";

// The Prisma CLI (migrate, studio, seed) follows the same DB_TARGET switch as
// the server, so `npm run db:deploy:prod` can only ever hit production. In
// production it prefers Neon's direct (unpooled) URL, which migrations need.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node --transpile-only prisma/seed.ts",
  },
  datasource: { url: getCliDatabaseUrl() },
});
