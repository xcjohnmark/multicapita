import { NextResponse } from "next/server";
import { z } from "zod";
import { linkStatement } from "@/lib/auth/link";
import { issueNonce } from "@/lib/auth/nonce";
import { buildSiweMessage } from "@/lib/auth/siwe";
import { getViewer } from "@/lib/auth/viewer";
import { isSameOrigin, requestOrigin } from "@/lib/http/origin";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "A valid EVM address is required"),
  chainId: z.number().int().positive().default(8453),
});

/** Challenge for linking another wallet to the signed-in account. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }
  if (rateLimited(`wallet-link-nonce:${clientKey(request)}`, { max: 10 })) {
    return NextResponse.json({ error: { message: "Too many attempts." } }, { status: 429 });
  }
  const viewer = await getViewer();
  if (!viewer || viewer.demo || !viewer.address) {
    return NextResponse.json({ error: { message: "Sign in before linking another wallet." } }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: { message: "Invalid wallet address." } }, { status: 400 });
  if (parsed.data.address.toLowerCase() === viewer.address.toLowerCase()) {
    return NextResponse.json({ error: { message: "That wallet is already your sign-in wallet." } }, { status: 409 });
  }

  const { host, origin } = requestOrigin(request);
  const issued = await issueNonce({ address: parsed.data.address, domain: host });
  const message = buildSiweMessage({
    domain: host,
    address: parsed.data.address,
    statement: linkStatement(viewer.address),
    uri: origin,
    chainId: parsed.data.chainId,
    nonce: issued.nonce,
    issuedAt: issued.issuedAt.toISOString(),
    expirationTime: issued.expiresAt.toISOString(),
  });
  return NextResponse.json({ data: { message } }, { headers: { "cache-control": "no-store" } });
}
