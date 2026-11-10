/**
 * Best-effort in-process rate limiting.
 *
 * Documented as non-distributed: it protects a single deployment from accidental loops, not from a
 * determined attacker. Every limit is per client key, keyed on the first `x-forwarded-for` entry
 * when present and on "local" otherwise.
 */

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function rateLimited(
  key: string,
  options: { max?: number; windowMs?: number; now?: number } = {},
): boolean {
  const max = options.max ?? 30;
  const windowMs = options.windowMs ?? WINDOW_MS;
  const now = options.now ?? Date.now();

  const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 1_000) hits.clear();
  return recent.length > max;
}
