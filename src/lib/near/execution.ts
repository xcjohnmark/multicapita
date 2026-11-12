import { encodeFunctionData, erc20Abi, isAddress, type Address } from "viem";
import { getChain } from "@/lib/chains";
import { applySlippageDown } from "@/lib/finance/amounts";
import { getClient } from "./registry";
import {
  isCommittedQuote,
  OneClickError,
  type OneClickQuote,
  type OneClickToken,
} from "./oneclick";

/**
 * Executable cross-chain move via 1Click.
 *
 * This is the only module allowed to request a committed (non-dry) quote. Callers must have
 * already passed the policy gate and obtained explicit human approval; this module re-checks the
 * invariants that make a deposit safe:
 *
 *  - the quote really is committed (a dry quote has no deposit address and must never be funded);
 *  - the deposit amount equals the quoted input exactly;
 *  - the recipient and refund address are the connected wallet, not a value typed by a model;
 *  - the deposit instruction is built from the quoted amount, never from a display amount.
 *
 * A single 1Click swap settles one leg. Nothing here claims atomicity.
 */

export type DepositInstruction = {
  chainId: number;
  to: Address;
  data: `0x${string}`;
  value: bigint;
  amountAtomic: string;
  tokenAddress: Address | null;
  tokenSymbol: string;
  decimals: number;
  explorerUrl: string;
};

export type PreparedMove = {
  quote: OneClickQuote;
  origin: OneClickToken;
  destination: OneClickToken;
  instruction: DepositInstruction;
  /** The quoted deadline; the deposit must land before this. */
  deadline: string;
};

export type PrepareMoveInput = {
  fromChainId: number;
  toChainId: number;
  /** Exact atomic amount. Never derived from a display string here. */
  amountAtomic: bigint;
  walletAddress: Address;
  slippageBps: number;
  now?: Date;
  client?: ReturnType<typeof getClient>;
};

/** Committed quotes are valid for roughly ten minutes; leave a minute for the deposit to land. */
const QUOTE_TTL_MS = 9 * 60_000;

export async function prepareCrossChainMove(input: PrepareMoveInput): Promise<PreparedMove> {
  const origin = getChain(input.fromChainId);
  const destination = getChain(input.toChainId);

  if (!origin || !destination) {
    throw new OneClickError("Only Base (8453) and Arbitrum (42161) are supported.", { httpStatus: 400 });
  }
  if (origin.id === destination.id) {
    throw new OneClickError("Origin and destination must be different chains.", { httpStatus: 400 });
  }
  if (input.amountAtomic <= 0n) {
    throw new OneClickError("The amount must be greater than zero.", { httpStatus: 400 });
  }
  if (!isAddress(input.walletAddress, { strict: false })) {
    throw new OneClickError("The connected wallet address is not valid.", { httpStatus: 400 });
  }
  if (input.slippageBps < 0 || input.slippageBps > 10_000) {
    throw new OneClickError("Slippage tolerance is out of range.", { httpStatus: 400 });
  }

  const now = input.now ?? new Date();
  const client = input.client ?? getClient();
  const { tokens } = await client.getTokens();

  const findUsdc = (chain: typeof origin) =>
    tokens.find(
      (token) =>
        token.blockchain === chain.oneClickBlockchain &&
        token.symbol === "USDC" &&
        token.contractAddress?.toLowerCase() === chain.usdc.address.toLowerCase(),
    );

  const originToken = findUsdc(origin);
  const destinationToken = findUsdc(destination);
  if (!originToken || !destinationToken) {
    throw new OneClickError(
      "USDC is not listed for one of these chains in the 1Click catalogue.",
      { httpStatus: 409 },
    );
  }

  // `dry: false` is the only way to obtain a deposit address. It is deliberately not parameterised:
  // there is no legitimate reason for this module to request a preview.
  const quote = await client.createQuote({
    dry: false,
    swapType: "EXACT_INPUT",
    slippageTolerance: input.slippageBps,
    originAsset: originToken.assetId,
    destinationAsset: destinationToken.assetId,
    amount: input.amountAtomic.toString(),
    depositType: "ORIGIN_CHAIN",
    recipient: input.walletAddress,
    recipientType: "DESTINATION_CHAIN",
    refundTo: input.walletAddress,
    refundType: "ORIGIN_CHAIN",
    deadline: new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
  });

  const instruction = buildDepositInstruction(quote, originToken, origin.id, origin.explorerUrl);

  return {
    quote,
    origin: originToken,
    destination: destinationToken,
    instruction,
    deadline:
      quote.quote.deadline ??
      new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
  };
}

export function buildDepositInstruction(
  quote: OneClickQuote,
  originToken: OneClickToken,
  chainId: number,
  explorerUrl: string,
): DepositInstruction {
  const depositAddress = quote.quote.depositAddress;
  if (!isCommittedQuote(quote) || !depositAddress) {
    throw new OneClickError(
      "Refusing to build a deposit instruction for a quote that has no deposit address. Only a fresh committed quote can be funded.",
      { httpStatus: 409 },
    );
  }

  const amountAtomic = quote.quote.amountIn;
  if (!/^\d+$/.test(amountAtomic)) {
    throw new OneClickError("The quote returned a non-numeric deposit amount.", {
      httpStatus: 502,
    });
  }
  const amount = BigInt(amountAtomic);

  const tokenAddress = originToken.contractAddress
    ? (originToken.contractAddress.toLowerCase() as Address)
    : null;

  const data = tokenAddress
    ? encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [depositAddress as Address, amount],
      })
    : ("0x" as `0x${string}`);

  return {
    chainId,
    to: depositAddress as Address,
    data,
    // ERC-20 transfers carry no native value; a native deposit would set it to the quoted amount.
    value: tokenAddress ? 0n : amount,
    amountAtomic,
    tokenAddress,
    tokenSymbol: originToken.symbol,
    decimals: originToken.decimals,
    explorerUrl,
  };
}

/**
 * The minimum output the user is guaranteed, derived from the quote and the approved slippage.
 * Computed in the deterministic layer, not trusted from the provider response alone.
 */
export function minimumAcceptedOutput(input: {
  expectedOutputAtomic: string;
  slippageBps: number;
}): bigint {
  const expected = BigInt(input.expectedOutputAtomic);
  return applySlippageDown(expected, input.slippageBps);
}
