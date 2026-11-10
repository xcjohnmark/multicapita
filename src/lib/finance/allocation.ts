import { AmountError } from "./amounts";

/**
 * Deterministic allocation of a whole-dollar amount across weighted legs.
 *
 * Works in integer cents so the legs always sum exactly to the total: the remainder from
 * integer division is given to the largest leg (ties broken by index), never dropped and never
 * left as a floating-point residue.
 */
export function allocateByWeightBps(totalCents: bigint, weightsBps: number[]): bigint[] {
  if (totalCents < 0n) throw new AmountError("Total cannot be negative");
  if (weightsBps.length === 0) return [];
  if (weightsBps.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new AmountError("Weights must be non-negative integers (basis points)");
  }

  const totalWeight = weightsBps.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return weightsBps.map(() => 0n);

  const amounts = weightsBps.map((w) => (totalCents * BigInt(w)) / BigInt(totalWeight));
  const allocated = amounts.reduce((sum, a) => sum + a, 0n);
  const remainder = totalCents - allocated;

  if (remainder > 0n) {
    // Largest weight wins; ties go to the earliest leg for determinism.
    let target = 0;
    for (let i = 1; i < weightsBps.length; i += 1) {
      if (weightsBps[i] > weightsBps[target]) target = i;
    }
    amounts[target] += remainder;
  }

  return amounts;
}

/**
 * Normalise arbitrary weights to exactly 10 000 bps.
 * Returns `null` when there is nothing to normalise.
 */
export function normaliseWeights(weights: number[]): number[] | null {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;

  const scaled = weights.map((w) => Math.round((w / total) * 10_000));
  const drift = 10_000 - scaled.reduce((sum, w) => sum + w, 0);
  if (drift !== 0) {
    let target = 0;
    for (let i = 1; i < scaled.length; i += 1) {
      if (scaled[i] > scaled[target]) target = i;
    }
    scaled[target] += drift;
  }
  return scaled;
}

export function usdToCents(usd: number): bigint {
  if (!Number.isFinite(usd)) throw new AmountError(`Invalid USD value: ${usd}`);
  return BigInt(Math.round(usd * 100));
}

export function centsToUsd(cents: bigint): number {
  return Number(cents) / 100;
}

export function percentOfCents(cents: bigint, percent: number): bigint {
  if (percent < 0 || percent > 100) throw new AmountError(`Invalid percentage: ${percent}`);
  return (cents * BigInt(Math.round(percent * 100))) / 10_000n;
}

/**
 * Ceiling variant of {@link percentOfCents}.
 *
 * Use this when the result is a *minimum* that must be withheld (a liquidity reserve). Flooring
 * a reserve makes it possible to sit a fraction of a cent below the configured percentage, which
 * would then be reported as a violation of the user's own guardrail.
 */
export function ceilPercentOfCents(cents: bigint, percent: number): bigint {
  if (percent < 0 || percent > 100) throw new AmountError(`Invalid percentage: ${percent}`);
  const scaled = BigInt(Math.round(percent * 100));
  const product = cents * scaled;
  const floored = product / 10_000n;
  return product % 10_000n === 0n ? floored : floored + 1n;
}
