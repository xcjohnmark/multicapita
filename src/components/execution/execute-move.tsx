"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatAtomic } from "@/lib/finance/amounts";
import "@/lib/wallet/provider";
import { shortenMiddle } from "@/lib/format";
import { StatusDot } from "@/components/ui/primitives";

/**
 * Cross-chain execution console.
 *
 * Two modes, clearly separated:
 *  - **Preview** works everywhere. It is a dry quote plus live balances plus a guardrail verdict.
 *    Nothing is persisted and no deposit address is created.
 *  - **Prepare** only works in live mode, requires an explicit approval that restates the exact
 *    amount, and returns a deposit instruction the wallet must sign. A policy pass is not an
 *    approval, and the UI says so.
 *
 * The money path is never automatic: the wallet signs, the user pastes the hash, the user asks
 * for the status. Each step is independently confirmed.
 */

type Direction = "base-to-arb" | "arb-to-base";

type Violation = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

type Evaluation = {
  ok: boolean;
  violations: Violation[];
  destinationSharePercent: number;
  minimumOutputAtomic: string;
};

type PreviewResponse = {
  dry: true;
  amountAtomic: string;
  expectedOutputAtomic: string;
  minimumOutputAtomic: string;
  impliedCostBps: number;
  deadline: string;
  evaluation: Evaluation;
  balances: Record<string, string>;
  chainErrors: string[];
  guardrails: { maxSlippageBps: number; maxChainExposurePercent: number };
  dataMode: string;
  executionEnabled: boolean;
};

type PreparedResponse =
  | {
      ok: true;
      quoteId: string;
      instruction: {
        chainId: number;
        to: string;
        data: string;
        value: string;
        amountAtomic: string;
        tokenAddress: string | null;
        tokenSymbol: string;
        explorerUrl: string;
      };
      quote: {
        correlationId: string;
        amountIn: string;
        amountOut: string;
        minAmountOut: string | null;
        deadline: string | null;
      };
      evaluation: Evaluation;
      dataMode: string;
    }
  | {
      ok: false;
      refusal: string;
      evaluation: Evaluation;
      dataMode: string;
    };

type StatusResponse = {
  quoteId: string;
  status: string;
  isTerminal: boolean;
  terminalStates: string[];
  correlationId: string | null;
  updatedAt: string | null;
  localStatus: string;
  depositAddress: string;
};

const USDC = 6;

export function ExecuteMove() {
  const searchParams = useSearchParams();
  const paramDirection = searchParams.get("direction");
  const paramAmount = searchParams.get("amount");

  const [direction, setDirection] = useState<Direction>(
    paramDirection === "arb-to-base" ? "arb-to-base" : "base-to-arb",
  );
  const [amount, setAmount] = useState(
    paramAmount && !Number.isNaN(Number(paramAmount)) && Number(paramAmount) > 0
      ? paramAmount
      : "100",
  );
  const [walletAddress, setWalletAddress] = useState("");
  const [approved, setApproved] = useState(false);
  const [pending, setPending] = useState<"preview" | "prepare" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [prepared, setPrepared] = useState<PreparedResponse | null>(null);
  const [txHash, setTxHash] = useState("");
  const [depositSubmitted, setDepositSubmitted] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    if (paramDirection === "base-to-arb" || paramDirection === "arb-to-base") {
      setDirection(paramDirection);
    }
    if (paramAmount && !Number.isNaN(Number(paramAmount)) && Number(paramAmount) > 0) {
      setAmount(paramAmount);
    }
  }, [paramDirection, paramAmount]);

  const fromChainId = direction === "base-to-arb" ? 8453 : 42161;
  const toChainId = direction === "base-to-arb" ? 42161 : 8453;

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const account = (accounts as string[])[0];
        if (account) setWalletAddress(account);
      })
      .catch(() => {
        /* no session */
      });
  }, []);

  const connect = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      setError("No injected wallet found.");
      return;
    }
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts[0]) setWalletAddress(accounts[0]);
    } catch {
      setError("The wallet refused the connection request.");
    }
  }, []);

  async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { data?: T; error?: { message: string } };
    return { ok: response.ok, data: json.data, error: json.error?.message };
  }

  async function runPreview(event: React.FormEvent) {
    event.preventDefault();
    setPending("preview");
    setError(null);
    try {
      const result = await post<PreviewResponse>("/api/execution/preview", {
        fromChainId,
        toChainId,
        amount,
        walletAddress,
      });
      if (!result.ok || !result.data) {
        setError(result.error ?? "Preview failed.");
        setPreview(null);
        return;
      }
      setPreview(result.data);
      setPrepared(null);
      setStatus(null);
      setDepositSubmitted(false);
      setTxHash("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  async function runPrepare() {
    setPending("prepare");
    setError(null);
    try {
      const result = await post<PreparedResponse>("/api/execution/prepare", {
        fromChainId,
        toChainId,
        amount,
        walletAddress,
        approval: { accepted: approved, amount },
      });
      if (!result.ok || !result.data) {
        setError(result.error ?? "Preparation failed.");
        setPrepared(null);
        return;
      }
      setPrepared(result.data);
      setStatus(null);
      setDepositSubmitted(false);
      setTxHash("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  async function signAndSend() {
    if (!prepared || !prepared.ok) return;
    const provider = window.ethereum;
    if (!provider) {
      setError("No injected wallet found.");
      return;
    }
    setError(null);
    try {
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: walletAddress,
            to: prepared.instruction.to,
            data: prepared.instruction.data,
            value: `0x${BigInt(prepared.instruction.value).toString(16)}`,
          },
        ],
      })) as string;
      if (typeof hash === "string" && hash.startsWith("0x")) {
        setTxHash(hash);
      } else {
        setError("The wallet did not return a transaction hash.");
      }
    } catch (cause) {
      const code = (cause as { code?: number } | undefined)?.code;
      setError(code === 4001 ? "The transaction was rejected in the wallet." : "The wallet refused the transaction.");
    }
  }

  async function submitDeposit() {
    if (!prepared || !prepared.ok || !txHash) return;
    setError(null);
    try {
      const result = await post<{ transactionId: string }>("/api/execution/deposit", {
        quoteId: prepared.quoteId,
        txHash,
      });
      if (!result.ok) {
        setError(result.error ?? "Deposit notification failed.");
        return;
      }
      setDepositSubmitted(true);
      await refreshStatus();
    } catch {
      setError("Could not reach the server.");
    }
  }

  async function refreshStatus() {
    if (!prepared || !prepared.ok) return;
    const response = await fetch(`/api/execution/${prepared.quoteId}`);
    const json = (await response.json()) as { data?: StatusResponse; error?: { message: string } };
    if (response.ok && json.data) setStatus(json.data);
    else setError(json.error?.message ?? "Status read failed.");
  }

  const executionEnabled = preview?.executionEnabled ?? false;
  const displayAmount = preview ? formatAtomic(preview.amountAtomic, USDC) : amount;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <form onSubmit={runPreview} className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Move</p>
              <h2 className="text-sm font-semibold">Cross-chain USDC move</h2>
            </div>
            <span className="chip">
              <StatusDot tone={preview?.evaluation.ok ? "ok" : "idle"} />
              {preview ? (preview.evaluation.ok ? "Guardrails passed" : "Guardrails failed") : "Not checked"}
            </span>
          </div>

          <div className="space-y-4 px-4 py-4">
            <div>
              <p className="eyebrow mb-1.5">Direction</p>
              <div className="grid grid-cols-2 gap-2">
                <DirectionButton
                  active={direction === "base-to-arb"}
                  onClick={() => setDirection("base-to-arb")}
                  label="Base → Arbitrum"
                />
                <DirectionButton
                  active={direction === "arb-to-base"}
                  onClick={() => setDirection("arb-to-base")}
                  label="Arbitrum → Base"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="amount" className="eyebrow mb-1.5 block">
                  Amount (USDC)
                </label>
                <input
                  id="amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink"
                  placeholder="100"
                />
              </div>
              <div>
                <label htmlFor="walletAddress" className="eyebrow mb-1.5 block">
                  Wallet address
                </label>
                <div className="flex gap-2">
                  <input
                    id="walletAddress"
                    value={walletAddress}
                    onChange={(event) => setWalletAddress(event.target.value)}
                    className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink"
                    placeholder="0x…"
                  />
                  <button type="button" onClick={connect} className="btn h-9 shrink-0 px-3 text-xs">
                    Connect
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-xs text-ink-faint">
                A preview is a dry quote: no deposit address, nothing signed. Execution needs live
                mode, an explicit approval and a wallet signature.
              </p>
              <button type="submit" className="btn btn-primary" disabled={pending !== null}>
                {pending === "preview" ? "Previewing…" : "Preview move"}
              </button>
            </div>
          </div>
        </form>

        {error ? (
          <div className="rounded-panel border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-ink">
            <span className="font-semibold text-danger">Failed. </span>
            {error}
          </div>
        ) : null}

        {preview ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow mb-1">Preview</p>
                <h2 className="text-sm font-semibold">Dry quote and live balances</h2>
              </div>
              <span className="chip border-warn/30 text-warn">
                <StatusDot tone="warn" /> Dry run
              </span>
            </div>

            <dl className="grid gap-x-6 gap-y-2.5 px-4 py-4 text-xs sm:grid-cols-2">
              <Row label="You send" value={`${formatAtomic(preview.amountAtomic, USDC)} USDC`} />
              <Row
                label="Expected out"
                value={`${formatAtomic(preview.expectedOutputAtomic, USDC)} USDC`}
              />
              <Row
                label="Minimum accepted"
                value={`${formatAtomic(preview.minimumOutputAtomic, USDC)} USDC`}
              />
              <Row label="Implied cost" value={`${preview.impliedCostBps.toFixed(2)} bps`} />
              <Row
                label={`${direction === "base-to-arb" ? "Arbitrum" : "Base"} share after`}
                value={`${preview.evaluation.destinationSharePercent.toFixed(1)}%`}
              />
              <Row label="Quote deadline" value={preview.deadline || "not stated"} />
            </dl>

            {preview.chainErrors.length > 0 ? (
              <p className="border-t border-line px-4 py-3 text-xs text-warn">
                Some chains could not be read: {preview.chainErrors.join("; ")}
              </p>
            ) : null}

            {preview.evaluation.violations.length > 0 ? (
              <div className="border-t border-line px-4 py-3">
                <p className="eyebrow mb-1.5">Guardrail findings</p>
                <ul className="space-y-1">
                  {preview.evaluation.violations.map((violation) => (
                    <li key={violation.code} className="flex gap-2 text-xs">
                      <StatusDot tone={violation.severity === "error" ? "error" : "warn"} />
                      <span className="text-ink-muted">
                        <span className="font-mono text-[10px] uppercase text-ink-faint">
                          {violation.code}
                        </span>{" "}
                        {violation.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="max-w-md text-[11px] text-ink-faint">
                To request a committed quote, prepare the move. That requires live mode and the
                explicit approval below.
              </p>
              <button
                type="button"
                onClick={runPrepare}
                disabled={!executionEnabled || !preview.evaluation.ok || pending !== null}
                className="btn btn-primary"
              >
                {pending === "prepare"
                  ? "Preparing…"
                  : executionEnabled
                    ? "Prepare move"
                    : "Execution disabled"}
              </button>
            </div>

            <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
              Read from a 1Click dry quote and live RPC balances. No funds move in this step.
            </p>
          </section>
        ) : null}

        {prepared ? (
          prepared.ok ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow mb-1">Prepared</p>
                  <h2 className="text-sm font-semibold">Deposit instruction</h2>
                </div>
                <span className="chip border-accent/30 text-accent">
                  <StatusDot tone="ok" /> Awaiting signature
                </span>
              </div>

              <dl className="grid gap-x-6 gap-y-2.5 px-4 py-4 text-xs">
                <Row label="Quote" value={prepared.quote.correlationId || "—"} />
                <Row
                  label="Deposit"
                  value={`${formatAtomic(prepared.instruction.amountAtomic, USDC)} ${prepared.instruction.tokenSymbol}`}
                />
                <Row label="To deposit address" value={shortenMiddle(prepared.instruction.to, 10, 6)} />
                <Row
                  label="Deadline"
                  value={prepared.quote.deadline ? new Date(prepared.quote.deadline).toISOString() : "not stated"}
                />
                <Row label="Explorer" value={prepared.instruction.explorerUrl} />
              </dl>

              <div className="space-y-3 border-t border-line px-4 py-4">
                <label className="flex items-start gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(event) => setApproved(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I explicitly approve moving exactly {displayAmount} USDC from my wallet to this
                    deposit address. I understand this settles one leg and is not atomic.
                  </span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={signAndSend} className="btn btn-primary" disabled={!approved}>
                    Sign and send deposit
                  </button>
                  {txHash ? (
                    <button
                      type="button"
                      onClick={submitDeposit}
                      className="btn"
                      disabled={depositSubmitted}
                    >
                      {depositSubmitted ? "Deposit submitted" : "Submit deposit to 1Click"}
                    </button>
                  ) : null}
                  {depositSubmitted ? (
                    <button type="button" onClick={refreshStatus} className="btn">
                      Check status
                    </button>
                  ) : null}
                </div>

                {txHash ? (
                  <p className="font-mono text-[11px] break-all text-ink-faint">{txHash}</p>
                ) : null}

                {status ? (
                  <div className="rounded-md border border-line bg-canvas px-3 py-2.5 text-xs">
                    <p className="text-ink">
                      Status: <span className="font-mono">{status.status}</span>
                      {status.isTerminal ? " (terminal)" : " (still settling)"}
                    </p>
                    <p className="mt-1 text-ink-faint">
                      Terminal states: {status.terminalStates.join(", ")}
                    </p>
                    {status.updatedAt ? (
                      <p className="mt-1 text-ink-faint">Updated {status.updatedAt}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
                Committed quotes expire. If the deposit does not arrive in time the quote is
                abandoned and nothing moves.
              </p>
            </section>
          ) : (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow mb-1">Refused</p>
                  <h2 className="text-sm font-semibold">Execution was not prepared</h2>
                </div>
                <span className="chip border-danger/30 text-danger">
                  <StatusDot tone="error" /> Blocked
                </span>
              </div>
              <p className="px-4 py-4 text-sm text-ink">{prepared.refusal}</p>
              {prepared.evaluation.violations.length > 0 ? (
                <ul className="space-y-1 border-t border-line px-4 py-3">
                  {prepared.evaluation.violations.map((violation) => (
                    <li key={violation.code} className="flex gap-2 text-xs text-ink-muted">
                      <StatusDot tone={violation.severity === "error" ? "error" : "warn"} />
                      <span>
                        <span className="font-mono text-[10px] uppercase text-ink-faint">
                          {violation.code}
                        </span>{" "}
                        {violation.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          )
        ) : null}
      </div>

      <aside className="space-y-6">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Gate</p>
              <h2 className="text-sm font-semibold">What execution requires</h2>
            </div>
          </div>
          <ol className="space-y-3 px-4 py-4 text-xs text-ink-muted">
            <Step n="1" title="Dry preview">
              A live dry quote plus live RPC balances, checked against the guardrails.
            </Step>
            <Step n="2" title="Live mode">
              {executionEnabled
                ? "APP_DATA_MODE is live, so a committed quote can be requested."
                : "APP_DATA_MODE is not live. A committed quote will be refused by the server."}
            </Step>
            <Step n="3" title="Explicit approval">
              The approval restates the exact amount. The policy engine cannot approve anything.
            </Step>
            <Step n="4" title="Wallet signature">
              The wallet signs the deposit. The app never holds a key.
            </Step>
            <Step n="5" title="Settlement">
              1Click settles one leg. Status is polled, not assumed.
            </Step>
          </ol>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow mb-1">Why the preview is honest</p>
              <h2 className="text-sm font-semibold">Data provenance</h2>
            </div>
          </div>
          <p className="px-4 py-4 text-xs leading-relaxed text-ink-muted">
            The preview quotes a real 1Click dry quote and real balances from public RPC. It does
            not create a deposit address and does not persist a quote. A prepared move is
            persisted with its quote reference, deposit address and deadline, and every refusal is
            audited too.
          </p>
        </section>
      </aside>
    </div>
  );
}

function DirectionButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-3 py-2 text-xs transition-colors ${
        active
          ? "border-accent/40 bg-accent/[0.08] text-ink"
          : "border-line bg-canvas text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="metric text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong text-[10px] text-ink-muted">
        {n}
      </span>
      <span>
        <span className="font-medium text-ink">{title}. </span>
        {children}
      </span>
    </li>
  );
}
