# ADR-0007 — PostgreSQL (Neon) on Vercel, replacing local SQLite

- **Status:** accepted — supersedes the storage decision in ADR-0001
- **Date:** 2026-11-13

## Context

ADR-0001 chose SQLite (`better-sqlite3`) so the app ran with `npm install` alone. Capita is now
hosted on Vercel, whose functions have no persistent filesystem: a local database file would lose
sessions, nonces, quotes, positions and the audit log between invocations.

## Decision

- Prisma datasource is `postgresql`, using `@prisma/adapter-pg` (node-postgres).
- Production database is **Neon**, installed from the Vercel Marketplace. The integration was
  added with the `NEON_MCAP_` prefix; `src/lib/db/database-url.ts` reads
  `NEON_MCAP_DATABASE_URL` (pooled, runtime) and `NEON_MCAP_DATABASE_URL_UNPOOLED` (direct,
  migrations), with an explicit `DATABASE_URL` / `DATABASE_URL_UNPOOLED` taking precedence. Values
  are never copied, so Neon can rotate credentials.
- Migrations were reset to a single Postgres `init` migration. The SQLite history held no
  production data.
- Vercel runs `vercel-build` = `prisma migrate deploy && next build`, so schema changes ship with
  the code that needs them.
- Local development uses Docker Postgres on port **5433** (5432 is commonly taken by a native
  Windows Postgres install).
- `/api/cron/reconcile` requires `Authorization: Bearer ${CRON_SECRET}` in production and refuses
  when the secret is unset (`src/lib/http/cron-auth.ts`). Same-origin is not accepted, because a
  request without an `Origin` header passes that check.

## Consequences

- Local setup now needs Docker. Every agent working in this repo needs the new `DATABASE_URL`.
- Preview deployments share the production Neon database unless Neon preview branching is enabled.
- On the Vercel Hobby plan the reconciliation cron runs once a day (`vercel.json`).
- The in-memory rate limiter (`src/lib/http/rate-limit.ts`) is per-instance on serverless; moving
  it to a shared store is follow-up work.
