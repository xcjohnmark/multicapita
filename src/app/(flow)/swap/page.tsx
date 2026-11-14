import { FlowPage } from "@/components/shell/layout-chrome";
import { SwapFlow } from "@/components/wallet/swap-flow";
import { isSimulatedFor } from "@/lib/execution/plan/scope";
import { getCurrentPortfolio, getCurrentViewer } from "@/lib/platform-context";
import { walletTokenOptions } from "@/lib/platform-tokens";
import { ownedAddresses } from "@/lib/wallet/accounts";

export const dynamic = "force-dynamic";

export default async function SwapPage({ searchParams }: PageProps<"/swap">) {
  const [viewer, portfolio, sp] = await Promise.all([getCurrentViewer(), getCurrentPortfolio(), searchParams]);
  const simulated = viewer ? isSimulatedFor(viewer) : true;
  const owned = viewer && !simulated ? [...(await ownedAddresses(viewer.userId))] : [];
  const { wallets, tokens } = walletTokenOptions(portfolio, simulated, owned, viewer?.address?.toLowerCase() ?? null);
  const pick = (value: unknown) => (typeof value === "string" && tokens.some((t) => t.key === value.toLowerCase()) ? value.toLowerCase() : undefined);
  return (
    <FlowPage title="Swap">
      <SwapFlow tokens={tokens} wallets={wallets} simulated={simulated} initialFrom={pick(sp.from)} initialTo={pick(sp.to)} />
    </FlowPage>
  );
}
