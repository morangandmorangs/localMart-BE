# localMart-BE

Express 5 + TypeScript API for the Local Mart customer, merchant and driver apps. Data lives in PostgreSQL, accessed through Prisma 7.

## Database setup (macOS)

```bash
brew install postgresql@17
brew services start postgresql@17
createdb localmart            # Homebrew's superuser is your macOS user
```

In `.env`:

```
DATABASE_URL_LOCAL=postgresql://<your-mac-username>@localhost:5432/localmart?schema=public
```

Then:

```bash
npm install            # also runs `prisma generate`
npm run db:migrate     # apply migrations (creates the tables)
npm run db:seed        # admin accounts (SEED_* in .env) + demo catalogue
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run db:studio` | Opens Prisma Studio, a browser GUI to browse and edit rows |
| `npm run db:migrate` | Creates and applies a migration after you edit `prisma/schema.prisma` |
| `npm run db:seed` | Idempotent seed of admins and the demo catalogue (local) |
| `npm run db:generate` | Regenerates the Prisma client into `src/generated/` (git-ignored) |

Rules the database enforces itself (Rx only in medicine, non-negative prices and stock, rating 0–5, valid status values) are `CHECK` constraints at the end of the init migration.

## Local vs production database

`src/config/database.ts` picks the database for the server **and** the Prisma CLI.

| | Local | Production |
| --- | --- | --- |
| Selected by | default, or `DB_TARGET=local` | `NODE_ENV=production`, or `DB_TARGET=production` |
| URL variable | `DATABASE_URL_LOCAL` | `DATABASE_URL_PRODUCTION` |
| Fallback | `DATABASE_URL` | `DATABASE_URL` (what Cloud Run sets) |

Production refuses a `localhost` URL, so a laptop can't run production commands against the wrong database. The server logs `[local]` or `[production]` plus the host on startup.

Run against production from your Mac (put the hosted URL in `.env` as `DATABASE_URL_PRODUCTION`):

```bash
npm run db:deploy:prod     # apply migrations
npm run db:seed:prod       # seed once (needs the explicit confirm built into the script)
npm run db:studio:prod     # browse production data (be careful, edits are live)
```

Cloud SQL from Cloud Run uses a socket URL:
`postgresql://USER:PASS@localhost/DB?host=/cloudsql/PROJECT:REGION:INSTANCE`

### Neon (production database)

The Neon project is linked through `neon.ts`. `neon env pull` writes `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) into `.env`.

- The server uses the **pooled** URL (`DATABASE_URL_PRODUCTION`, else `DATABASE_URL`) over `pg` via the Prisma adapter.
- Migrations, seeding and Studio use the **direct** URL (`DATABASE_URL_UNPOOLED`) in production, because the pooler can't run migrations.
- On Cloud Run set `DATABASE_URL` to the pooled Neon URL.
- A free Neon compute suspends when idle, so the first request or migration after a pause can fail once with `P1001`. Retry it.
