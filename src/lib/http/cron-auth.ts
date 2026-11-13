import { timingSafeEqual } from "node:crypto";

/**
 * Authorization for scheduled jobs (`/api/cron/*`).
 *
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on every invocation. Reconciliation
 * touches every user's quotes and positions, so it is never callable without the secret in
 * production — a missing secret closes the route rather than opening it. Outside production a
 * missing secret is allowed so the job can be triggered locally.
 */
export function isCronAuthorized(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  if (!cronSecret) return nodeEnv !== "production";
  if (!authorizationHeader) return false;

  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorizationHeader);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
