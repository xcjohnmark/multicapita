import type { Metadata, Viewport } from "next";
import { Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { getShellSession } from "@/lib/shell-state";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-figtree",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-jetbrains-mono",
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Session and mode are resolved once here so the header can never show a stale or invented
  // state. Reading cookies makes the shell dynamic, which is the correct trade for honesty.
  const session = await getShellSession();

  return (
    <html
      lang="en"
      className={`h-full ${figtree.variable} ${jetbrainsMono.variable} antialiased selection:bg-green-500 selection:text-black light`}
    >
      <body className="relative isolate min-h-full bg-canvas font-sans text-ink">
        <AppShell session={session}>{children}</AppShell>
      </body>
    </html>
  );
}
