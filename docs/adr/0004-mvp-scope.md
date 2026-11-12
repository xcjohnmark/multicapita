# ADR-0004 — Initial Base + Arbitrum narrow launch scope

- **Status:** superseded by ADR-0005
- **Date:** 2026-11-10

## Context

The live 1Click catalogue (216 assets, 39 chains as of 2026-11-10) supports far more than we can
build well in four days. USDT does not appear at all for Base or Arbitrum, which invalidates the
obvious "USDC/USDT stable pool" framing on those chains.

## Decision

- **Chains:** Base (8453) and Arbitrum One (42161). Both are cheap EVM chains present in the
  catalogue, both have USDC, and the pair gives a credible cross-chain story.
- **Stablecoins:** USDC-centric. Where a pair would need USDT on Base/Arbitrum, the product shows
  the constraint instead of inventing a pool.
- **Track:** `defi` only. `security` and `privacy` are not claimed.

## Rationale

Track claims are credibility claims. A `security` submission needs a demonstrable server-side
block with an audit trail; a `privacy` submission needs verifiable TEE attestation, not a claim
that inference runs in a TEE. Neither can be finished honestly in the remaining time alongside a
working DeFi flow. The `defi` track is supported by real 1Click Earn/swap quotes, a real execution
lifecycle and a real portfolio.

## Consequences

- Adding a third chain is a config change in `src/lib/chains.ts` plus a verified USDC address —
  but it is not part of the MVP acceptance criteria.
- LP scope is constrained by the catalogue, and the UI must explain that rather than show a
  disabled-looking "USDT" option.
- If the policy engine later demonstrably blocks execution with a persisted audit record, a
  `security` claim could be added deliberately, with evidence — not by default.
