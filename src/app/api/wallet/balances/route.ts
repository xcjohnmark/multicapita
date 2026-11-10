import { NextResponse } from "next/server";
import { parseAddress, readWalletBalances } from "@/lib/wallet/balances";

export const dynamic = "force-dynamic";

/**
 * Live ERC-20 / native balances for an address on Base and Arbitrum.
 *
 * Read-only by construction: the address is supplied by the client, nothing is signed, and no
 * price is attached. A failed chain read is returned as a failure, never as a zero balance.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map<string, number[]>();

function rateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 1_000) hits.clear();
  return recent.length > MAX_REQUESTS;
}

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
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
