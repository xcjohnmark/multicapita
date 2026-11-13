"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
} from "lucide-react";
import { AssetIcon } from "@/components/ui/asset-icon";
import {
  ChainBadge,
  DataModeBanner,
  Panel,
  PanelHeader,
  StatusDot,
} from "@/components/ui/primitives";
import type { TraderPositionItem } from "@/lib/copytrading/policy";
import type { OwnerSignedCopyPolicyPayload } from "@/lib/copytrading/agent-api";
import type { TraderXrayBriefing } from "@/lib/copytrading/xray";
import { formatUsd, shortenMiddle } from "@/lib/format";

export type SerializedTrader = {
  id: string;
  address: string;
  ecosystem: string;
  resolvedHandle: string | null;
  label: string | null;
  primaryStyle: string;
  realisedPnl90dUsd: number | null;
  winRatePercent: number | null;
  maxDrawdownPercent: number | null;
  isMemecoinFree: boolean;
  hasExternalHedgeWarning: boolean;
  positions: TraderPositionItem[];
  aiSummary: string | null;
  indexerSources: string[];
  dataMode: string;
  lastIndexedAt: string | null;
};

export type SerializedSubscription = {
  id: string;
  fundingNearAccountId: string;
  executionMode: string;
  maxUsdPerTrade: number;
  maxDailyBudgetUsd: number;
  dailyUsedUsd: number;
  copyScaleBps: number;
  maxPriceDriftBps: number;
  copySpot1Click: boolean;
  copyVaults: boolean;
  copyLending: boolean;
  copyLp: boolean;
  noMemecoinsOnly: boolean;
  status: string;
  trackedTrader: {
    address: string;
    resolvedHandle: string | null;
    label: string | null;
    primaryStyle: string;
  };
};

type QuotePreviewResult = {
  allowed: boolean;
  evaluation: {
    allowed: boolean;
    targetCopyUsd: number;
    priceDriftBps: number | null;
    assetClass: string;
    violations: Array<{ code: string; severity: string; message: string }>;
  };
  quote: {
    dry: boolean;
    correlationId: string;
    originAsset: string;
    destinationAsset: string;
    amountInUsdc: number;
    amountInAtomic: string;
    amountOutAtomic: string;
    amountOutFormatted: string | null;
    amountOutUsd: string | null;
    timeEstimateSeconds: number | null;
  } | null;
  protocolFollowUp: {
    required: boolean;
    stepLabel: string;
    contractAddress: string;
    signerMechanism: string;
  } | null;
  nearSetup?: OwnerSignedCopyPolicyPayload;
};

const STYLE_FILTERS = [
  "All",
  "Spot Blue-Chips",
  "DeFi Yield & Lending",
  "LP Providers",
] as const;

export function CopytradingHub({
  initialTraders,
  initialSubscriptions,
  agentApiConfigured,
  catalogueStats,
}: {
  initialTraders: SerializedTrader[];
  initialSubscriptions: SerializedSubscription[];
  agentApiConfigured: boolean;
  catalogueStats: {
    total1ClickTokens: number;
    copyableNonMemeTokens: number;
    excludedMemecoinOrDeprecated: number;
  };
}) {
  const [traders, setTraders] = useState<SerializedTrader[]>(initialTraders);
  const [subscriptions, setSubscriptions] = useState<SerializedSubscription[]>(initialSubscriptions);
  const [styleFilter, setStyleFilter] = useState<string>("All");
  const [selectedTrader, setSelectedTrader] = useState<SerializedTrader | null>(
    initialTraders[0] ?? null,
  );
  const [briefing, setBriefing] = useState<TraderXrayBriefing | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState<string[]>([]);

  // Search / Wallet X-Ray form
  const [searchInput, setSearchInput] = useState<string>("");
  const [inspectBusy, setInspectBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // NEAR unified copy setup form
  const [fundingNearAccountId, setFundingNearAccountId] = useState("capita-user.near");
  const [executionMode, setExecutionMode] = useState<"approval_required" | "agent_auto_copy">(
    "approval_required",
  );
  const [maxUsdPerTrade, setMaxUsdPerTrade] = useState(50);
  const [maxDailyBudgetUsd, setMaxDailyBudgetUsd] = useState(200);
  const [copyScaleBps, setCopyScaleBps] = useState(1000);
  const [maxPriceDriftBps, setMaxPriceDriftBps] = useState(150);
  const [copySpot1Click, setCopySpot1Click] = useState(true);
  const [copyVaults, setCopyVaults] = useState(true);
  const [copyLending, setCopyLending] = useState(true);
  const [copyLp, setCopyLp] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [nearSetupDescriptor, setNearSetupDescriptor] =
    useState<OwnerSignedCopyPolicyPayload | null>(null);

  // Copy Quote & Execution state
  const [quoteBusySymbol, setQuoteBusySymbol] = useState<string | null>(null);
  const [quotePreview, setQuotePreview] = useState<QuotePreviewResult | null>(null);
  const [quotedPosition, setQuotedPosition] = useState<TraderPositionItem | null>(null);
  const [execApproved, setExecApproved] = useState(false);
  const [execBusy, setExecBusy] = useState(false);
  const [execResult, setExecResult] = useState<{
    mode: string;
    quoteId?: string;
    depositAddress?: string;
    orderId?: string | null;
    amountInUsdc: number;
    protocolFollowUp?: { required: boolean; stepLabel: string; contractAddress: string } | null;
  } | null>(null);
  const [subCheckBusyId, setSubCheckBusyId] = useState<string | null>(null);

  const visibleTraders = traders.filter((t) => {
    if (styleFilter === "All") return true;
    return t.primaryStyle === styleFilter;
  });

  const anySample = traders.some((t) => t.dataMode !== "live");

  function serializeInspectedPayload(payload: {
    trader: Record<string, unknown>;
    inspection: {
      positions: TraderPositionItem[];
      indexerSources: string[];
      dataMode: string;
      observedAt: string;
    };
    briefing: TraderXrayBriefing;
  }): SerializedTrader {
    const { trader, inspection, briefing: aiBrief } = payload;
    return {
      id: String(trader.id),
      address: String(trader.address),
      ecosystem: String(trader.ecosystem),
      resolvedHandle: (trader.resolvedHandle as string | null) ?? null,
      label: (trader.label as string | null) ?? null,
      primaryStyle: String(trader.primaryStyle),
      realisedPnl90dUsd: (trader.realisedPnl90dUsd as number | null) ?? null,
      winRatePercent: (trader.winRatePercent as number | null) ?? null,
      maxDrawdownPercent: (trader.maxDrawdownPercent as number | null) ?? null,
      isMemecoinFree: Boolean(trader.isMemecoinFree),
      hasExternalHedgeWarning: Boolean(trader.hasExternalHedgeWarning),
      positions: Array.isArray(inspection?.positions) ? inspection.positions : [],
      aiSummary: aiBrief?.summary ?? null,
      indexerSources: Array.isArray(inspection?.indexerSources) ? inspection.indexerSources : [],
      dataMode: String(inspection?.dataMode ?? "live"),
      lastIndexedAt: inspection?.observedAt ?? null,
    };
  }

  async function handleInspectWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setInspectBusy(true);
    setErrorMsg(null);
    setStatusNotice(null);
    setQuotePreview(null);

    try {
      const res = await fetch("/api/copytrading/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addressOrHandle: searchInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error?.message ?? "Failed to inspect trader address.");
        return;
      }

      const serialized = serializeInspectedPayload(json.data);
      const { inspection, briefing: aiBrief } = json.data;

      setTraders((prev) => [
        serialized,
        ...prev.filter((t) => t.address.toLowerCase() !== serialized.address.toLowerCase()),
      ]);
      setSelectedTrader(serialized);
      setBriefing(aiBrief);
      setInspectionNotes(inspection.notes ?? []);
      setStatusNotice(
        `Inspected ${serialized.resolvedHandle ?? shortenMiddle(serialized.address, 6, 4)} via ${inspection.indexerSources.join(", ")}.`,
      );
    } catch {
      setErrorMsg("Network error while inspecting wallet.");
    } finally {
      setInspectBusy(false);
    }
  }

  async function handleSaveSubscription(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTrader) return;
    setSubBusy(true);
    setErrorMsg(null);
    setStatusNotice(null);

    try {
      const res = await fetch("/api/copytrading/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          traderAddress: selectedTrader.address,
          ecosystem: selectedTrader.ecosystem,
          fundingNearAccountId,
          executionMode,
          maxUsdPerTrade,
          maxDailyBudgetUsd,
          copyScaleBps,
          maxPriceDriftBps,
          copySpot1Click,
          copyVaults,
          copyLending,
          copyLp,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error?.message ?? "Could not save copytrading setup.");
        return;
      }

      const sub = json.data.subscription as SerializedSubscription;
      setSubscriptions((prev) => [sub, ...prev.filter((s) => s.id !== sub.id)]);
      setNearSetupDescriptor(json.data.setupDescriptor);
      setStatusNotice(
        `Copytrading active from ${sub.fundingNearAccountId} (${sub.executionMode === "agent_auto_copy" ? "NEAR Agent API + Chain Signatures" : "Copy-with-Approval"}). Memecoins excluded.`,
      );
    } catch {
      setErrorMsg("Network error saving copytrading subscription.");
    } finally {
      setSubBusy(false);
    }
  }

  async function handleToggleSubscription(subId: string, nextStatus: "active" | "paused" | "frozen") {
    setErrorMsg(null);
    try {
      const res = await fetch("/api/copytrading/subscriptions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscriptionId: subId, status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error?.message ?? "Failed to update subscription status.");
        return;
      }
      const updated = json.data.subscription as SerializedSubscription;
      setSubscriptions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      setErrorMsg("Network error updating subscription.");
    }
  }

  async function handlePreviewCopyQuote(position: TraderPositionItem, testDriftOverride?: number) {
    setQuoteBusySymbol(position.symbol);
    setErrorMsg(null);
    setQuotePreview(null);
    setQuotedPosition(position);
    setExecApproved(false);
    setExecResult(null);

    try {
      const res = await fetch("/api/copytrading/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionKind: position.actionKind,
          targetSymbol: position.symbol,
          targetChainId: position.chainId === 0 ? 8453 : position.chainId,
          targetAssetId: position.oneClickAssetId ?? undefined,
          targetContractAddress: position.contractAddress,
          leaderTradeUsd: Math.max(250, position.valueUsd ?? 500),
          leaderPriceUsd: testDriftOverride ?? null,
          fundingNearAccountId,
          maxUsdPerTrade,
          maxDailyBudgetUsd,
          copyScaleBps,
          maxPriceDriftBps,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error?.message ?? "Copy quote failed.");
        return;
      }
      setQuotePreview(json.data as QuotePreviewResult);
    } catch {
      setErrorMsg("Network error quoting copy trade.");
    } finally {
      setQuoteBusySymbol(null);
    }
  }

  async function handleExecuteMirror() {
    if (!quotedPosition || !quotePreview?.quote) return;
    setExecBusy(true);
    setErrorMsg(null);
    setExecResult(null);

    const activeSub = subscriptions.find(
      (s) =>
        s.status === "active" &&
        selectedTrader &&
        s.trackedTrader.address.toLowerCase() === selectedTrader.address.toLowerCase(),
    );

    try {
      const res = await fetch("/api/copytrading/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscriptionId: activeSub?.id,
          actionKind: quotedPosition.actionKind,
          targetSymbol: quotedPosition.symbol,
          targetChainId: quotedPosition.chainId === 0 ? 8453 : quotedPosition.chainId,
          targetAssetId: quotedPosition.oneClickAssetId ?? undefined,
          targetContractAddress: quotedPosition.contractAddress,
          leaderTradeUsd: Math.max(250, quotedPosition.valueUsd ?? 500),
          fundingNearAccountId: activeSub?.fundingNearAccountId ?? fundingNearAccountId,
          executionMode: activeSub?.executionMode ?? executionMode,
          maxUsdPerTrade: activeSub?.maxUsdPerTrade ?? maxUsdPerTrade,
          maxDailyBudgetUsd: activeSub?.maxDailyBudgetUsd ?? maxDailyBudgetUsd,
          copyScaleBps: activeSub?.copyScaleBps ?? copyScaleBps,
          maxPriceDriftBps: activeSub?.maxPriceDriftBps ?? maxPriceDriftBps,
          approved: execApproved,
          approvedAmountUsd: quotePreview.quote.amountInUsdc,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error?.message ?? "Copy execution could not proceed.");
        return;
      }
      setExecResult(json.data);
      if (activeSub && json.data?.amountInUsdc) {
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.id === activeSub.id
              ? {
                  ...s,
                  dailyUsedUsd: Math.round((s.dailyUsedUsd + json.data.amountInUsdc) * 100) / 100,
                }
              : s,
          ),
        );
      }
    } catch {
      setErrorMsg("Network error executing copy trade.");
    } finally {
      setExecBusy(false);
    }
  }

  async function handleCheckSubscriptionActivity(sub: SerializedSubscription) {
    setSubCheckBusyId(sub.id);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const res = await fetch("/api/copytrading/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addressOrHandle: sub.trackedTrader.address }),
      });
      const json = await res.json();
      if (!res.ok || !json.data) {
        setErrorMsg(json.error?.message ?? "Could not inspect subscribed trader.");
        return;
      }
      const hydrated = serializeInspectedPayload(json.data);
      setSelectedTrader(hydrated);
      setBriefing(json.data.briefing);
      const topPos = hydrated.positions.find((p) => p.copyableVia !== "blocked_memecoin");
      if (topPos) {
        setStatusNotice(`Checked ${sub.trackedTrader.resolvedHandle ?? shortenMiddle(sub.trackedTrader.address, 6, 4)} — staging top non-memecoin holding (${topPos.symbol}).`);
        await handlePreviewCopyQuote(topPos);
      } else {
        setStatusNotice("Checked trader: no eligible non-memecoin holdings on scanned chains right now.");
      }
    } catch {
      setErrorMsg("Network error inspecting subscription trader.");
    } finally {
      setSubCheckBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Stage S7 · Unified NEAR Setup</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
            Cross-Chain Copytrading
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            Inspect any trader address across chains or follow verified Top Performers, review AI
            position briefings, and mirror major verified 1Click assets, Earn vaults, Aave lending,
            and Uniswap LP—funded and configured once from NEAR.{" "}
            <span className="font-medium text-ink">Zero memecoins.</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="chip border-green-200 bg-green-50 text-accent-text">
            <ShieldCheck className="size-3.5" strokeWidth={1.75} />
            {catalogueStats.copyableNonMemeTokens} Non-Meme 1Click Assets
          </span>
          <span className="chip">
            <StatusDot tone={agentApiConfigured ? "ok" : "info"} />
            {agentApiConfigured ? "Agent API Connected" : "Mode A: Approval-First"}
          </span>
        </div>
      </header>

      {anySample ? (
        <DataModeBanner
          dataMode="sample"
          title="Sample leaderboard profiles included."
          message="Cards marked Sample represent reference traders. Paste any 0x, .eth, or .near address in Wallet X-Ray above to inspect live on-chain balances and Aave debt."
        />
      ) : null}

      {/* Wallet X-Ray Search Bar */}
      <Panel>
        <PanelHeader
          eyebrow="Wallet X-Ray"
          title="Inspect any trader across Base, Arbitrum, Ethereum, NEAR or Solana"
          meta={
            <span className="text-xs text-ink-muted">
              Zerion · DeBank · Sim by Dune · Live On-Chain RPC
            </span>
          }
        />
        <form onSubmit={handleInspectWallet} className="flex flex-col gap-3 px-5 py-4 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Paste trader address or domain (0x..., vitalik.eth, alice.near, or Solana pubkey)"
              className="w-full rounded-lg border border-line bg-canvas py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-ink-strong"
            />
          </div>
          <button
            type="submit"
            disabled={inspectBusy || !searchInput.trim()}
            className="btn btn-primary h-10 px-4 text-sm disabled:opacity-50"
          >
            {inspectBusy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Scanning chains…</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4" strokeWidth={1.75} />
                <span>Run Wallet X-Ray</span>
              </>
            )}
          </button>
        </form>
      </Panel>

      {errorMsg ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-danger-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : null}

      {statusNotice ? (
        <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-accent-text">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Top Performers Leaderboard */}
        <div className="space-y-6 lg:col-span-5">
          <Panel>
            <PanelHeader
              eyebrow="Cross-Chain Discovery"
              title="Top Performers (Memecoin-Free)"
              meta={<span className="text-xs text-ink-muted">{visibleTraders.length} tracked</span>}
            />
            <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3">
              {STYLE_FILTERS.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setStyleFilter(style)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    styleFilter === style
                      ? "bg-ink text-canvas"
                      : "bg-surface text-ink-secondary hover:bg-surface-raised"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            <div className="divide-y divide-line">
              {visibleTraders.map((trader) => {
                const isSelected =
                  selectedTrader?.address.toLowerCase() === trader.address.toLowerCase();
                return (
                  <button
                    key={trader.id}
                    type="button"
                    onClick={() => {
                      setSelectedTrader(trader);
                      setBriefing(null);
                      setInspectionNotes([]);
                      setQuotePreview(null);
                    }}
                    className={`flex w-full items-start justify-between gap-3 px-5 py-3.5 text-left transition-colors ${
                      isSelected ? "bg-surface-raised" : "hover:bg-surface"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">
                          {trader.resolvedHandle ?? trader.label ?? shortenMiddle(trader.address, 6, 4)}
                        </span>
                        <span className="chip text-[10px]">
                          {trader.dataMode === "live" ? "Live RPC" : "Sample"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {trader.primaryStyle} · {shortenMiddle(trader.address, 6, 4)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span
                          className={`chip text-[10px] ${
                            trader.isMemecoinFree
                              ? "border-green-200 bg-green-50 text-accent-text"
                              : "border-red-200 bg-red-50 text-danger-text"
                          }`}
                        >
                          {trader.isMemecoinFree ? "Memecoin-Free" : "Memecoin Filtered"}
                        </span>
                        <span className="chip text-[10px]">
                          {trader.positions.length} positions
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums text-ink">
                        {trader.realisedPnl90dUsd !== null
                          ? `+${formatUsd(trader.realisedPnl90dUsd)}`
                          : "Live RPC"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {trader.winRatePercent !== null
                          ? `${trader.winRatePercent}% win · ${trader.maxDrawdownPercent ?? 0}% DD`
                          : "On-chain balance"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Active Subscriptions */}
          <Panel>
            <PanelHeader
              eyebrow="Active Mirrors"
              title="Your Copy Subscriptions"
              meta={<span className="text-xs text-ink-muted">{subscriptions.length} active/saved</span>}
            />
            {subscriptions.length === 0 ? (
              <p className="px-5 py-6 text-xs text-ink-muted">
                No active copy subscriptions yet. Select a trader on the left and configure your
                NEAR funding & guardrail rules on the right.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="space-y-2.5 px-5 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {sub.trackedTrader.resolvedHandle ??
                            sub.trackedTrader.label ??
                            shortenMiddle(sub.trackedTrader.address, 6, 4)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Funded via <span className="font-mono text-ink">{sub.fundingNearAccountId}</span> ·{" "}
                          {sub.executionMode === "agent_auto_copy" ? "Agent Auto-Copy" : "Copy-with-Approval"}
                        </p>
                      </div>
                      <span
                        className={`chip text-[10px] ${
                          sub.status === "active"
                            ? "border-green-200 bg-green-50 text-accent-text"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {sub.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px] text-ink-secondary">
                      <span>Cap ${sub.maxUsdPerTrade}/trade</span>
                      <span>·</span>
                      <span>
                        Daily ${sub.dailyUsedUsd}/${sub.maxDailyBudgetUsd}
                      </span>
                      <span>·</span>
                      <span>Drift ≤{sub.maxPriceDriftBps} bps</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {sub.status !== "active" ? (
                        <button
                          type="button"
                          onClick={() => handleToggleSubscription(sub.id, "active")}
                          className="btn btn-secondary h-7 px-2.5 text-xs"
                        >
                          <Play className="size-3" /> Resume
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleSubscription(sub.id, "paused")}
                          className="btn btn-secondary h-7 px-2.5 text-xs"
                        >
                          <Pause className="size-3" /> Pause
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCheckSubscriptionActivity(sub)}
                        disabled={subCheckBusyId === sub.id || sub.status !== "active"}
                        className="btn btn-secondary h-7 px-2.5 text-xs"
                      >
                        {subCheckBusyId === sub.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Search className="size-3" />
                        )}
                        <span>Check &amp; Mirror Activity</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleSubscription(sub.id, "frozen")}
                        className="btn btn-secondary h-7 px-2.5 text-xs text-danger-text"
                      >
                        <Snowflake className="size-3" /> Emergency Freeze
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Right: Selected Trader X-Ray + Copy Configurator */}
        <div className="space-y-6 lg:col-span-7">
          {selectedTrader ? (
            <>
              <Panel>
                <PanelHeader
                  eyebrow="Verified Trader Profile"
                  title={
                    selectedTrader.resolvedHandle ??
                    selectedTrader.label ??
                    shortenMiddle(selectedTrader.address, 6, 4)
                  }
                  meta={
                    <span className="chip text-xs">
                      {selectedTrader.ecosystem.toUpperCase()} ·{" "}
                      {selectedTrader.dataMode === "live" ? "Live RPC" : "Sample"}
                    </span>
                  }
                />

                {/* AI Summary / Deterministic Briefing */}
                <div className="border-b border-line bg-surface px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <Sparkles className="size-3.5 text-accent-text" />
                      {briefing?.source === "near_ai_cloud"
                        ? `NEAR AI Cloud Briefing (${briefing.modelId})`
                        : "Deterministic Wallet X-Ray Briefing"}
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      Style: {selectedTrader.primaryStyle}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink">
                    {briefing?.headline ?? selectedTrader.aiSummary}
                  </p>
                  {briefing ? (
                    <p className="text-xs leading-relaxed text-ink-secondary">{briefing.summary}</p>
                  ) : null}

                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Spot & on-chain DeFi visibility only: any external CEX accounts or perp hedges
                      are unknown. Perps are excluded from 1Click spot mirroring.
                    </span>
                  </div>

                  {inspectionNotes.map((note, idx) => (
                    <p key={idx} className="text-[11px] text-ink-muted">
                      • {note}
                    </p>
                  ))}
                </div>

                {/* Positions Table */}
                <div className="divide-y divide-line">
                  {selectedTrader.positions.length === 0 ? (
                    <p className="px-5 py-6 text-xs text-ink-muted">
                      No verified non-memecoin holdings found on scanned chains for this address.
                    </p>
                  ) : (
                    selectedTrader.positions.map((pos, idx) => (
                      <div
                        key={`${pos.chainId}-${pos.contractAddress}-${idx}`}
                        className="flex flex-col justify-between gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
                      >
                        <div className="flex items-start gap-3">
                          <AssetIcon symbolOrName={pos.symbol} size="md" />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-ink">{pos.symbol}</span>
                              <ChainBadge chainId={pos.chainId === 0 ? 8453 : pos.chainId} />
                              <span className="chip text-[10px]">
                                {pos.copyableVia === "1click_direct"
                                  ? "1Click Direct"
                                  : pos.copyableVia === "1click_then_protocol"
                                    ? "1Click + Chain Sig"
                                    : "Blocked Memecoin"}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-ink-muted">
                              {pos.protocolName} · {pos.balanceDisplay} {pos.symbol}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <div className="text-right">
                            <p className="font-mono text-sm font-medium tabular-nums text-ink">
                              {pos.valueUsd !== null ? formatUsd(pos.valueUsd) : "—"}
                            </p>
                            <p className="text-[11px] text-ink-muted">
                              {pos.weightPercent !== null ? `${pos.weightPercent}% weight` : pos.actionKind}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handlePreviewCopyQuote(pos)}
                            disabled={quoteBusySymbol === pos.symbol}
                            className="btn btn-secondary h-8 px-3 text-xs"
                          >
                            {quoteBusySymbol === pos.symbol ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <>
                                <span>Dry Copy Quote</span>
                                <ArrowRight className="size-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Quote Preview Result */}
                {quotePreview ? (
                  <div className="border-t border-line bg-surface-raised px-5 py-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">
                        Copy Policy & Live 1Click Dry Quote Result
                      </span>
                      <span
                        className={`chip text-[10px] ${
                          quotePreview.allowed
                            ? "border-green-200 bg-green-50 text-accent-text"
                            : "border-red-200 bg-red-50 text-danger-text"
                        }`}
                      >
                        {quotePreview.allowed ? "Policy Passed (dry: true)" : "Policy Blocked"}
                      </span>
                    </div>

                    {quotePreview.allowed && quotePreview.quote ? (
                      <div className="grid gap-2 text-xs sm:grid-cols-3">
                        <div className="rounded-lg border border-line bg-canvas p-2.5">
                          <p className="text-[11px] text-ink-muted">From NEAR Hub</p>
                          <p className="font-mono font-semibold text-ink">
                            ${quotePreview.quote.amountInUsdc.toFixed(2)} USDC
                          </p>
                        </div>
                        <div className="rounded-lg border border-line bg-canvas p-2.5">
                          <p className="text-[11px] text-ink-muted">Quoted Output</p>
                          <p className="font-mono font-semibold text-ink">
                            {quotePreview.quote.amountOutFormatted ?? quotePreview.quote.amountOutAtomic}
                          </p>
                        </div>
                        <div className="rounded-lg border border-line bg-canvas p-2.5">
                          <p className="text-[11px] text-ink-muted">Est. Settlement</p>
                          <p className="font-mono font-semibold text-ink">
                            {quotePreview.quote.timeEstimateSeconds ?? "—"}s
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {quotePreview.evaluation.violations.map((v, i) => (
                          <p key={i} className="text-xs text-danger-text">
                            • [{v.code}] {v.message}
                          </p>
                        ))}
                      </div>
                    )}

                    {quotePreview.protocolFollowUp?.required ? (
                      <p className="text-[11px] text-ink-secondary">
                        <span className="font-semibold text-ink">Non-atomic 2nd step:</span>{" "}
                        {quotePreview.protocolFollowUp.stepLabel} (
                        <span className="font-mono">
                          {quotePreview.protocolFollowUp.contractAddress}
                        </span>
                        ) via {quotePreview.protocolFollowUp.signerMechanism}.
                      </p>
                    ) : null}

                    {quotePreview.allowed && quotePreview.quote ? (
                      <div className="space-y-3 pt-1">
                        <label className="flex items-start gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink">
                          <input
                            type="checkbox"
                            checked={execApproved}
                            onChange={(e) => setExecApproved(e.target.checked)}
                            className="mt-0.5 size-4 rounded border-line-strong accent-ink"
                          />
                          <span>
                            I explicitly approve mirroring{" "}
                            <strong className="font-mono">
                              ${quotePreview.quote.amountInUsdc.toFixed(2)} USDC
                            </strong>{" "}
                            from NEAR into <strong>{quotedPosition?.symbol ?? "asset"}</strong>
                            {quotePreview.protocolFollowUp?.required
                              ? " (Step 1 cross-chain move; Step 2 protocol call is separate and non-atomic)."
                              : "."}
                          </span>
                        </label>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleExecuteMirror}
                            disabled={execBusy || !execApproved}
                            className="btn btn-primary h-8 px-3 text-xs"
                          >
                            {execBusy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3.5" />
                            )}
                            <span>
                              {executionMode === "agent_auto_copy"
                                ? "Dispatch via NEAR Agent API"
                                : "Prepare Committed Mirror Quote"}
                            </span>
                          </button>

                          <Link
                            href={`/execute?direction=${
                              quotedPosition?.chainId === 42161 ? "base-to-arb" : "arb-to-base"
                            }&amount=${Math.max(1, Math.round(quotePreview.quote.amountInUsdc))}&copySymbol=${encodeURIComponent(
                              quotedPosition?.symbol ?? "",
                            )}&copyChain=${quotedPosition?.chainId ?? 8453}`}
                            className="btn btn-secondary h-8 px-3 text-xs"
                          >
                            <span>Open in Execution Console</span>
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </div>

                        {execResult ? (
                          <div className="rounded-lg border border-green-200 bg-green-50/70 p-3 text-xs text-ink space-y-1">
                            <p className="font-semibold text-accent-text">
                              {execResult.mode === "mode_b_agent_api"
                                ? `Agent Order Dispatched (${execResult.orderId ?? "submitted"})`
                                : "Committed 1Click Mirror Quote Ready"}
                            </p>
                            {execResult.depositAddress ? (
                              <p className="font-mono break-all">
                                Deposit Address: {execResult.depositAddress}
                              </p>
                            ) : null}
                            <p>
                              Size: ${execResult.amountInUsdc.toFixed(2)} USDC
                              {execResult.quoteId ? ` · Quote ${execResult.quoteId}` : ""}
                            </p>
                            {execResult.protocolFollowUp?.required ? (
                              <p className="text-ink-secondary">
                                {execResult.protocolFollowUp.stepLabel} (
                                <span className="font-mono">
                                  {execResult.protocolFollowUp.contractAddress}
                                </span>
                                )
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Panel>

              {/* NEAR Unified Copy Configuration Form */}
              <Panel>
                <PanelHeader
                  eyebrow="All Setup From NEAR"
                  title="Configure Copy Rules & Execution"
                  meta={
                    <span className="chip border-green-200 bg-green-50 text-[10px] text-accent-text">
                      No Memecoins Enforced
                    </span>
                  }
                />

                <form onSubmit={handleSaveSubscription} className="space-y-4 px-5 py-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-xs">
                      <span className="font-medium text-ink">Funding NEAR Account</span>
                      <input
                        type="text"
                        value={fundingNearAccountId}
                        onChange={(e) => setFundingNearAccountId(e.target.value)}
                        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink"
                        placeholder="alice.near"
                      />
                    </label>

                    <label className="space-y-1 text-xs">
                      <span className="font-medium text-ink">Execution Mode</span>
                      <select
                        value={executionMode}
                        onChange={(e) =>
                          setExecutionMode(
                            e.target.value as "approval_required" | "agent_auto_copy",
                          )
                        }
                        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
                      >
                        <option value="approval_required">
                          Mode A — Copy-with-Approval (1Click signature)
                        </option>
                        <option value="agent_auto_copy">
                          Mode B — Automated NEAR Agent API + Chain Signatures
                        </option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs">
                      <span className="font-medium text-ink">Max USD per Trade</span>
                      <input
                        type="number"
                        min={5}
                        max={10000}
                        value={maxUsdPerTrade}
                        onChange={(e) => setMaxUsdPerTrade(Number(e.target.value))}
                        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink"
                      />
                    </label>

                    <label className="space-y-1 text-xs">
                      <span className="font-medium text-ink">Max Daily Copy Budget (USD)</span>
                      <input
                        type="number"
                        min={5}
                        max={50000}
                        value={maxDailyBudgetUsd}
                        onChange={(e) => setMaxDailyBudgetUsd(Number(e.target.value))}
                        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink"
                      />
                    </label>

                    <label className="space-y-1 text-xs">
                      <span className="font-medium text-ink">Mirror Scale (% of leader fill)</span>
                      <select
                        value={copyScaleBps}
                        onChange={(e) => setCopyScaleBps(Number(e.target.value))}
                        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
                      >
                        <option value={500}>5% (Conservative)</option>
                        <option value={1000}>10% (Standard)</option>
                        <option value={2500}>25%</option>
                        <option value={5000}>50%</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs">
                      <span className="font-medium text-ink">Max Price Drift Guard (bps)</span>
                      <input
                        type="number"
                        min={10}
                        max={1000}
                        value={maxPriceDriftBps}
                        onChange={(e) => setMaxPriceDriftBps(Number(e.target.value))}
                        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink"
                      />
                    </label>
                  </div>

                  <div className="space-y-2 rounded-xl border border-line bg-surface p-3.5 text-xs">
                    <p className="font-medium text-ink">Allowed Mirror Strategies</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center gap-2 text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={copySpot1Click}
                          onChange={(e) => setCopySpot1Click(e.target.checked)}
                        />
                        Major Spot Assets (1Click Direct)
                      </label>
                      <label className="flex items-center gap-2 text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={copyVaults}
                          onChange={(e) => setCopyVaults(e.target.checked)}
                        />
                        1Click Earn Yield Vaults
                      </label>
                      <label className="flex items-center gap-2 text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={copyLending}
                          onChange={(e) => setCopyLending(e.target.checked)}
                        />
                        Aave V3 Supply (2-Step Chain Sig)
                      </label>
                      <label className="flex items-center gap-2 text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={copyLp}
                          onChange={(e) => setCopyLp(e.target.checked)}
                        />
                        Uniswap V3 LP (2-Step Chain Sig)
                      </label>
                    </div>
                  </div>

                  {nearSetupDescriptor ? (
                    <div className="rounded-xl border border-line bg-surface-raised p-3.5 text-xs space-y-1.5">
                      <p className="font-semibold text-ink">
                        NEAR Agent API & Chain Signatures (`v1.signer`) Grant Scope
                      </p>
                      {nearSetupDescriptor.humanSummary.map((line, i) => (
                        <p key={i} className="text-ink-secondary">
                          • {line}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={subBusy}
                    className="btn btn-primary h-10 w-full text-sm disabled:opacity-50"
                  >
                    {subBusy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>Saving NEAR Copy Rules…</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" />
                        <span>Activate Copytrading from NEAR</span>
                      </>
                    )}
                  </button>
                </form>
              </Panel>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
