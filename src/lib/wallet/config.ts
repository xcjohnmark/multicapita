import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { arbitrum as appkitArbitrum, base as appkitBase } from "@reown/appkit/networks";
import { createConfig, http, type Config } from "wagmi";
import { arbitrum, base } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Wallet connection config (client-safe: no secrets).
 *
 * With `NEXT_PUBLIC_REOWN_PROJECT_ID` set, Reown AppKit's Wagmi adapter provides WalletConnect
 * (QR / mobile) and the full wallet list. Without it, wagmi alone discovers every installed browser
 * wallet through EIP-6963, so sign-in still works with no account anywhere. A Reown project id is a
 * public identifier, not a credential.
 */

export const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim() || null;

export const appkitNetworks = [appkitBase, appkitArbitrum] as [typeof appkitBase, typeof appkitArbitrum];

export const wagmiAdapter = reownProjectId
  ? new WagmiAdapter({ projectId: reownProjectId, networks: appkitNetworks, ssr: true })
  : null;

export const wagmiConfig: Config =
  wagmiAdapter?.wagmiConfig ??
  createConfig({
    chains: [base, arbitrum],
    connectors: [injected()],
    transports: { [base.id]: http(), [arbitrum.id]: http() },
    ssr: true,
  });
