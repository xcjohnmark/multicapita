import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VERIFIED_TOKENIZED_ASSETS,
  type LiveEquityQuoteResult,
  type TokenizedEquityAsset,
} from "@/lib/protocols/equities";
import { ingestEquityOpportunities as ingestEquities } from "./equities";

const fetchQuote = vi.hoisted(() =>
  vi.fn<(asset: TokenizedEquityAsset) => Promise<LiveEquityQuoteResult>>(),
);

vi.mock("@/lib/protocols/equities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocols/equities")>();
  return { ...actual, fetchLiveEquityDualQuote: fetchQuote };
});

const OBSERVED_AT = "2026-11-11T16:00:00.000Z";
// Wednesday 11 Nov 2026, 11:00 New York time — regular US session.
const MARKET_OPEN = new Date("2026-11-11T16:00:00.000Z");
// Saturday 14 Nov 2026 — closed for equities and commodities alike.
const WEEKEND = new Date("2026-11-14T16:00:00.000Z");

function quote(
  asset: TokenizedEquityAsset,
  prices: { nav: number | null; dex: number | null; liquidity?: number | null },
): LiveEquityQuoteResult {
  return {
    asset,
    referenceNavUsd: prices.nav,
    referenceSource: prices.nav !== null ? "yahoo_finance_v8" : "unavailable",
    dexPriceUsd: prices.dex,
    dexLiquidityUsd: prices.liquidity ?? null,
    dexSource: prices.dex !== null ? "dexscreener_v1" : "no_live_dex_pool",
    observedAt: OBSERVED_AT,
  };
}

async function ingestWith(
  pricesFor: (asset: TokenizedEquityAsset) => Parameters<typeof quote>[1],
) {
  fetchQuote.mockImplementation(async (asset) => quote(asset, pricesFor(asset)));
  return ingestEquities();
}

const bySymbol = (rows: Awaited<ReturnType<typeof ingestEquities>>, symbol: string) => {
  const row = rows.find((r) => r.tokenOrPairRef.startsWith(`${symbol} (`));
  if (!row) throw new Error(`no opportunity for ${symbol}`);
  return row;
};

describe("ingestEquityOpportunities", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: MARKET_OPEN });
    fetchQuote.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits one tokenized_equity opportunity per verified asset, keyed by (chainId, address)", async () => {
    const rows = await ingestWith(() => ({ nav: 100, dex: 100, liquidity: 250_000 }));

    expect(rows).toHaveLength(VERIFIED_TOKENIZED_ASSETS.length);
    expect(fetchQuote).toHaveBeenCalledTimes(VERIFIED_TOKENIZED_ASSETS.length);
    for (const asset of VERIFIED_TOKENIZED_ASSETS) {
      const row = rows.find(
        (r) => r.chainId === asset.chainId && r.marketOrPoolAddress === asset.contractAddress,
      );
      expect(row, asset.symbol).toBeDefined();
      expect(row?.strategyType).toBe("tokenized_equity");
    }
  });

  it("labels priced assets live with source and the quote's observation timestamp", async () => {
    const rows = await ingestWith(() => ({ nav: 180, dex: 180.9, liquidity: 1_200_000 }));
    const nvda = bySymbol(rows, "NVDAon");

    expect(nvda.dataMode).toBe("live");
    expect(nvda.status).toBe("active");
    expect(nvda.observedAt).toEqual(new Date(OBSERVED_AT));
    expect(nvda.sourcePayload).toMatchObject({
      provider: "yahoo_finance_v8+dexscreener_v1",
      referenceNavUsd: 180,
      dexPriceUsd: 180.9,
      navDeviationBps: 50,
      sessionStatus: "OPEN",
    });
    expect(nvda.liquidityUsd).toBe(1_200_000);
    expect(nvda.riskFlags).toEqual(["issuer_counterparty_risk"]);
  });

  it("never upgrades an asset with no reference NAV and no DEX price to live", async () => {
    const rows = await ingestWith(() => ({ nav: null, dex: null }));

    for (const row of rows) {
      expect(row.dataMode).toBe("sample");
      expect(row.status).toBe("unsupported");
      expect(row.liquidityUsd).toBeUndefined();
      expect(row.tvlUsd).toBeUndefined();
      expect(row.sourcePayload).toMatchObject({ provider: "unavailable+no_live_dex_pool" });
    }
  });

  it("flags a DEX price outside the 150 bps NAV band with the measured spread", async () => {
    const rows = await ingestWith(() => ({ nav: 100, dex: 102 }));
    expect(bySymbol(rows, "AAPLon").riskFlags).toContain("nav_spread_200_bps");

    const atBound = await ingestWith(() => ({ nav: 100, dex: 101.5 }));
    expect(
      bySymbol(atBound, "AAPLon").riskFlags.some((f) => f.startsWith("nav_spread_")),
    ).toBe(false);
  });

  it("routes unpriced assets via 1Click only when a 1Click asset id exists", async () => {
    const rows = await ingestWith(() => ({ nav: 100, dex: null }));

    expect(bySymbol(rows, "XAUT").riskFlags).toContain("route_via_1click");
    expect(bySymbol(rows, "NVDA.d").riskFlags).toContain("issuer_orderbook_only");
    expect(bySymbol(rows, "NVDA.d").riskFlags).not.toContain("route_via_1click");
    // A missing DEX price is not reported as a NAV spread breach.
    expect(bySymbol(rows, "NVDA.d").riskFlags.some((f) => f.startsWith("nav_spread_"))).toBe(
      false,
    );
  });

  it("flags us_market_closed for equities but not for the physical commodity", async () => {
    vi.setSystemTime(WEEKEND);
    const rows = await ingestWith(() => ({ nav: 100, dex: 100 }));

    expect(bySymbol(rows, "TSLAon").riskFlags).toContain("us_market_closed");
    expect(bySymbol(rows, "XAUT").riskFlags).not.toContain("us_market_closed");
  });
});
