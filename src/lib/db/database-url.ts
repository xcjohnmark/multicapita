/**
 * Resolves Postgres connection strings from the environment. Pure and import-free so that
 * `prisma.config.ts`, `prisma/seed.ts` and `src/lib/env.ts` all share one rule.
 *
 * On Vercel the Neon Marketplace integration was installed with the `NEON_MCAP_` prefix, so it
 * exposes `NEON_MCAP_DATABASE_URL` (pooled) and `NEON_MCAP_DATABASE_URL_UNPOOLED` (direct). Reading
 * them here, rather than copying their values into `DATABASE_URL`, keeps credential rotation in
 * Neon's hands. An explicit `DATABASE_URL` always wins.
 */

export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/capita";

type Env = Record<string, string | undefined>;

const present = (value: string | undefined) =>
  value !== undefined && value.trim() !== "" ? value : undefined;

/** Pooled URL for the running app. */
export function resolveDatabaseUrl(env: Env = process.env): string {
  return present(env.DATABASE_URL) ?? present(env.NEON_MCAP_DATABASE_URL) ?? LOCAL_DATABASE_URL;
}

/**
 * node-postgres currently treats `sslmode=require|prefer|verify-ca` as `verify-full` and warns that
 * pg v9 will switch them to weaker libpq semantics. Neon URLs carry `sslmode=require`; pinning
 * `verify-full` keeps today's certificate verification and silences the per-cold-start warning.
 * Only for the runtime node-postgres client — Prisma's migration engine parses URLs itself.
 */
export function withVerifiedSsl(url: string): string {
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/, "$1verify-full");
}

/** Direct (unpooled) URL for migrations; falls back to the pooled URL, which is direct locally. */
export function resolveMigrationUrl(env: Env = process.env): string {
  return (
    present(env.DATABASE_URL_UNPOOLED) ??
    present(env.NEON_MCAP_DATABASE_URL_UNPOOLED) ??
    resolveDatabaseUrl(env)
  );
}
