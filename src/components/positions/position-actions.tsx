"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function PositionActions({
  strategyType,
  chainId,
  currentValueUsd,
  contractAddress,
}: {
  strategyType: string;
  chainId: number;
  currentValueUsd: number | null;
  contractAddress?: string | null;
}) {
  const safeAmount = Math.max(1, Math.round(currentValueUsd ?? 10));

  if (strategyType === "lending") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/execute?action=aave_withdraw&chainId=${chainId}&amount=${safeAmount}`}
          className="btn btn-secondary h-7 px-2.5 text-xs"
        >
          <span>Withdraw</span>
          <ArrowUpRight className="size-3" />
        </Link>
        <Link
          href={`/execute?action=aave_supply&chainId=${chainId}&amount=10`}
          className="btn btn-secondary h-7 px-2.5 text-xs"
        >
          <span>Add</span>
        </Link>
      </div>
    );
  }

  if (strategyType === "stablecoin_lp") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/execute?action=uniswap_collect&chainId=${chainId}`}
          className="btn btn-secondary h-7 px-2.5 text-xs"
        >
          <span>Collect Fees</span>
          <ArrowUpRight className="size-3" />
        </Link>
        <Link
          href={`/execute?action=uniswap_mint&chainId=${chainId}&amount=10`}
          className="btn btn-secondary h-7 px-2.5 text-xs"
        >
          <span>Add Liquidity</span>
        </Link>
      </div>
    );
  }

  if (strategyType === "tokenized_equity") {
    const qs = new URLSearchParams({
      action: "equity_swap",
      chainId: String(chainId),
      equityDirection: "sell",
      amount: String(safeAmount),
    });
    if (contractAddress) qs.set("contract", contractAddress);
    return (
      <Link href={`/execute?${qs.toString()}`} className="btn btn-secondary h-7 px-2.5 text-xs">
        <span>Sell to USDC</span>
        <ArrowUpRight className="size-3" />
      </Link>
    );
  }

  return (
    <Link
      href={`/execute?direction=${chainId === 42161 ? "arb-to-base" : "base-to-arb"}&amount=${safeAmount}`}
      className="btn btn-secondary h-7 px-2.5 text-xs"
    >
      <span>Redeem / Move</span>
      <ArrowUpRight className="size-3" />
    </Link>
  );
}
