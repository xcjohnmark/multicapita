import QRCode from "qrcode";
import { FlowPage } from "@/components/shell/layout-chrome";
import { ReceiveFlow } from "@/components/wallet/receive-flow";
import { getCurrentPortfolio, getCurrentSession } from "@/lib/platform-context";
import { tokenOptions } from "@/lib/platform-tokens";

export const dynamic = "force-dynamic";

export default async function ReceivePage() {
  const [session, portfolio] = await Promise.all([getCurrentSession(), getCurrentPortfolio()]);
  const address = session.authenticated ? session.address : null;
  // Rendered on the server from the session address; nothing is fetched from a third party.
  const qrSvg = address ? await QRCode.toString(address, { type: "svg", margin: 1, color: { dark: "#111827", light: "#ffffff" } }) : null;
  return (
    <FlowPage title="Receive">
      <ReceiveFlow tokens={tokenOptions(portfolio)} address={address} qrSvg={qrSvg} />
    </FlowPage>
  );
}
