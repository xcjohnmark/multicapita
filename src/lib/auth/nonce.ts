import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/db/client";

/**
 * Single-use sign-in nonces.
 *
 * The nonce is stored server-side with the address and domain it was issued for. Consumption is a
 * conditional update (`usedAt IS NULL`), so two concurrent verifications cannot both succeed.
 */

export const NONCE_TTL_MS = 5 * 60_000;

export type IssuedNonce = {
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
};

export async function issueNonce(input: { address: string; domain: string }): Promise<IssuedNonce> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  const nonce = randomBytes(16).toString("hex");

  await getPrisma().authNonce.create({
    data: {
      nonce,
      address: input.address.toLowerCase(),
      domain: input.domain,
      issuedAt,
      expiresAt,
    },
  });

  // Opportunistic cleanup: expired nonces have no value and should not accumulate.
  await getPrisma().authNonce.deleteMany({ where: { expiresAt: { lt: issuedAt } } });

  return { nonce, issuedAt, expiresAt };
}

export type NonceConsumption =
  | { ok: true }
  | { ok: false; reason: "unknown" | "used" | "expired" | "mismatch" };

export async function consumeNonce(input: {
  nonce: string;
  address: string;
  domain: string;
  now?: Date;
}): Promise<NonceConsumption> {
  const now = input.now ?? new Date();
  const prisma = getPrisma();

  const row = await prisma.authNonce.findUnique({ where: { nonce: input.nonce } });
  if (!row) return { ok: false, reason: "unknown" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (row.address !== input.address.toLowerCase() || row.domain !== input.domain) {
    return { ok: false, reason: "mismatch" };
  }

  const updated = await prisma.authNonce.updateMany({
    where: { nonce: input.nonce, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });

  return updated.count === 1 ? { ok: true } : { ok: false, reason: "used" };
}
