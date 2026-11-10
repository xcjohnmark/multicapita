/**
 * NEAR Intents / 1Click Swap API client (server-side only).
 *
 * Verified against the live API on 2026-11-10:
 *  - GET  /v0/tokens            -> 200, array of assets, no auth required
 *  - POST /v0/quote (dry:true)  -> 201, { quote, quoteRequest, signature, timestamp, correlationId }
 *  - GET  /v0/status?depositAddress=... -> 200 payload / 404 { message, error, statusCode, path }
 *
 * Rules enforced here:
 *  - Asset identity is the API's `assetId`, never a symbol.
 *  - A `dry` quote is simulation only and never carries a deposit address. Execution
 *    must request a fresh non-dry quote immediately before the user signs.
 *  - Fees are read from the quote response, never from a hardcoded schedule.
 */

import { z } from "zod";

export const DEFAULT_BASE_URL = "https://1click.chaindefuser.com";
const DEFAULT_TIMEOUT_MS = 20_000;
const TOKEN_CACHE_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const oneClickTokenSchema = z.object({
  assetId: z.string().min(1),
  decimals: z.number().int().min(0).max(36),
  blockchain: z.string().min(1),
  symbol: z.string().min(1),
  price: z.number().nullable().optional(),
  priceUpdatedAt: z.string().nullable().optional(),
  contractAddress: z.string().nullable().optional(),
  coingeckoId: z.string().nullable().optional(),
});

export type OneClickToken = z.infer<typeof oneClickTokenSchema>;

export const oneClickQuoteCoreSchema = z.object({
  // Deposit info: present only when the quote was committed (`dry: false`).
  // Parsed explicitly so a committed quote is distinguishable from a preview and cannot be
  // mistaken for one by code that only checks "is there a quote object".
  depositAddress: z.string().nullable().optional(),
  depositMemo: z.string().nullable().optional(),
  deadline: z.string().optional(),
  timeWhenInactive: z.string().optional(),
  amountIn: z.string(),
  amountInFormatted: z.string().optional(),
  amountInUsd: z.string().optional(),
  minAmountIn: z.string().optional(),
  amountOut: z.string(),
  amountOutFormatted: z.string().optional(),
  amountOutUsd: z.string().optional(),
  minAmountOut: z.string().optional(),
  timeEstimate: z.number().optional(),
  refundFee: z.string().optional(),
  withdrawFee: z.string().optional(),
});

export const oneClickQuoteSchema = z.object({
  quote: oneClickQuoteCoreSchema,
  quoteRequest: z.record(z.string(), z.unknown()).optional(),
  signature: z.string().optional(),
  timestamp: z.string().optional(),
  correlationId: z.string(),
});

export type OneClickQuote = z.infer<typeof oneClickQuoteSchema>;

/** A committed quote is the only kind that can be funded. */
export function isCommittedQuote(quote: OneClickQuote): boolean {
  return typeof quote.quote.depositAddress === "string" && quote.quote.depositAddress.length > 0;
}

/** Documented terminal and non-terminal states. Unknown values are preserved, not coerced. */
export const ONECLICK_STATUSES = [
  "PENDING_DEPOSIT",
  "KNOWN_DEPOSIT_TX",
  "PROCESSING",
  "SUCCESS",
  "INCOMPLETE_DEPOSIT",
  "REFUNDED",
  "FAILED",
] as const;

export type OneClickStatus = (typeof ONECLICK_STATUSES)[number];

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "SUCCESS",
  "INCOMPLETE_DEPOSIT",
  "REFUNDED",
  "FAILED",
]);

export type QuoteStatusResult = {
  depositAddress: string;
  status: OneClickStatus | string;
  isTerminal: boolean;
  correlationId?: string;
  updatedAt?: string;
  raw: unknown;
};

// ---------------------------------------------------------------------------
// Input contracts
// ---------------------------------------------------------------------------

export const quoteRequestSchema = z.object({
  dry: z.boolean(),
  swapType: z.enum(["EXACT_INPUT", "EXACT_OUTPUT", "FLEX_INPUT", "ANY_INPUT"]),
  slippageTolerance: z.number().int().min(0).max(10_000),
  originAsset: z.string().min(1),
  destinationAsset: z.string().min(1),
  /** Atomic units as a string. Never a display amount. */
  amount: z.string().regex(/^\d+$/, "amount must be an unsigned atomic integer string"),
  depositType: z.enum(["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"]),
  recipient: z.string().min(1),
  recipientType: z.enum(["DESTINATION_CHAIN", "INTENTS"]),
  refundTo: z.string().min(1),
  refundType: z.enum(["ORIGIN_CHAIN", "INTENTS"]),
  deadline: z.string().datetime(),
  appFees: z
    .array(z.object({ recipient: z.string().min(1), fee: z.number().int().min(0).max(10_000) }))
    .max(5)
    .optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class OneClickError extends Error {
  readonly httpStatus: number;
  readonly correlationId?: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { httpStatus: number; correlationId?: string; retryable?: boolean },
  ) {
    super(message);
    this.name = "OneClickError";
    this.httpStatus = options.httpStatus;
    this.correlationId = options.correlationId;
    this.retryable = options.retryable ?? false;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type OneClickClientOptions = {
  baseUrl?: string;
  jwt?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Test hook: disables the in-process cache when false. */
  cache?: boolean;
};

type TokenCacheEntry = { tokens: OneClickToken[]; fetchedAt: number };

export class OneClickClient {
  private readonly baseUrl: string;
  private readonly jwt?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly useCache: boolean;
  private tokenCache: TokenCacheEntry | null = null;

  constructor(options: OneClickClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.ONECLICK_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.jwt = options.jwt ?? process.env.ONECLICK_JWT ?? undefined;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.useCache = options.cache ?? true;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.jwt) headers.authorization = `Bearer ${this.jwt}`;
    return headers;
  }

  private async request(path: string, init?: RequestInit, attempt = 0): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init?.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      if (attempt === 0) return this.request(path, init, 1);
      throw new OneClickError(
        `1Click request failed: ${cause instanceof Error ? cause.message : "network error"}`,
        { httpStatus: 0, retryable: true },
      );
    }

    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const parsed = body as { message?: string; correlationId?: string } | undefined;
      const retryable = response.status >= 500 && response.status <= 504;
      if (retryable && attempt === 0) return this.request(path, init, 1);
      throw new OneClickError(parsed?.message ?? `1Click returned HTTP ${response.status}`, {
        httpStatus: response.status,
        correlationId: parsed?.correlationId,
        retryable,
      });
    }

    return body;
  }

  /**
   * Live supported-asset catalogue. This is the only authoritative source for
   * `assetId` + `decimals`; never hardcode either.
   */
  async getTokens(options: { forceRefresh?: boolean } = {}): Promise<TokenCacheEntry> {
    if (
      this.useCache &&
      !options.forceRefresh &&
      this.tokenCache &&
      Date.now() - this.tokenCache.fetchedAt < TOKEN_CACHE_MS
    ) {
      return this.tokenCache;
    }

    const body = await this.request("/v0/tokens");
    const tokens = z.array(oneClickTokenSchema).parse(body);
    const entry = { tokens, fetchedAt: Date.now() };
    if (this.useCache) this.tokenCache = entry;
    return entry;
  }

  /**
   * Request a quote. Use `dry: true` for discovery/preview. A non-dry quote creates a
   * real deposit address and must only be requested when the user is about to sign.
   */
  async createQuote(input: QuoteRequest): Promise<OneClickQuote> {
    const payload = quoteRequestSchema.parse(input);
    const body = await this.request("/v0/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return oneClickQuoteSchema.parse(body);
  }

  /** Poll settlement state for a deposit address. */
  async getStatus(depositAddress: string): Promise<QuoteStatusResult> {
    if (!depositAddress) throw new OneClickError("depositAddress is required", { httpStatus: 400 });

    const body = await this.request(
      `/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
    );
    const record = body as Record<string, unknown>;
    const status = typeof record?.status === "string" ? record.status : "UNKNOWN";

    return {
      depositAddress,
      status,
      isTerminal: TERMINAL_STATUSES.has(status),
      correlationId: typeof record?.correlationId === "string" ? record.correlationId : undefined,
      updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : undefined,
      raw: body,
    };
  }

  /** Optional: tell 1Click the source transaction hash so it can process faster. */
  async submitDeposit(depositAddress: string, txHash: string): Promise<void> {
    await this.request("/v0/deposit/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ depositAddress, txHash }),
    });
  }
}

let sharedClient: OneClickClient | null = null;

export function getOneClickClient(): OneClickClient {
  sharedClient ??= new OneClickClient();
  return sharedClient;
}
