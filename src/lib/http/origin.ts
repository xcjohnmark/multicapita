/**
 * Same-origin enforcement for state-changing browser requests.
 *
 * CSRF against a cookie-authenticated JSON API is prevented by three things together: `SameSite=Lax`
 * cookies, a required JSON content type (which forces a preflight for cross-origin callers), and
 * this check. Requests with no `Origin` header — curl, server-to-server — are allowed because they
 * cannot carry a victim's cookie implicitly.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isJsonRequest(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").includes("application/json");
}

/** Resolve the public origin of a request, honouring a proxy. */
export function requestOrigin(request: Request): { origin: string; host: string } {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return { origin: `${proto}://${host}`, host };
}
