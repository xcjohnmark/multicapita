/**
 * Exact sizing for multi-step execution plans.
 *
 * Every amount that a later step signs is derived here from atomic integers. A step that follows
 * a cross-chain leg is sized from that leg's *guaranteed minimum* output, never from the amount
 * the user typed: the user typed what leaves their wallet, not what arrives.
 *
 * Pure: no I/O, no floats on atomic values.
 */

/** Amount available to the step after an optional preceding leg. */
export function amountAfterLeg(input: { amountAtomic: bigint; legMinOutAtomic: bigint | null }): bigint {
  if (input.amountAtomic < 0n) throw new Error("Amount cannot be negative.");
  if (input.legMinOutAtomic === null) return input.amountAtomic;
  if (input.legMinOutAtomic < 0n) throw new Error("Leg output cannot be negative.");
  return input.legMinOutAtomic;
}

/**
 * Cost of a same-asset leg (e.g. USDC Base → USDC Arbitrum) in basis points, with two decimals of
 * a basis point. Amounts are normalised to the larger decimals first so 6- and 18-decimal tokens
 * compare correctly. A leg that returns more than it took costs 0.
 */
export function legCostBps(input: {
  amountInAtomic: bigint;
  decimalsIn: number;
  amountOutAtomic: bigint;
  decimalsOut: number;
}): number {
  if (input.amountInAtomic <= 0n) return 0;
  const scale = Math.max(input.decimalsIn, input.decimalsOut);
  const inNorm = input.amountInAtomic * 10n ** BigInt(scale - input.decimalsIn);
  const outNorm = input.amountOutAtomic * 10n ** BigInt(scale - input.decimalsOut);
  if (outNorm >= inNorm) return 0;
  return Number(((inNorm - outNorm) * 1_000_000n) / inNorm) / 100;
}

/** `bps` share of an amount, rounded down (percent shortcuts: 2500 = 25%). */
export function shareOf(amountAtomic: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error("bps must be 0..10000");
  return (amountAtomic * BigInt(bps)) / 10_000n;
}

/**
 * Split an amount into two legs for a stable pair LP mint. The remainder of an odd amount goes to
 * the first leg so nothing is lost. Both tokens must share decimals; different decimals would need
 * a price, which this function refuses to guess.
 */
export function splitPairEven(input: {
  amountAtomic: bigint;
  decimals0: number;
  decimals1: number;
}): [bigint, bigint] {
  if (input.decimals0 !== input.decimals1) {
    throw new Error("Pair tokens use different decimals; an even split needs a price.");
  }
  const half = input.amountAtomic / 2n;
  return [input.amountAtomic - half, half];
}

/**
 * Pick the funding chain for each leg of a multi-leg plan.
 *
 * Prefers the leg's own chain (no bridge) when that chain still has enough of the asset; otherwise
 * the chain with the largest remaining balance. Balances are drawn down as legs are assigned, so
 * two legs can never spend the same units. Returns `null` for a leg no single chain can fund.
 */
export function fundLegs(input: {
  legs: { chainId: number; amountAtomic: bigint }[];
  balances: Record<number, bigint>;
}): ({ fromChainId: number } | null)[] {
  const remaining = new Map<number, bigint>(
    Object.entries(input.balances).map(([chainId, amount]) => [Number(chainId), amount]),
  );
  return input.legs.map((leg) => {
    const own = remaining.get(leg.chainId) ?? 0n;
    if (own >= leg.amountAtomic) {
      remaining.set(leg.chainId, own - leg.amountAtomic);
      return { fromChainId: leg.chainId };
    }
    let best: { chainId: number; amount: bigint } | null = null;
    for (const [chainId, amount] of remaining) {
      if (amount >= leg.amountAtomic && (!best || amount > best.amount)) best = { chainId, amount };
    }
    if (!best) return null;
    remaining.set(best.chainId, best.amount - leg.amountAtomic);
    return { fromChainId: best.chainId };
  });
}

/**
 * Estimated yearly return in USD for display only. Floats are acceptable here: this number is a
 * research estimate shown next to a rate, and it never reaches a transaction.
 */
export function estimatedYearlyUsd(amountUsd: number | null, ratePercent: number | null): number | null {
  if (amountUsd === null || ratePercent === null) return null;
  if (!Number.isFinite(amountUsd) || !Number.isFinite(ratePercent)) return null;
  return (amountUsd * ratePercent) / 100;
}
