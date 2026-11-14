import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { getPlatformPortfolio } from "@/lib/portfolio/platform";
import { getShellSession } from "@/lib/shell-state";

/**
 * Per-request memoised reads shared by layouts and pages, so the hero balance and the page body
 * come from the same read (and the portfolio is loaded once per request).
 */
export const getCurrentViewer = cache(getViewer);
export const getCurrentSession = cache(getShellSession);
export const getCurrentPortfolio = cache(async () => {
  const viewer = await getCurrentViewer();
  return viewer ? getPlatformPortfolio(viewer) : null;
});
