/**
 * Simulated balance ledger.
 *
 * A simulated plan never touches a chain, but the demo must still feel consistent: after a
 * simulated deposit, "Available" goes down and the new position appears. This overlay applies a
 * session's simulated plans to its starting balances:
 *
 *   - the debit (what left the wallet) applies from approval until the plan fails or is cancelled;
 *   - the credit (what arrives, e.g. a swap's output or a withdrawal) applies once it completes.
 *
 * Pure. Amounts stay atomic bigints; the USD value is recomputed from the line's own price.
 */

export type LedgerLine = {
  chainId: number;
  tokenAddress: string;
  symbol: string;
  decimals: number;
  amountAtomic: bigint;
  priceUsd: number | null;
};

export type LedgerEffect = {
  chainId: number;
  tokenAddress: string;
  symbol: string;
  decimals: number;
  amountAtomic: string;
  priceUsd?: number | null;
};

export type LedgerPlan = {
  status: string;
  debit: LedgerEffect | null;
  credit: LedgerEffect | null;
};

const key = (chainId: number, tokenAddress: string) => `${chainId}:${tokenAddress.toLowerCase()}`;

export function applySimulatedLedger(lines: LedgerLine[], plans: LedgerPlan[]): LedgerLine[] {
  const byKey = new Map<string, LedgerLine>();
  for (const line of lines) {
    const k = key(line.chainId, line.tokenAddress);
    const existing = byKey.get(k);
    byKey.set(k, existing ? { ...existing, amountAtomic: existing.amountAtomic + line.amountAtomic } : { ...line });
  }

  const touch = (effect: LedgerEffect, sign: 1n | -1n) => {
    const k = key(effect.chainId, effect.tokenAddress);
    const amount = BigInt(effect.amountAtomic) * sign;
    const existing = byKey.get(k);
    if (existing) {
      const next = existing.amountAtomic + amount;
      byKey.set(k, { ...existing, amountAtomic: next < 0n ? 0n : next });
    } else if (amount > 0n) {
      byKey.set(k, {
        chainId: effect.chainId,
        tokenAddress: effect.tokenAddress.toLowerCase(),
        symbol: effect.symbol,
        decimals: effect.decimals,
        amountAtomic: amount,
        priceUsd: effect.priceUsd ?? null,
      });
    }
  };

  for (const plan of plans) {
    if (plan.status === "failed" || plan.status === "cancelled" || plan.status === "draft") continue;
    if (plan.debit) touch(plan.debit, -1n);
    if (plan.status === "completed" && plan.credit) touch(plan.credit, 1n);
  }

  return [...byKey.values()];
}

/**
 * Simulated exits never edit a shared position row (a seeded sample position is visible to every
 * demo visitor). Instead each session's completed exit plans are applied on read: the withdrawn
 * USD value comes off the position, and a position drawn to zero shows as closed.
 */
export type PositionLike = { id: string; currentValueUsd: number | null; status: string };
export type PositionExit = { positionId: string; status: string; amountUsd: number | null; closes: boolean };

export function applyPositionExits<T extends PositionLike>(positions: T[], exits: PositionExit[]): T[] {
  const withdrawn = new Map<string, { usd: number; closes: boolean }>();
  for (const exit of exits) {
    if (exit.status !== "completed") continue;
    const entry = withdrawn.get(exit.positionId) ?? { usd: 0, closes: false };
    entry.usd += exit.amountUsd ?? 0;
    entry.closes = entry.closes || exit.closes;
    withdrawn.set(exit.positionId, entry);
  }
  return positions.map((position) => {
    const exit = withdrawn.get(position.id);
    if (!exit) return position;
    const remaining = Math.max((position.currentValueUsd ?? 0) - exit.usd, 0);
    const closed = exit.closes || remaining < 0.01;
    return { ...position, currentValueUsd: closed ? 0 : remaining, status: closed ? "closed" : position.status };
  });
}

/** USD value of a line for display (float allowed: valuation only). */
export function lineValueUsd(line: LedgerLine): number | null {
  if (line.priceUsd === null) return null;
  return (Number(line.amountAtomic) / 10 ** line.decimals) * line.priceUsd;
}
