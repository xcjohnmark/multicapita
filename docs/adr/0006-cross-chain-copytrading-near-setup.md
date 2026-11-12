# ADR-0006 — Cross-chain non-memecoin copytrading funded and executed from NEAR

- **Status:** accepted
- **Date:** 2026-11-12

## Context

Users want to paste any cross-chain trader address/ID or pick top performers across chains and
mirror their activity from a single NEAR setup—covering **major verified spot crypto/RWAs in
1Click** plus **DeFi vaults, lending, and LP positions**, while **strictly excluding memecoins**.

## Considered Options

1. **Multi-chain retail memecoin sniper** — track new micro-cap DEX pairs across chains and rush
   unverified ERC-20/SPL swaps. Rejected: 1–12s indexing/bridge latency guarantees adverse fills
   ("exit liquidity"), violates contract verification rules, and excludes DeFi yield quality.
2. **Unified NEAR-setup Spot + DeFi Copytrading (chosen)** — restrict copytrading to verified
   non-memecoin assets (`1Click` ~184 non-meme tokens) and verified DeFi protocols (`1Click Earn`
   vaults, Aave V3, Uniswap V3), indexed via **Zerion / DeBank / Sim by Dune** and verified
   against on-chain RPCs.

## Decision

1. **Single NEAR funding & control plane:** Users fund once on NEAR (`NEAR Intents` / `Agent API`
   owner-signed grants) to mirror spot & vault trades across supported chains (`Base`, `Arbitrum`,
   `Ethereum`, `Solana`, etc.) without splitting native gas across networks. Use **NEAR Chain
   Signatures** when a mirrored DeFi action (Aave supply, Uniswap V3 LP) must invoke a destination
   protocol contract directly.
2. **Dual mode execution:** Support both *Copy-with-Approval* (1-click quote confirmation) and
   policy-bounded *Auto-Copy* (`Agent API` grants + `maxUsdPerCopyTrade`, `maxDailyCopyBudgetUsd`,
   `maxPriceDriftFromLeaderBps`, `noMemecoinsOnly`, and instant freeze).
3. **Spot/DeFi clarity vs Perps:** Do not treat spot mirror swaps as leveraged perp execution;
   surface an explicit *"Spot/on-chain visibility only — off-chain or perp hedges unknown"* warning
   on all followed wallets.

## Consequences

- Memecoins and unverified DEX tokens are deterministically blocked before quote preparation.
- High-volatility rapid scalping is aborted cleanly by `maxPriceDriftFromLeaderBps` rather than
  chasing the leader's candle.
- Perp copytrading (Hyperliquid/GMX) remains cleanly separated as its own future adapter rather
  than muddied with 1Click spot flows.
