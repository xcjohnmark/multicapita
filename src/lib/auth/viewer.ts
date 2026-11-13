import { getPrisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { DEMO_USER_EMAIL } from "./demo-user";
import { readSession } from "./session";

/**
 * Who the request is acting as.
 *
 * In `live` mode there is no fallback: no session means no viewer, and every money path returns
 * 401. In `sample`/`dry_run` the seeded demo user (and only that user, see `DEMO_USER_EMAIL`) is
 * used so the product is explorable without a wallet, but the viewer is flagged `demo: true` and
 * the UI must say so. Without a seeded demo user there is no anonymous viewer. A demo viewer can never
 * execute, because execution also requires live mode.
 */

export type Viewer = {
  userId: string;
  email: string | null;
  address: string | null;
  demo: boolean;
};

export async function getViewer(): Promise<Viewer | null> {
  const session = await readSession();
  const prisma = getPrisma();

  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true },
    });
    if (user) {
      return {
        userId: user.id,
        email: user.email,
        address: session.address,
        demo: false,
      };
    }
    // A signed cookie pointing at a deleted user is not a viewer.
    return null;
  }

  if (env.APP_DATA_MODE === "live") return null;

  const demoUser = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
    select: { id: true, email: true },
  });
  if (!demoUser) return null;

  return {
    userId: demoUser.id,
    email: demoUser.email,
    address: null,
    demo: true,
  };
}

/** True when the viewer is allowed to act on the supplied wallet address. */
export function viewerOwnsAddress(viewer: Viewer, address: string): boolean {
  return viewer.address !== null && viewer.address.toLowerCase() === address.toLowerCase();
}
