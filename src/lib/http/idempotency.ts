import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/db/client";

/**
 * Idempotency for state-changing HTTP requests.
 *
 * A double-click on "Prepare move" must not create two deposit addresses, and a retried request
 * after a timeout must not deposit twice. The client sends `Idempotency-Key`; the server stores
 * the exact response and replays it. Reusing a key with a different body is a conflict, not a
 * replay.
 *
 * The uniqueness constraint is the real guard: two concurrent requests race to insert, one wins,
 * the loser reads the winner's row.
 */

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export type StoredResponse = {
  status: number;
  body: unknown;
};

export function readIdempotencyKey(request: Request): string | null {
  const value = request.headers.get("idempotency-key");
  if (!value) return null;
  return KEY_PATTERN.test(value) ? value : null;
}

export function requestHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/** Deterministic JSON: object keys sorted, so two equivalent bodies hash identically. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

export type IdempotencyLookup =
  | { kind: "miss" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "conflict" };

export async function lookupIdempotency(input: {
  userId: string;
  scope: string;
  key: string;
  hash: string;
}): Promise<IdempotencyLookup> {
  const row = await getPrisma().idempotencyKey.findUnique({
    where: {
      userId_scope_key: {
        userId: input.userId,
        scope: input.scope,
        key: input.key,
      },
    },
  });

  if (!row) return { kind: "miss" };

  // Expired keys are reusable; an old response must not be replayed into a new market.
  if (Date.now() - row.createdAt.getTime() > MAX_AGE_MS) return { kind: "miss" };

  if (row.requestHash !== input.hash) return { kind: "conflict" };

  return { kind: "replay", status: row.statusCode, body: row.responseJson };
}

/**
 * Persist a response for a key. A concurrent insert loses the race; the winner's row is then
 * returned so both callers observe the same answer.
 */
export async function saveIdempotency(input: {
  userId: string;
  scope: string;
  key: string;
  hash: string;
  response: StoredResponse;
}): Promise<StoredResponse> {
  try {
    await getPrisma().idempotencyKey.create({
      data: {
        userId: input.userId,
        scope: input.scope,
        key: input.key,
        requestHash: input.hash,
        statusCode: input.response.status,
        responseJson: (input.response.body ?? null) as object,
      },
    });
    return input.response;
  } catch {
    const existing = await getPrisma().idempotencyKey.findUnique({
      where: {
        userId_scope_key: { userId: input.userId, scope: input.scope, key: input.key },
      },
    });
    if (existing && existing.requestHash === input.hash) {
      return { status: existing.statusCode, body: existing.responseJson };
    }
    throw new Error("Idempotency key was reused with a different request body.");
  }
}
