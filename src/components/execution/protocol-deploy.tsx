"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, ExternalLink, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { StatusDot } from "@/components/ui/primitives";
import { ensureWalletChain } from "@/lib/wallet/chain-switch";

type ActionType = "aave_supply" | "aave_withdraw" | "uniswap_mint" | "equity_swap";

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
  note: string;
};

export function ProtocolDeploy() {
  const [action, setAction] = useState<ActionType>("aave_supply");
  const [chainId, setChainId] = useState<number>(8453);
  const [amount, setAmount] = useState<string>("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepData, setStepData] = useState<PreparedProtocolStep | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // For tokenized equities
  const [equityContract, setEquityContract] = useState("0x0660bbBFF171Bf28328114f08e705bC116e2566F"); // NVDA.d on Arbitrum

  async function prepareProtocolStep() {
    setError(null);
    setBusy(true);
    setTxHash(null);
    setCompleted(false);

    try {
      let body: Record<string, unknown> = {};

      if (action === "aave_supply" || action === "aave_withdraw") {
        const atomic = BigInt(Math.floor(parseFloat(amount || "0") * 1_000_000)).toString();
        body = {
          action,
          chainId,
          amountAtomic: atomic,
        };
      } else if (action === "uniswap_mint") {
        const atomic0 = BigInt(Math.floor(parseFloat(amount || "0") * 500_000)).toString();
        const atomic1 = atomic0;
        body = {
          action,
          chainId,
          token0: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
          token1: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // USDT
          feeTier: 100,
          amount0DesiredAtomic: atomic0,
          amount1DesiredAtomic: atomic1,
        };
      } else if (action === "equity_swap") {
        const atomic = BigInt(Math.floor(parseFloat(amount || "0") * 1_000_000)).toString();
        body = {
          action,
          chainId: 42161, // Arbitrum
          contractAddress: equityContract,
          dexRouterAddress: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
          amountAtomic: atomic,
          dexPriceUsd: 120.45,
          referenceNavUsd: 120.0,
          maxNavDeviationBps: 150,
          allowOffHoursExecution: false,
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

  async function signAndBroadcast() {
    if (!stepData) return;
    const provider = window.ethereum;
    if (!provider) {
      setError("No injected wallet detected.");
      return;
    }

    // Pre-flight chain check
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

        // If it was a supply or mint operation, record to database
        if (action === "aave_supply" && !stepData.requiresApproval) {
          await fetch("/api/protocols/record", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              strategyType: "lending",
              protocolSlug: "aave-v3",
              chainId: stepData.instruction.chainId,
              positionReference: "Aave V3 USDC Supply Pool",
              amountAtomic: stepData.instruction.amountAtomic,
              valueUsd: parseFloat(amount || "0"),
              rateValue: 0.0485,
              rateType: "APY",
              txHash: hash,
              receiptTokenAddress:
                stepData.instruction.chainId === 8453
                  ? "0x4e65fE4DbA92Fc12ee471321473d09a06F74e64A"
                  : "0x724dc807b04555b71ed48a6006532c8c643716CE",
            }),
          });
          setCompleted(true);
        } else if (stepData.requiresApproval) {
          // Approval confirmed, refresh step to get the supply instruction
          setStepData(null);
          await prepareProtocolStep();
        } else {
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

  return (
    <div className="panel space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="chip border-green-200 bg-green-50 text-accent-text">
              <Sparkles className="size-3" /> Stage S5 Mainnet
            </span>
            <p className="eyebrow">Protocol Deploy & Withdraw</p>
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">
            Destination Protocol Execution
          </h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setAction("aave_supply");
            setStepData(null);
            setTxHash(null);
          }}
          className={`btn justify-center text-xs h-9 ${
            action === "aave_supply"
              ? "border-green-500 bg-green-50 text-ink font-medium"
              : "border-line bg-canvas text-ink-secondary hover:bg-surface"
          }`}
        >
          Aave V3 Supply
        </button>
        <button
          type="button"
          onClick={() => {
            setAction("aave_withdraw");
            setStepData(null);
            setTxHash(null);
          }}
          className={`btn justify-center text-xs h-9 ${
            action === "aave_withdraw"
              ? "border-green-500 bg-green-50 text-ink font-medium"
              : "border-line bg-canvas text-ink-secondary hover:bg-surface"
          }`}
        >
          Aave V3 Withdraw
        </button>
        <button
          type="button"
          onClick={() => {
            setAction("uniswap_mint");
            setStepData(null);
            setTxHash(null);
          }}
          className={`btn justify-center text-xs h-9 ${
            action === "uniswap_mint"
              ? "border-green-500 bg-green-50 text-ink font-medium"
              : "border-line bg-canvas text-ink-secondary hover:bg-surface"
          }`}
        >
          Uniswap V3 LP
        </button>
        <button
          type="button"
          onClick={() => {
            setAction("equity_swap");
            setStepData(null);
            setTxHash(null);
          }}
          className={`btn justify-center text-xs h-9 ${
            action === "equity_swap"
              ? "border-green-500 bg-green-50 text-ink font-medium"
              : "border-line bg-canvas text-ink-secondary hover:bg-surface"
          }`}
        >
          Tokenized Stock
        </button>
      </div>

      {/* Configuration Form */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="eyebrow mb-1.5 block">Chain Network</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChainId(8453)}
              disabled={action === "equity_swap"}
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
                chainId === 42161 || action === "equity_swap"
                  ? "border-green-500 bg-green-50 text-ink font-medium"
                  : "border-line bg-canvas text-ink-secondary"
              }`}
            >
              Arbitrum (42161)
            </button>
          </div>
        </div>

        <div>
          <label className="eyebrow mb-1.5 block">
            {action === "equity_swap" ? "Investment Capital (USDC)" : "Amount (USDC)"}
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="10"
            className="h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 font-mono text-sm text-ink focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {action === "equity_swap" && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-4 text-xs">
          <p className="font-semibold text-ink">Verified Tokenized Equity Selection</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEquityContract("0x0660bbBFF171Bf28328114f08e705bC116e2566F")}
              className={`p-2.5 rounded-lg border text-left ${
                equityContract === "0x0660bbBFF171Bf28328114f08e705bC116e2566F"
                  ? "border-green-500 bg-white shadow-sm"
                  : "border-line bg-canvas"
              }`}
            >
              <p className="font-medium text-ink">NVDA.d (Dinari Nvidia)</p>
              <p className="text-[11px] text-ink-muted">Arbitrum One · Total Return Reinvesting</p>
            </button>
            <button
              type="button"
              onClick={() => setEquityContract("0x24119B24902F135e5d32982855bA5430cf1243be")}
              className={`p-2.5 rounded-lg border text-left ${
                equityContract === "0x24119B24902F135e5d32982855bA5430cf1243be"
                  ? "border-green-500 bg-white shadow-sm"
                  : "border-line bg-canvas"
              }`}
            >
              <p className="font-medium text-ink">AAPL.d (Dinari Apple)</p>
              <p className="text-[11px] text-ink-muted">Arbitrum One · Total Return Reinvesting</p>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 text-xs text-danger-text">
          <span className="font-semibold">Execution Blocked: </span>
          {error}
        </div>
      )}

      {/* Prepare Button */}
      {!stepData && (
        <button
          type="button"
          onClick={prepareProtocolStep}
          disabled={busy || !amount || parseFloat(amount) <= 0}
          className="btn btn-primary h-10 w-full justify-center text-sm"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
          <span>Prepare Protocol Step</span>
        </button>
      )}

      {/* Prepared Instruction Card */}
      {stepData && (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4 text-xs">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <span className="eyebrow">
                Step {stepData.step} of {stepData.totalSteps}
              </span>
              <h3 className="text-sm font-semibold text-ink">{stepData.stepName}</h3>
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
                <span className="font-mono font-semibold text-accent-text">
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
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline break-all"
              >
                <span>View on Explorer ({txHash.slice(0, 10)}…{txHash.slice(-8)})</span>
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}

          {completed && (
            <div className="rounded-lg border border-green-300 bg-green-100/60 p-3 text-xs text-green-900">
              <p className="font-semibold">Protocol Execution Completed</p>
              <p className="mt-0.5 text-[11px]">
                Your position has been recorded. Check the{" "}
                <a href="/positions" className="font-medium underline hover:text-green-700">
                  Positions page
                </a>{" "}
                to monitor active collateral and yield.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
