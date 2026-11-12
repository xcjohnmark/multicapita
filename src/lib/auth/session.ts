import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Stateless session cookie.
 *
 * `HttpOnly` + signed with HMAC-SHA256. The payload is base64url JSON, not encrypted: it contains
 * only a user id and the wallet address, both of which the user already knows. Nothing secret is
 * ever placed in a cookie.
 *
 * In `live` mode a real `SESSION_SECRET` is mandatory. In sample/dry-run an ephemeral per-process
 * secret is generated so the demo works with no setup; sessions simply do not survive a restart.
 */

export const SESSION_COOKIE = "po_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  address: string;
  iat: number;
  exp: number;
};

let ephemeralSecret: string | null = null;

function signingSecret(): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;

  if (env.APP_DATA_MODE === "live") {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters before running in live mode.",
    );
  }

  ephemeralSecret ??= randomBytes(32).toString("hex");
  return ephemeralSecret;
}

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = createHmac("sha256", signingSecret()).update(body).digest("base64url");
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.address !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp * 1_000 <= Date.now()) return null;
    return {
      userId: parsed.userId,
      address: parsed.address,
      iat: typeof parsed.iat === "number" ? parsed.iat : 0,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Build a fresh payload. One week, fixed, so a stolen cookie expires without a server lookup. */
export function newSessionPayload(userId: string, address: string): SessionPayload {
  const now = Math.floor(Date.now() / 1_000);
  return {
    userId,
    address,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
}

export function isSessionConfigured(): boolean {
  return Boolean(env.SESSION_SECRET);
}
