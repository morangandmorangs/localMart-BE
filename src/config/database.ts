import dotenv from "dotenv";

dotenv.config();

export type DbTarget = "local" | "production";

/**
 * Which database this process talks to.
 *
 * `DB_TARGET=local|production` picks explicitly. Without it, `NODE_ENV=production`
 * means production and anything else means local, so a deployed server needs no
 * extra setting and a laptop never ends up on production by accident.
 */
export const getDbTarget = (): DbTarget => {
  const explicit = process.env.DB_TARGET?.trim().toLowerCase();
  if (explicit === "local" || explicit === "production") return explicit;
  if (explicit) {
    throw new Error(`DB_TARGET must be "local" or "production", got "${explicit}"`);
  }
  return process.env.NODE_ENV === "production" ? "production" : "local";
};

const isLocalHost = (url: string): boolean => {
  try {
    const { hostname, searchParams } = new URL(url);
    // Cloud SQL from Cloud Run is `...@localhost/db?host=/cloudsql/<instance>`:
    // the host is a unix socket path, not this machine's Postgres.
    if (searchParams.get("host")?.startsWith("/cloudsql/")) return false;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
};

/**
 * The connection string for the active target.
 *
 *   local       DATABASE_URL_LOCAL       (falls back to DATABASE_URL)
 *   production  DATABASE_URL_PRODUCTION  (falls back to DATABASE_URL)
 *
 * The plain DATABASE_URL fallback is what a host such as Cloud Run sets.
 * Production never accepts a localhost URL: a laptop whose DATABASE_URL still
 * points at local Postgres must fail loudly rather than "migrate production"
 * against the wrong database.
 */
export const getDatabaseUrl = (target: DbTarget = getDbTarget()): string => {
  const url =
    target === "production"
      ? (process.env.DATABASE_URL_PRODUCTION ?? process.env.DATABASE_URL)
      : (process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL);

  if (!url) {
    const name = target === "production" ? "DATABASE_URL_PRODUCTION" : "DATABASE_URL_LOCAL";
    throw new Error(`No database URL for target "${target}". Set ${name} (or DATABASE_URL).`);
  }
  if (target === "production" && isLocalHost(url)) {
    throw new Error(
      'DB_TARGET is "production" but the database URL points at localhost. ' +
        "Set DATABASE_URL_PRODUCTION to the hosted database.",
    );
  }
  return url;
};

/**
 * The URL the Prisma CLI (migrate, studio, seed) should use.
 *
 * Neon's pooler (PgBouncer) can't run migrations, so production uses the
 * direct connection when one is set: DATABASE_URL_UNPOOLED, which
 * `neon env pull` writes. The server itself keeps the pooled URL.
 *
 * Returns undefined instead of throwing when nothing is configured, so
 * `prisma generate` still works on a build machine with no database.
 */
export const getCliDatabaseUrl = (): string | undefined => {
  try {
    const target = getDbTarget();
    if (target === "production") {
      const direct =
        process.env.DATABASE_URL_PRODUCTION_UNPOOLED ?? process.env.DATABASE_URL_UNPOOLED;
      if (direct) return direct;
    }
    return getDatabaseUrl(target);
  } catch {
    return undefined;
  }
};

/** Host and database name only — safe to log, never includes credentials. */
export const describeDatabase = (url: string = getDatabaseUrl()): string => {
  try {
    const u = new URL(url);
    const host = u.hostname || u.searchParams.get("host") || "unix-socket";
    return `${host}${u.pathname}`;
  } catch {
    return "(unparseable url)";
  }
};
