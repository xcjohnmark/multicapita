import type { Metadata, Viewport } from "next";
import { Onest, JetBrains_Mono, Manufacturing_Consent } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/wallet/wallet-provider";

// Onest regular for everything, 500 for buttons/tags/card titles (DESIGN.md §0).
const onest = Onest({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-onest",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

// Brand wordmark only ("Capita" in the logo). Self-hosted by next/font, so no runtime request
// to fonts.googleapis.com.
const manufacturingConsent = Manufacturing_Consent({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-manufacturing-consent",
});

export const metadata: Metadata = {
  title: "Capita — All your crypto. One place.",
  description:
    "All your crypto. One place. Cross-chain DeFi portfolio management with deterministic guardrails and NEAR Intents settlement.",
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Each route group renders its own chrome: (platform) the near.com hero + tabs, (detail) a
  // compact header, (flow) a narrow centred column. The landing page brings its own navbar.
  return (
    <html
      lang="en"
      className={`h-full ${onest.variable} ${jetbrainsMono.variable} ${manufacturingConsent.variable} antialiased selection:bg-green-500 selection:text-black light`}
    >
      <body className="relative isolate min-h-full bg-canvas font-sans text-ink">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
