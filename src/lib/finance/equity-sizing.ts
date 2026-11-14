import { applySlippageDown } from "./amounts";

/**
 * Minimum output for a tokenized-stock swap through SwapRouter02.
 *
 * The DEX price is a USD float from the price feed. It is fixed to 4 decimal places once (an
 * integer in units of $0.0001) and every later step is integer arithmetic on atomic amounts, so
 * the number that reaches `amountOutMinimum` never depends on float rounding of the amount.
 *
 *  - buy:  USDC (6 decimals) in, stock (`equityDecimals`) out
 *  - sell: stock in, USDC out
 *
 * Returns at least 1 so a swap can never be sent with an unprotected zero minimum.
 */
export function equityMinOutputAtomic(input: {
  direction: "buy" | "sell";
  amountInAtomic: bigint;
  priceUsd: number;
  equityDecimals: number;
  slippageBps: number;
  usdcDecimals?: number;
}): bigint {
  if (input.amountInAtomic <= 0n) throw new Error("Amount must be greater than zero.");
  if (!Number.isFinite(input.priceUsd) || input.priceUsd <= 0) throw new Error("A positive price is required.");
  const priceE4 = BigInt(Math.round(input.priceUsd * 10_000));
  if (priceE4 <= 0n) throw new Error("Price is below the supported precision.");
  const usdcUnit = 10n ** BigInt(input.usdcDecimals ?? 6);
  const equityUnit = 10n ** BigInt(input.equityDecimals);

  const rawOut =
    input.direction === "buy"
      ? (input.amountInAtomic * equityUnit * 10_000n) / (priceE4 * usdcUnit)
      : (input.amountInAtomic * priceE4 * usdcUnit) / (equityUnit * 10_000n);

  const min = applySlippageDown(rawOut, input.slippageBps);
  return min > 0n ? min : 1n;
}
