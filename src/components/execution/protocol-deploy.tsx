"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { StatusDot } from "@/components/ui/primitives";
import { ensureWalletChain } from "@/lib/wallet/chain-switch";

type ActionType =
  | "aave_supply"
  | "aave_withdraw"
  | "uniswap_mint"
  | "uniswap_collect"
  | "equity_swap"
  | "arbitrage";

type LiveArbOpportunity = {
  asset: string;
  sourceChainId: number;
  estimatedApy: number | null;
  rateType: string | null;
  liquidityUsd: number | null;
  dataMode: string;
  status: string;
  riskFlags: unknown;
  fees?: { dexFeeBps?: number; bridgeFeeBps?: number; gasCostUsd?: number };
  sourcePayload?: {
    grossSpreadBps?: number;
    expectedProfitUsd?: number;
    basePriceUsd?: number | null;
    arbPriceUsd?: number | null;
    isExecutable?: boolean;
    reason?: string | null;
  };
};

type PreparedProtocolStep = {
  step: number;
  totalSteps: number;
  stepName: string;
  requiresApproval?: boolean;
  instruction: {
    chainId: number;
    to: string;
    data: string;
    value: string;
    operation: string;
    description: string;
    amountAtomic?: string;
    explorerUrl: string;
  };
  provenance?: {
    dexExecutionPriceUsd: number;
    referenceNavUsd: number;
    navDeviationBps: number;
    sessionStatus: string;
    isWithinSpreadBound: boolean;
  };
  asset?: {
    chainId: number;
    symbol: string;
    name: string;
    contractAddress: string;
    decimals: number;
    issuer: string;
  };
  note: string;
};

const EQUITY_CHOICES = [
  {
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "NVDAon",
    label: "NVDAon (Ondo Nvidia)",
    sub: "Ethereum · Live DEX pool + NAV check",
    contract: "0x2D1F7226Bd1F780AF6B9A49DCC0aE00E8Df4bDEE",
  },
  {
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "XAUT",
    label: "XAUT (Tether Gold)",
    sub: "Ethereum · 1:1 Physical Gold RWA",
    contract: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
  },
  {
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "AAPLon",
    label: "AAPLon (Ondo Apple)",
    sub: "Ethereum · Total Return Reinvesting",
    contract: "0x14c3abF94bcC9698967923418526543Cb87b2d4c",
  },
  {
    chainId: 1,
    chainLabel: "Ethereum",
    symbol: "TSLAon",
    label: "TSLAon (Ondo Tesla)",
    sub: "Ethereum · Total Return Reinvesting",
    contract: "0xf6b1117ec07684d3958cad8beb1b302bfd21103f",
  },
  {
    chainId: 42161,
    chainLabel: "Arbitrum",
    symbol: "NVDA.d",
    label: "NVDA.d (Dinari Nvidia)",
    sub: "Arbitrum · Dinari custody dShare",
    contract: "0x4DaFFfDDEa93DdF1e0e7B61E844331455053Ce5c",
  },
  {
    chainId: 42161,
    chainLabel: "Arbitrum",
    symbol: "AAPL.d",
    label: "AAPL.d (Dinari Apple)",
    sub: "Arbitrum · Dinari custody dShare",
    contract: "0xCe38e140fC3982a6bCEbc37b040913EF2Cd6C5a7",
  },
] as const;

export function ProtocolDeploy() {
  const searchParams = useSearchParams();
  const [action, setAction] = useState<ActionType>("aave_supply");
  const [chainId, setChainId] = useState<number>(8453);
  const [amount, setAmount] = useState<string>("10");
  const [tokenId, setTokenId] = useState<string>("");
  const [equityDirection, setEquityDirection] = useState<"buy" | "sell">("buy");
  const [equityChoice, setEquityChoice] = useState<string>(EQUITY_CHOICES[0].contract);
  const [equityChainId, setEquityChainId] = useState<number>(EQUITY_CHOICES[0].chainId);
  const [allowOffHours, setAllowOffHours] = useState<boolean>(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepData, setStepData] = useState<PreparedProtocolStep | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [arbData, setArbData] = useState<LiveArbOpportunity[] | null>(null);
  const [arbScanning, setArbScanning] = useState(false);

  useEffect(() => {
    const qAction = searchParams.get("action") ?? searchParams.get("tab");
    const qChain = Number(searchParams.get("chainId") ?? searchParams.get("chain"));
    const qAmount = searchParams.get("amount");
    const qContract = searchParams.get("contract");
    const qSymbol = searchParams.get("symbol");
    const qDir = searchParams.get("equityDirection");

    if (
      qAction === "aave_supply" ||
      qAction === "aave_withdraw" ||
      qAction === "uniswap_mint" ||
      qAction === "uniswap_collect" ||
      qAction === "equity_swap" ||
      qAction === "arbitrage"
    ) {
      setAction(qAction);
    } else if (qAction === "uniswap_lp") {
      setAction("uniswap_mint");
    } else if (qAction === "equities") {
      setAction("equity_swap");
    }

    if (qChain === 8453 || qChain === 42161 || qChain === 1) {
      if (qAction === "equity_swap" || qAction === "equities") setEquityChainId(qChain);
      else if (qChain === 8453 || qChain === 42161) setChainId(qChain);
    }
    if (qAmount && Number(qAmount) > 0) setAmount(qAmount);
    if (qContract) {
      const found = EQUITY_CHOICES.find((e) => e.contract.toLowerCase() === qContract.toLowerCase());
      if (found) {
        setEquityChoice(found.contract);
        setEquityChainId(found.chainId);
      }
    } else if (qSymbol) {
      const found = EQUITY_CHOICES.find(
        (e) => e.symbol.toLowerCase() === qSymbol.toLowerCase(),
      );
      if (found) {
        setEquityChoice(found.contract);
        setEquityChainId(found.chainId);
      }
    }
    if (qDir === "buy" || qDir === "sell") setEquityDirection(qDir);
  }, [searchParams]);

  async function scanLiveArbitrage() {
    setArbScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/execution/arbitrage");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Arbitrage spread scan failed.");
        return;
      }
      setArbData(json.opportunities ?? []);
    } catch {
      setError("Network error scanning arbitrage spreads.");
    } finally {
      setArbScanning(false);
    }
  }

  async function prepareProtocolStep() {
    setError(null);
    setBusy(true);
    setTxHash(null);
    setCompleted(false);

    try {
      let body: Record<string, unknown> = {};
      const parsedAmount = parseFloat(amount || "0");

      if (action === "aave_supply" || action === "aave_withdraw") {
        const atomic = BigInt(Math.floor(parsedAmount * 1_000_000)).toString();
        body = { action, chainId, amountAtomic: atomic };
      } else if (action === "uniswap_mint") {
        const halfAtomic = BigInt(Math.floor(parsedAmount * 500_000)).toString();
        body = {
          action,
          chainId,
          feeTier: 100,
          amount0DesiredAtomic: halfAtomic,
          amount1DesiredAtomic: halfAtomic,
        };
      } else if (action === "uniswap_collect") {
        body = { action, chainId, tokenId: tokenId.trim() || "1" };
      } else if (action === "equity_swap") {
        const selected = EQUITY_CHOICES.find((c) => c.contract === equityChoice) ?? EQUITY_CHOICES[0];
        const atomic =
          equityDirection === "buy"
            ? BigInt(Math.floor(parsedAmount * 1_000_000)).toString()
            : BigInt(Math.floor(parsedAmount * 1e6)).toString();
        body = {
          action,
          chainId: selected.chainId,
          contractAddress: selected.contract,
          direction: equityDirection,
          amountAtomic: atomic,
          maxNavDeviationBps: 150,
          allowOffHoursExecution: allowOffHours,
          slippageBps: 100,
        };
      }

      const res = await fetch("/api/protocols/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to prepare protocol operation");
        setStepData(null);
        return;
      }

      setStepData(json.data);
    } catch {
      setError("Network error connecting to protocol adapter.");
    } finally {
      setBusy(false);
    }
  }

  async function recordConfirmedTx(hash: string, currentStep: PreparedProtocolStep) {
    const valUsd = parseFloat(amount || "0");
    if (action === "aave_supply" || action === "aave_withdraw") {
      await fetch("/api/protocols/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: action === "aave_withdraw" ? "withdraw" : "open",
          strategyType: "lending",
          protocolSlug: "aave-v3",
          chainId: currentStep.instruction.chainId,
          positionReference: "Aave V3 USDC Supply Pool",
          amountAtomic: currentStep.instruction.amountAtomic ?? "0",
          valueUsd: valUsd > 0 ? valUsd : 1,
          txHash: hash,
          receiptTokenAddress:
            currentStep.instruction.chainId === 8453
              ? "0x4e65fE4DbA92Fc12ee471321473d09a06F74e64A"
              : "0x724dc807b04555b71ed48a6006532c8c643716CE",
        }),
      });
    } else if (action === "uniswap_mint" || action === "uniswap_collect") {
      await fetch("/api/protocols/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: action === "uniswap_collect" ? "collect" : "open",
          strategyType: "stablecoin_lp",
          protocolSlug: "uniswap-v3",
          chainId: currentStep.instruction.chainId,
          positionReference:
            currentStep.instruction.chainId === 8453 ? "USDC / EURC 0.01%" : "USDC / USDT0 0.01%",
          amountAtomic: currentStep.instruction.amountAtomic ?? "0",
          valueUsd: valUsd > 0 ? valUsd : 1,
          txHash: hash,
        }),
      });
    } else if (action === "equity_swap" && currentStep.asset) {
      await fetch("/api/protocols/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: equityDirection === "sell" ? "sell" : "open",
          strategyType: "tokenized_equity",
          protocolSlug: currentStep.asset.issuer.toLowerCase(),
          chainId: currentStep.asset.chainId,
          positionReference: `${currentStep.asset.symbol} (${currentStep.asset.issuer})`,
          amountAtomic: currentStep.instruction.amountAtomic ?? "0",
          valueUsd: valUsd > 0 ? valUsd : 1,
          rateValue: currentStep.provenance?.navDeviationBps
            ? currentStep.provenance.navDeviationBps / 100
            : 0,
          rateType: "reference_nav_exposure",
          txHash: hash,
          receiptTokenAddress: currentStep.asset.contractAddress,
          receiptTokenSymbol: currentStep.asset.symbol,
          receiptTokenDecimals: currentStep.asset.decimals,
        }),
      });
    }
  }

  async function signAndBroadcast() {
    if (!stepData) return;
    const provider = window.ethereum;
    if (!provider) {
      setError("No injected wallet detected.");
      return;
    }

    const chainCheck = await ensureWalletChain(stepData.instruction.chainId);
    if (!chainCheck.ok) {
      setError(chainCheck.error ?? "Failed to switch wallet network.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      const user = accounts[0];
      if (!user) {
        setError("Please connect your wallet first.");
        return;
      }

      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: user,
            to: stepData.instruction.to,
            data: stepData.instruction.data,
            value: `0x${BigInt(stepData.instruction.value).toString(16)}`,
          },
        ],
      })) as string;

      if (hash && hash.startsWith("0x")) {
        setTxHash(hash);
        if (stepData.requiresApproval) {
          setStepData(null);
          await prepareProtocolStep();
        } else {
          await recordConfirmedTx(hash, stepData);
          setCompleted(true);
        }
      }
    } catch (cause) {
      const code = (cause as { code?: number } | undefined)?.code;
      setError(
        code === 4001
          ? "Transaction was rejected in your wallet."
          : "Wallet failed to broadcast transaction.",
      );
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: ActionType; label: string }> = [
    { id: "aave_supply", label: "Aave V3 Supply" },
    { id: "aave_withdraw", label: "Aave V3 Withdraw" },
    { id: "uniswap_mint", label: "Uniswap V3 LP" },
    { id: "uniswap_collect", label: "Collect LP Fees" },
    { id: "equity_swap", label: "Tokenized Stock" },
    { id: "arbitrage", label: "Cross-Chain Arb" },
  ];

  return (
    <div className="panel space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="chip border-green-200 bg-green-50 text-accent-text">
              <Sparkles className="size-3" /> Step 2 Execution
            </span>
            <p className="eyebrow">Protocol Deploy, LP, Withdraw & RWA</p>
          </div>
          <h2 className="mt-1 type-h5 text-ink">
            Destination Protocol Execution
          </h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setAction(tab.id);
              setStepData(null);
              setTxHash(null);
              setError(null);
            }}
            className={`btn justify-center text-xs h-9 ${
              action === tab.id
                ? "border-green-500 bg-green-50 text-ink font-medium"
                : "border-line bg-canvas text-ink-secondary hover:bg-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Configuration Form */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="eyebrow mb-1.5 block">Chain Network</label>
          {action === "equity_swap" ? (
            <div className="h-10 flex items-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink">
              {equityChainId === 1 ? "Ethereum (1)" : "Arbitrum One (42161)"} · Auto-selected by token
            </div>
          ) : action === "arbitrage" ? (
            <div className="h-10 flex items-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink">
              Base (8453) ↔ Arbitrum One (42161) · Cross-Chain Sequence
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChainId(8453)}
                className={`btn flex-1 justify-center text-xs h-10 ${
                  chainId === 8453
                    ? "border-green-500 bg-green-50 text-ink font-medium"
                    : "border-line bg-canvas text-ink-secondary"
                }`}
              >
                Base (8453)
              </button>
              <button
                type="button"
                onClick={() => setChainId(42161)}
                className={`btn flex-1 justify-center text-xs h-10 ${
                  chainId === 42161
                    ? "border-green-500 bg-green-50 text-ink font-medium"
                    : "border-line bg-canvas text-ink-secondary"
                }`}
              >
                Arbitrum (42161)
              </button>
            </div>
          )}
        </div>

        {action === "uniswap_collect" ? (
          <div>
            <label className="eyebrow mb-1.5 block">Uniswap V3 Position NFT Token ID</label>
            <input
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 123456"
              className="h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 font-mono text-sm text-ink focus:border-ink focus:outline-none"
            />
          </div>
        ) : (
          <div>
            <label className="eyebrow mb-1.5 block">
              {action === "equity_swap"
                ? equityDirection === "buy"
                  ? "Investment Capital (USDC)"
                  : "Tokenized Shares to Sell"
                : action === "uniswap_mint"
                  ? chainId === 8453
                    ? "Total LP Value (50% USDC + 50% EURC)"
                    : "Total LP Value (50% USDC + 50% USDT0)"
                  : "Amount (USDC)"}
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="10"
              className="h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 font-mono text-sm text-ink focus:border-ink focus:outline-none"
            />
          </div>
        )}
      </div>

      {action === "equity_swap" && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-ink">Verified Equities & RWAs (Live NAV + DEX Check)</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEquityDirection("buy")}
                className={`btn h-7 px-3 text-xs ${equityDirection === "buy" ? "bg-ink text-canvas" : "bg-canvas border-line"}`}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => setEquityDirection("sell")}
                className={`btn h-7 px-3 text-xs ${equityDirection === "sell" ? "bg-ink text-canvas" : "bg-canvas border-line"}`}
              >
                Sell
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {EQUITY_CHOICES.map((choice) => (
              <button
                key={`${choice.chainId}-${choice.contract}`}
                type="button"
                onClick={() => {
                  setEquityChoice(choice.contract);
                  setEquityChainId(choice.chainId);
                  setStepData(null);
                }}
                className={`p-2.5 rounded-lg border text-left ${
                  equityChoice === choice.contract
                    ? "border-green-500 bg-white shadow-sm"
                    : "border-line bg-canvas"
                }`}
              >
                <p className="font-medium text-ink">{choice.label}</p>
                <p className="text-xs text-ink-muted">{choice.sub}</p>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={allowOffHours}
              onChange={(e) => setAllowOffHours(e.target.checked)}
            />
            Allow off-hours execution (still enforces strict 150 bps max NAV spread limit)
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 text-xs text-danger-text">
          <span className="font-medium">Execution Blocked: </span>
          {error}
        </div>
      )}

      {action === "arbitrage" ? (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium text-ink">
                2-Leg Cross-Chain Arbitrage (Live DEX Screener + 1Click Cost Gate)
              </p>
              <p className="text-xs text-ink-muted">
                Non-atomic sequence: Leg 1 moves capital across chains via 1Click; Leg 2 swaps on destination DEX.
                Never dispatches automatically below net profit threshold ($5.00).
              </p>
            </div>
            <button
              type="button"
              onClick={scanLiveArbitrage}
              disabled={arbScanning}
              className="btn btn-primary h-9 px-3.5 text-xs"
            >
              {arbScanning ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              <span>{arbScanning ? "Scanning Spreads…" : "Scan Live Arb Spreads"}</span>
            </button>
          </div>

          {arbData ? (
            <div className="space-y-2.5">
              {arbData.map((item, idx) => (
                <div
                  key={`${item.asset}-${idx}`}
                  className="rounded-lg border border-line bg-canvas p-3.5 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {item.asset} · Base vs Arbitrum ({item.dataMode.toUpperCase()})
                    </span>
                    <span
                      className={`chip text-xs ${
                        item.status === "active"
                          ? "border-green-200 bg-green-50 text-accent-text"
                          : "border-red-200 bg-red-50 text-danger-text"
                      }`}
                    >
                      {item.status === "active"
                        ? `Executable Net Profit ($${item.sourcePayload?.expectedProfitUsd ?? 0})`
                        : `Blocked ($${item.sourcePayload?.expectedProfitUsd ?? 0} net)`}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 text-xs text-ink-secondary">
                    <span>Base DEX: ${item.sourcePayload?.basePriceUsd ?? "—"}</span>
                    <span>Arbitrum DEX: ${item.sourcePayload?.arbPriceUsd ?? "—"}</span>
                    <span>
                      Fees: DEX {item.fees?.dexFeeBps ?? "—"} bps + 1Click{" "}
                      {item.fees?.bridgeFeeBps ?? "—"} bps + Gas ${item.fees?.gasCostUsd ?? "—"}
                    </span>
                  </div>
                  {item.sourcePayload?.reason ? (
                    <p className="text-xs text-danger-text">{item.sourcePayload.reason}</p>
                  ) : null}
                  {item.status === "active" ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <a
                        href={`/execute?direction=base-to-arb&amount=${Math.max(10, Math.round(Number(amount) || 100))}`}
                        className="btn btn-accent h-8 px-3 text-xs"
                      >
                        Stage Leg 1: 1Click Bridge <ArrowRight className="size-3" />
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-ink-muted">
              Click &ldquo;Scan Live Arb Spreads&rdquo; to compute real DEX Screener prices and 1Click bridge cost.
            </p>
          )}
        </div>
      ) : !stepData && (
        <button
          type="button"
          onClick={prepareProtocolStep}
          disabled={
            busy ||
            (action !== "uniswap_collect" && (!amount || parseFloat(amount) <= 0))
          }
          className="btn btn-primary h-10 w-full justify-center text-sm"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          <span>Prepare Protocol Step</span>
        </button>
      )}

      {stepData && (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4 text-xs">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <span className="eyebrow">
                Step {stepData.step} of {stepData.totalSteps}
              </span>
              <h3 className="text-sm font-medium text-ink">{stepData.stepName}</h3>
            </div>
            <span className="chip border-green-200 bg-green-50 text-accent-text">
              <StatusDot tone="ok" /> Ready to Sign
            </span>
          </div>

          <p className="text-ink-secondary leading-relaxed">{stepData.note}</p>

          {stepData.provenance && (
            <div className="space-y-1.5 rounded-lg border border-line bg-canvas p-3">
              <div className="flex justify-between">
                <span className="text-ink-muted">TradFi Reference NAV</span>
                <span className="font-mono font-medium text-ink">
                  ${stepData.provenance.referenceNavUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">DEX Execution Price</span>
                <span className="font-mono font-medium text-ink">
                  ${stepData.provenance.dexExecutionPriceUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Spread Deviation</span>
                <span className="font-mono font-medium text-accent-text">
                  {stepData.provenance.navDeviationBps} bps
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Market Session</span>
                <span className="font-medium text-ink">{stepData.provenance.sessionStatus}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={signAndBroadcast}
              disabled={busy}
              className="btn btn-accent h-10 w-full justify-center text-sm"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              <span>
                {busy
                  ? "Awaiting Wallet Signature…"
                  : `Sign & Broadcast ${stepData.stepName}`}
              </span>
            </button>
          </div>

          {txHash && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-1.5 text-green-800 font-medium">
                <CheckCircle2 className="size-4" />
                <span>Transaction Broadcasted</span>
              </div>
              <a
                href={`${stepData.instruction.explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline break-all"
              >
                <span>
                  View on Explorer ({txHash.slice(0, 10)}…{txHash.slice(-8)})
                </span>
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}

          {completed && (
            <div className="rounded-lg border border-green-300 bg-green-100/60 p-3 text-xs text-green-900">
              <p className="font-medium">Protocol Execution Completed</p>
              <p className="mt-0.5 text-xs">
                Your position has been recorded. Check the{" "}
                <a href="/positions" className="font-medium underline hover:text-green-700">
                  Positions page
                </a>{" "}
                to manage or withdraw active positions.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
