# ADR-0003 — Dry quotes are the default; execution is a separate, human-approved step

- **Status:** accepted
- **Date:** 2026-11-10

## Context

1Click has no testnet. Every committed quote is a mainnet quote backed by a real deposit address.
At the same time, quotes carry a signature, an expiry and a fee schedule, and a committed quote's
deposit address is only valid for roughly ten minutes. Development therefore cannot use "a real
quote" as a stand-in for "a live integration test".

## Decision

1. Every quote endpoint in this application requests `dry: true`. `/api/near/quote` is
   preview-only by construction: the `dry` flag is not part of its input schema and is never
   forwarded from the client.
2. A committed (`dry: false`) quote is created only inside the execution flow, only after the
   policy engine passes the plan, and only with a wallet-derived `recipient` and `refundTo`.
3. Costs are derived from the quote response (`amountIn` vs `amountOut`), never from the published
   fee table. Observed Base→Arbitrum USDC cost at 100 USDC was ≈2.5 bps, well below the documented
   25 bps unauthenticated surcharge; the discrepancy is recorded, not rationalised away.
4. Terminal states are persisted verbatim: `SUCCESS`, `REFUNDED`, `FAILED`, `INCOMPLETE_DEPOSIT`.
   Unknown states are surfaced as-is and are never treated as success.
5. Any real execution during development uses a tiny mainnet amount with explicit, recorded human
   approval.

## Consequences

- The full demonstration path works with zero credentials and zero funds.
- The distinction "preview quote ≠ executable quote" is enforced by the type system and by the
  shape of the API, not by a code comment.
- Demo data and previews must be visibly labelled; a preview quote can never be mistaken for a
  settlement.

## Implementation notes (2026-11-10)

The execution path (`src/lib/execution/move.ts`) keeps the policy pass ahead of the committed
quote, because a committed quote creates a real deposit address:

1. a **dry** quote is requested and the execution guardrails are evaluated against it;
2. only then is a **committed** quote requested, with `recipient` and `refundTo` derived from the
   connected wallet;
3. the guardrails are re-run against the committed quote's own numbers. If it is worse than the
   guardrail allows, the quote is abandoned unspent and the user is told.

Execution additionally requires `APP_DATA_MODE=live` and an approval that restates the exact
atomic amount. A policy pass, a proposal, or a displayed APY is never an approval. Refusals are
written to the audit log.
