/**
 * The one account an anonymous `sample`/`dry_run` visitor may act as.
 *
 * Only `prisma/seed.ts` creates it. The fallback must never pick "some user" (for example the
 * oldest row): on a shared deployment that is a real person who signed in, and an anonymous visitor
 * would see their wallets and balances.
 */
export const DEMO_USER_EMAIL = "demo@localhost";
