import { scopeTokens } from "@/lib/execution/plan/assets";
import type { PlatformPortfolio } from "@/lib/portfolio/platform";
import { chainLabel } from "@/lib/opportunities/tabs";

/**
 * Tokens the wallet flows (Receive / Send / Swap) can pick from: every tracked token on Base and
 * Arbitrum, identified by `(chainId, address)`, with this viewer's balance when they hold it.
 */
export type TokenOption = {
  key: string;
  chainId: number;
  chainName: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  amountAtomic: string;
  priceUsd: number | null;
  isStablecoin: boolean;
};

/**
 * `wallet` set (live mode): balances of that wallet only, since only it can sign. Unset: every
 * wallet together (simulated plans, display).
 */
export function tokenOptions(portfolio: PlatformPortfolio | null, wallet?: string | null): TokenOption[] {
  return scopeTokens()
    .map((token) => {
      const address = token.address.toLowerCase();
      const holding = portfolio?.holdings.find((h) => h.chainId === token.chainId && h.tokenAddress === address);
      return {
        key: `${token.chainId}:${address}`,
        chainId: token.chainId,
        chainName: chainLabel(token.chainId),
        address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        amountAtomic: (wallet
          ? (holding?.wallets.find((w) => w.address === wallet.toLowerCase())?.amountAtomic ?? 0n)
          : (holding?.amountAtomic ?? 0n)
        ).toString(),
        priceUsd: holding?.priceUsd ?? (token.isStablecoin ? 1 : null),
        isStablecoin: Boolean(token.isStablecoin),
      };
    })
    .sort((a, b) => Number(BigInt(b.amountAtomic) > 0n) - Number(BigInt(a.amountAtomic) > 0n));
}

export type WalletTokens = { address: string; tokens: TokenOption[] };

/** Live mode: token options per verified wallet. Simulated: one aggregate entry (address null). */
export function walletTokenOptions(
  portfolio: PlatformPortfolio | null,
  simulated: boolean,
  owned: string[],
  preferred: string | null,
): { wallets: WalletTokens[] | null; tokens: TokenOption[] } {
  if (simulated || owned.length === 0) return { wallets: null, tokens: tokenOptions(portfolio) };
  const ordered = [...owned].sort((a, b) => Number(b === preferred) - Number(a === preferred));
  const wallets = ordered.map((address) => ({ address, tokens: tokenOptions(portfolio, address) }));
  return { wallets, tokens: wallets[0].tokens };
}
