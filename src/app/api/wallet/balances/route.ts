import { NextResponse } from "next/server";
import { parseAddress, readWalletBalances } from "@/lib/wallet/balances";
import { clientKey, rateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Live ERC-20 / native balances for an address on Base and Arbitrum.
 *
 * Read-only by construction: the address is supplied by the client, nothing is signed, and no
 * price is attached. A failed chain read is returned as a failure, never as a zero balance.
 */

export async function GET(request: Request) {
  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { error: { message: "Too many balance requests. Try again in a minute." } },
      { status: 429 },
    );
  }

  const raw = new URL(request.url).searchParams.get("address") ?? "";
  const address = parseAddress(raw);
  if (!address) {
    return NextResponse.json(
      { error: { message: "A valid 0x address is required." } },
      { status: 400 },
    );
  }

  const balances = await readWalletBalances(address);

  return NextResponse.json({
    data: balances,
    meta: {
      source: "chain rpc",
      note: "Balances read from public RPC at the stated block. No USD valuation is attached because no price source is verified for this request.",
    },
  });
}
