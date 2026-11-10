/**
 * Exact decimal <-> atomic integer conversion.
 *
 * Every token amount that enters the system is converted here. Floats are never
 * used to represent balances or trade sizes: `0.1 + 0.2` must never decide how
 * much USDC leaves a wallet.
 */

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

/**
 * Convert a human decimal string (e.g. "12.345678") into atomic units.
 * Rejects values that would silently lose precision.
 */
export function parseDecimalToAtomic(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new AmountError(`Invalid decimals: ${decimals}`);
  }
  const trimmed = value.trim();
  if (!/^-?\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === "." || trimmed === "-") {
    throw new AmountError(`Invalid decimal amount: "${value}"`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");

  if (fraction.length > decimals) {
    // Allow only trailing zeros beyond precision: "0.0" for an integer token is exact,
    // "0.01" is not, and silently rounding the latter would be a financial bug.
    const excess = fraction.slice(decimals);
    if (!/^0*$/.test(excess)) {
      throw new AmountError(
        `Amount "${value}" has ${fraction.length} decimal places but token only supports ${decimals}`,
      );
    }
  }

  const padded = fraction.slice(0, decimals).padEnd(decimals, "0");
  const atomic = BigInt(`${whole || "0"}${padded}`);
  return negative ? -atomic : atomic;
}

/**
 * Convert atomic units back into an exact decimal string.
 * Never returns exponent notation.
 */
export function formatAtomic(atomic: bigint | string, decimals: number): string {
  const value = typeof atomic === "string" ? BigInt(atomic) : atomic;
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");

  const whole = digits.slice(0, digits.length - decimals) || "0";
  const fraction = decimals === 0 ? "" : digits.slice(digits.length - decimals);
  const trimmedFraction = fraction.replace(/0+$/, "");
  const result = trimmedFraction ? `${whole}.${trimmedFraction}` : whole;

  return negative ? `-${result}` : result;
}

/** Display-only conversion. Never use the result to build a transaction. */
export function atomicToNumber(atomic: bigint | string, decimals: number): number {
  return Number(formatAtomic(atomic, decimals));
}

/** Basis points (1 bp = 0.01%). */
export function bpsToFraction(bps: number): number {
  return bps / 10_000;
}

/**
 * Apply a slippage tolerance to an amount, rounding down (protective for the user
 * when setting a minimum output).
 */
export function applySlippageDown(atomic: bigint, bps: number): bigint {
  if (bps < 0 || bps > 10_000) throw new AmountError(`Invalid slippage: ${bps} bps`);
  return (atomic * BigInt(10_000 - bps)) / 10_000n;
}

/** Apply a slippage tolerance upward (protective when setting a maximum input). */
export function applySlippageUp(atomic: bigint, bps: number): bigint {
  if (bps < 0 || bps > 10_000) throw new AmountError(`Invalid slippage: ${bps} bps`);
  return (atomic * BigInt(10_000 + bps) + 9_999n) / 10_000n;
}
