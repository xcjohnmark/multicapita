import { FlowPage } from "@/components/shell/layout-chrome";
import { SendFlow } from "@/components/wallet/send-flow";
import { isSimulatedFor } from "@/lib/execution/plan/scope";
import { getCurrentPortfolio, getCurrentViewer } from "@/lib/platform-context";
import { walletTokenOptions } from "@/lib/platform-tokens";
import { ownedAddresses } from "@/lib/wallet/accounts";

export const dynamic = "force-dynamic";

export default async function SendPage() {
  const [viewer, portfolio] = await Promise.all([getCurrentViewer(), getCurrentPortfolio()]);
  const simulated = viewer ? isSimulatedFor(viewer) : true;
  const owned = viewer && !simulated ? [...(await ownedAddresses(viewer.userId))] : [];
  const { wallets, tokens } = walletTokenOptions(portfolio, simulated, owned, viewer?.address?.toLowerCase() ?? null);
  return (
    <FlowPage title="Send">
      <SendFlow tokens={tokens} wallets={wallets} simulated={simulated} />
    </FlowPage>
  );
}
