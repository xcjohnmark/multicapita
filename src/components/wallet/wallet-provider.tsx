"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { appkitNetworks, reownProjectId, wagmiAdapter, wagmiConfig } from "@/lib/wallet/config";

// AppKit is created once, at module scope, and only when a Reown project id is configured.
// Self-custody only: no email/social logins, swaps or on-ramp inside the modal.
if (reownProjectId && wagmiAdapter) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId: reownProjectId,
    networks: appkitNetworks,
    defaultNetwork: appkitNetworks[0],
    metadata: {
      name: "Capita",
      description: "Cross-chain portfolio, non-custodial.",
      url: typeof window !== "undefined" ? window.location.origin : "https://multicapita.vercel.app",
      icons: [],
    },
    features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, history: false, send: false },
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#111827",
      "--w3m-border-radius-master": "4px",
      "--w3m-font-family": "var(--font-onest), system-ui, sans-serif",
      "--w3m-z-index": 60,
    },
  });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
