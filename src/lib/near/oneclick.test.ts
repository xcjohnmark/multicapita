import { describe, expect, it, vi } from "vitest";
import { OneClickClient, OneClickError } from "./oneclick";

/**
 * Fixtures below are recorded from the LIVE 1Click API on 2026-11-10.
 * They are intentionally real payloads so schema drift breaks the tests.
 */

const TOKENS_FIXTURE = [
  {
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    decimals: 6,
    blockchain: "base",
    symbol: "USDC",
    price: 0.999585,
    priceUpdatedAt: "2026-11-10T08:02:00.782Z",
    contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    coingeckoId: "usd-coin",
  },
  {
    assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
    decimals: 6,
    blockchain: "arb",
    symbol: "USDC",
    price: 0.999585,
    priceUpdatedAt: "2026-11-10T08:02:00.782Z",
    contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    coingeckoId: "usd-coin",
  },
];

const QUOTE_FIXTURE = {
  quote: {
    amountIn: "100000000",
    amountInFormatted: "100.0",
    amountInUsd: "99.958500000000",
    minAmountIn: "100000000",
    amountOut: "99984339",
    amountOutFormatted: "99.984339",
    amountOutUsd: "99.9420",
    minAmountOut: "98984500",
    timeEstimate: 34,
    refundFee: "2400",
    withdrawFee: "5300",
  },
  quoteRequest: { dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100 },
  signature: "ed25519:XwgZykbzageNQUc6Kd3AHqZHqeStGqJ4fwujhwrmpLUGVg5TfXfKjumqESUVtDXvoXqnQWqmqv4SUAdz7getKpy",
  timestamp: "2026-11-10T08:02:50.220Z",
  correlationId: "10f30ff5-fada-40e9-b791-c1fa4cde621f",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch) {
  return new OneClickClient({ fetchImpl, cache: false, jwt: undefined });
}

const validRequest = {
  dry: true,
  swapType: "EXACT_INPUT" as const,
  slippageTolerance: 100,
  originAsset: TOKENS_FIXTURE[0].assetId,
  destinationAsset: TOKENS_FIXTURE[1].assetId,
  amount: "100000000",
  depositType: "ORIGIN_CHAIN" as const,
  recipient: "0x1111111111111111111111111111111111111111",
  recipientType: "DESTINATION_CHAIN" as const,
  refundTo: "0x1111111111111111111111111111111111111111",
  refundType: "ORIGIN_CHAIN" as const,
  deadline: "2026-11-10T23:59:00.000Z",
};

describe("OneClickClient.getTokens", () => {
  it("parses the live catalogue shape", async () => {
    const client = clientWith(vi.fn(async () => jsonResponse(TOKENS_FIXTURE)) as unknown as typeof fetch);
    const { tokens, fetchedAt } = await client.getTokens();

    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ symbol: "USDC", decimals: 6, blockchain: "base" });
    expect(tokens[0].assetId).toContain("nep141:base-");
    expect(fetchedAt).toBeGreaterThan(0);
  });

  it("rejects assets with missing decimals instead of guessing", async () => {
    const broken = [{ ...TOKENS_FIXTURE[0], decimals: undefined }];
    const client = clientWith(vi.fn(async () => jsonResponse(broken)) as unknown as typeof fetch);

    await expect(client.getTokens()).rejects.toThrow();
  });

  it("caches the catalogue until a forced refresh", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(TOKENS_FIXTURE));
    const client = new OneClickClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      cache: true,
    });

    await client.getTokens();
    await client.getTokens();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await client.getTokens({ forceRefresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("OneClickClient.createQuote", () => {
  it("sends atomic amount and returns the parsed quote with its signature", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(QUOTE_FIXTURE, 201));
    const client = clientWith(fetchMock as unknown as typeof fetch);

    const quote = await client.createQuote(validRequest);

    expect(quote.quote.amountOut).toBe("99984339");
    expect(quote.quote.minAmountOut).toBe("98984500");
    expect(quote.correlationId).toBe("10f30ff5-fada-40e9-b791-c1fa4cde621f");
    expect(quote.signature).toMatch(/^ed25519:/);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://1click.chaindefuser.com/v0/quote");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).amount).toBe("100000000");
  });

  it("does not attach credentials when no JWT is configured", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(QUOTE_FIXTURE, 201));
    const client = clientWith(fetchMock as unknown as typeof fetch);
    await client.createQuote(validRequest);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("rejects non-integer atomic amounts before hitting the network", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(QUOTE_FIXTURE, 201));
    const client = clientWith(fetchMock as unknown as typeof fetch);

    await expect(client.createQuote({ ...validRequest, amount: "1.5" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces 'No liquidity available' as a non-retryable error", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          message: "No liquidity available",
          correlationId: "e6422a95-1048-4b80-8fe8-cc254604f3ac",
          statusCode: 400,
          path: "/v0/quote",
        },
        400,
      ),
    );
    const client = clientWith(fetchMock as unknown as typeof fetch);

    const error = await client.createQuote(validRequest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OneClickError);
    expect((error as OneClickError).message).toBe("No liquidity available");
    expect((error as OneClickError).httpStatus).toBe(400);
    expect((error as OneClickError).retryable).toBe(false);
    expect((error as OneClickError).correlationId).toBe("e6422a95-1048-4b80-8fe8-cc254604f3ac");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a 503", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse(QUOTE_FIXTURE, 201));
    const client = clientWith(fetchMock as unknown as typeof fetch);

    const quote = await client.createQuote(validRequest);
    expect(quote.correlationId).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("OneClickClient.getStatus", () => {
  it("marks SUCCESS and REFUNDED as terminal", async () => {
    for (const status of ["SUCCESS", "REFUNDED", "FAILED", "INCOMPLETE_DEPOSIT"]) {
      const client = clientWith(
        vi.fn(async () => jsonResponse({ status, correlationId: "abc" })) as unknown as typeof fetch,
      );
      const result = await client.getStatus("0xdeposit");
      expect(result.status).toBe(status);
      expect(result.isTerminal).toBe(true);
    }
  });

  it("keeps in-flight states non-terminal", async () => {
    const client = clientWith(
      vi.fn(async () => jsonResponse({ status: "PROCESSING" })) as unknown as typeof fetch,
    );
    const result = await client.getStatus("0xdeposit");
    expect(result.isTerminal).toBe(false);
  });

  it("preserves unknown statuses instead of coercing them to success", async () => {
    const client = clientWith(
      vi.fn(async () => jsonResponse({ status: "SOME_NEW_STATE" })) as unknown as typeof fetch,
    );
    const result = await client.getStatus("0xdeposit");
    expect(result.status).toBe("SOME_NEW_STATE");
    expect(result.isTerminal).toBe(false);
  });

  it("turns a 404 into a typed error", async () => {
    const client = clientWith(
      vi.fn(async () =>
        jsonResponse(
          {
            message: "Deposit address 0x0 not found",
            error: "Not Found",
            statusCode: 404,
            path: "/v0/status",
          },
          404,
        ),
      ) as unknown as typeof fetch,
    );

    const error = await client.getStatus("0x0").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OneClickError);
    expect((error as OneClickError).httpStatus).toBe(404);
  });
});
