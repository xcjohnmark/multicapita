import "@/lib/wallet/provider";
import { getChain } from "@/lib/chains";

/**
 * Ensures the user's browser wallet is on the correct origin chain before signing.
 * Prevents transaction execution on the wrong network when dealing with real funds.
 */

const CHAIN_METADATA: Record<
  number,
  {
    chainId: `0x${string}`;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  }
> = {
  8453: {
    chainId: "0x2105",
    chainName: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  },
  42161: {
    chainId: "0xa4b1",
    chainName: "Arbitrum One",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://arbiscan.io"],
  },
};

export async function ensureWalletChain(targetChainId: number): Promise<{ ok: boolean; error?: string }> {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!provider) {
    return { ok: false, error: "No injected wallet detected." };
  }

  const meta = CHAIN_METADATA[targetChainId];
  if (!meta) {
    const chain = getChain(targetChainId);
    return { ok: false, error: `Unsupported network ${chain?.name ?? targetChainId}` };
  }

  try {
    const currentChainHex = (await provider.request({ method: "eth_chainId" })) as string;
    if (currentChainHex.toLowerCase() === meta.chainId.toLowerCase()) {
      return { ok: true };
    }

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: meta.chainId }],
      });
      return { ok: true };
    } catch (switchError: unknown) {
      const err = switchError as { code?: number };
      // 4902 indicates chain has not been added to wallet
      if (err.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [meta],
        });
        return { ok: true };
      }
      return {
        ok: false,
        error: `Please switch your wallet to ${meta.chainName} to execute this transaction.`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to switch wallet network.",
    };
  }
}
