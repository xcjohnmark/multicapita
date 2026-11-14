import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Per-browser simulation scope.
 *
 * Anonymous demo visitors all act as the one seeded demo user, so simulated plans and positions
 * are additionally keyed by this random, httpOnly cookie. One visitor's simulated deposits are
 * never visible to another. The key carries no identity and is not a session credential.
 */

export const SIM_COOKIE = "capita_sim";

export async function readSimulationKey(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SIM_COOKIE)?.value ?? null;
  return value && /^[a-f0-9]{32}$/.test(value) ? value : null;
}

/** Route handlers only: returns the existing key or sets a new one. */
export async function ensureSimulationKey(): Promise<string> {
  const existing = await readSimulationKey();
  if (existing) return existing;
  const key = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(SIM_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return key;
}

/** Route handlers only: forget this browser's simulated activity. */
export async function resetSimulationKey(): Promise<void> {
  const store = await cookies();
  store.delete(SIM_COOKIE);
}
