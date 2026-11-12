import { NextResponse } from "next/server";
import { z } from "zod";
import { issueNonce, NONCE_TTL_MS } from "@/lib/auth/nonce";
import { buildSiweMessage } from "@/lib/auth/siwe";
import { isSameOrigin, requestOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "A valid EVM address is required"),
  chainId: z.number().int().positive().default(8453),
});

const STATEMENT =
  "Sign in to Capita. This proves you control this wallet. It does not authorise any transaction.";

/**
 * Issue a single-use SIWE challenge.
 *
 * The message is built here, not by the client, so the nonce and domain are always the server's.
 * The client signs the exact string it receives and posts it back.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`auth:${clientKey(request)}`, { max: 10 })) {
    return NextResponse.json({ error: { message: "Too many attempts." } }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "Invalid sign-in request.",
          fields: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const { host, origin } = requestOrigin(request);
  const issued = await issueNonce({ address: parsed.data.address, domain: host });

  const message = buildSiweMessage({
    domain: host,
    address: parsed.data.address,
    statement: STATEMENT,
    uri: origin,
    chainId: parsed.data.chainId,
    nonce: issued.nonce,
    issuedAt: issued.issuedAt.toISOString(),
    expirationTime: issued.expiresAt.toISOString(),
  });

  return NextResponse.json(
    {
      data: {
        message,
        nonce: issued.nonce,
        issuedAt: issued.issuedAt.toISOString(),
        expiresAt: issued.expiresAt.toISOString(),
        ttlSeconds: Math.floor(NONCE_TTL_MS / 1_000),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
