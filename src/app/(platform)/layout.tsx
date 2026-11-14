import { ModeStrip, PlatformFooter } from "@/components/shell/layout-chrome";
import { PlatformHeader } from "@/components/shell/platform-header";
import { BottomNav } from "@/components/shell/top-tabs";
import { getCurrentPortfolio, getCurrentSession } from "@/lib/platform-context";

export default async function PlatformLayout({ children }: LayoutProps<"/">) {
  const [session, portfolio] = await Promise.all([getCurrentSession(), getCurrentPortfolio()]);
  return (
    <div className="flex min-h-dvh flex-col bg-canvas pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <PlatformHeader session={session} totals={portfolio?.totals ?? null} simulated={Boolean(portfolio?.simulatedActivity)} />
      <ModeStrip session={session} />
      <main id="main" className="shell-container flex-1 py-8 md:py-10">
        {children}
      </main>
      <PlatformFooter />
      <BottomNav />
    </div>
  );
}
