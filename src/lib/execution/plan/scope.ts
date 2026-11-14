import type { Viewer } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { ensureSimulationKey, readSimulationKey } from "./sim-session";

/**
 * Where a viewer's plans settle.
 *
 * Outside live mode, and always for the anonymous demo viewer, plans are simulated. Simulated
 * rows are scoped so that nobody sees anyone else's simulation:
 *   - the shared demo account: by this browser's random `capita_sim` cookie;
 *   - a signed-in wallet: by its own user id (`user:<id>`), so it follows them across devices.
 */

export function isSimulatedFor(viewer: Viewer): boolean {
  return env.APP_DATA_MODE !== "live" || viewer.demo;
}

/** Server components: the current scope, or null when this browser has no simulation yet. */
export async function readSimulationScope(viewer: Viewer): Promise<string | null> {
  if (!isSimulatedFor(viewer)) return null;
  if (!viewer.demo) return `user:${viewer.userId}`;
  return readSimulationKey();
}

/** Route handlers: the scope for a new simulated plan (sets the cookie when needed). */
export async function ensureSimulationScope(viewer: Viewer): Promise<string | null> {
  if (!isSimulatedFor(viewer)) return null;
  if (!viewer.demo) return `user:${viewer.userId}`;
  return ensureSimulationKey();
}
