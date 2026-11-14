import { CompactHeader, ModeStrip, PlatformFooter } from "@/components/shell/layout-chrome";
import { BottomNav } from "@/components/shell/top-tabs";
import { getCurrentSession } from "@/lib/platform-context";

export default async function DetailLayout({ children }: LayoutProps<"/">) {
  const session = await getCurrentSession();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <CompactHeader session={session} />
      <ModeStrip session={session} />
      <main id="main" className="shell-container flex-1 py-6 md:py-10">
        {children}
      </main>
      <PlatformFooter />
      <BottomNav />
    </div>
  );
}
