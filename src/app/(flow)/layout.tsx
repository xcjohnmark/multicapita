import { CompactHeader, ModeStrip } from "@/components/shell/layout-chrome";
import { getCurrentSession } from "@/lib/platform-context";

export default async function FlowLayout({ children }: LayoutProps<"/">) {
  const session = await getCurrentSession();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <CompactHeader session={session} />
      <ModeStrip session={session} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
