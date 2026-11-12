# ADR-0005 — Production scope and two-step settlement for tokenized equities

- **Status:** accepted
- **Date:** 2026-11-12

## Context

`ADR-0004` scoped the initial build strictly to Base, Arbitrum One, and four DeFi-native
strategies. The product has moved to full production scope ("Capita") and adds **Tokenized
Equities & RWAs** so users can buy, hold, track, and sell fractional US stocks, ETFs, and
commodities alongside DeFi yield in one self-custodial portfolio.

Checking the live NEAR Intents 1Click `/v0/tokens` catalogue (`230` tokens on 2026-11-12) showed
zero tokenized stocks/ETFs in public 1Click routes (with `XAUT` on Ethereum as the sole RWA
commodity and memecoin ticker collisions such as `SPX`). Meanwhile, real custody-backed equities
exist natively on Arbitrum One (Dinari `dShares`, Backed `xStocks`), Ethereum (Ondo Stocks),
and Solana (`xStocks`, Ondo).

## Decision

1. **Full production scope:** Retire narrow hackathon-only limits while preserving deterministic
   engineering invariants. Maintain Base (8453) and Arbitrum One (42161) as active primary EVM
   chains and support modular expansion to Ethereum (1) and Solana for DeFi and RWA liquidity.
2. **Two-step non-atomic RWA execution:** Use **NEAR Intents 1Click** to consolidate/stage
   stablecoins (`USDC`) onto the destination execution chain, then settle the equity leg through
   a verified **destination DEX/RFQ or issuer swap adapter** (Arbitrum `Dinari`/`Backed` or
   Ethereum/Solana `Ondo`/`xStocks`), and reverse the path when selling back to `USDC`.
3. **Contract-first RWA identity & dual price verification:** Extend token identity with
   `assetClass`, `issuer`, `underlyingTicker`, and `wrapperType`, and require the policy engine
   to compare on-chain quote price against TradFi Reference NAV (`OPEN | EXTENDED | CLOSED`) and
   enforce `maxRwaExposurePercent` + `maxNavDeviationBps`.

## Consequences

- Multi-leg RWA purchases/exits are never presented as single-transaction atomic operations.
- Off-hours trades when US equity markets are closed are gated or blocked by deterministic
  NAV-deviation limits rather than allowed at arbitrary DEX premiums.
- Every tokenized equity position carries explicit issuer, custody, corporate-action, and
  jurisdictional eligibility metadata.
