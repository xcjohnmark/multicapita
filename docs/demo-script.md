# Demo script

A judge should be able to follow this in under ten minutes with no wallet, no API key and no
funds. Every step states what to look for and what it proves.

## Setup

```bash
npm install
npx prisma migrate dev     # creates prisma/dev.db, applies both committed migrations
npm run db:seed            # labelled sample portfolio
npm run dev                # http://localhost:3000
```

## Walkthrough

### 1. `/` — two data provenances side by side

- KPIs read **$11,682.15 total / $6,582.15 available** from the seeded fixture. A yellow
  **Demo mode** banner says so.
- The **NEAR Intents route** card is a *live* Base→Arbitrum USDC dry quote from 1Click: quoted
  output, protected minimum, implied cost in bps, settlement estimate and `correlationId`.

The point of the screen: fixture data and live data are visibly different, and never blended.

### 2. `/opportunities` — research, not execution

Four strategy groups with protocol, chain, asset, rate, liquidity and observation time. The banner
states these are fixture rows; no APY is a live market rate.

### 3. `/strategy` — the model proposes, the code decides

Leave the objective as-is and press **Propose allocation**.

Expected: a plan from the **deterministic planner** (no `NEARAI_API_KEY` is set) that passes the
guardrails read from the database — 30% liquid reserve, 40% per protocol, 95% per chain, 60% per
strategy. It typically allocates two legs, one on Base and one on Arbitrum, sized to exact cents.
The **Policy findings** list shows `SAMPLE_DATA_IN_PLAN` warnings and the
`USER_APPROVAL_REQUIRED` note; the **Execution trace** shows every step including the fallback
reason. The proposal is persisted and appears in `/activity`.

To see a rejection instead, tighten a guardrail in the database (for example set
`maxChainExposurePercent` to 10) and propose again: the plan is returned with machine-readable
violations and `ok: false`, and it is still audited.

### 4. `/execute` — real preview, gated execution

1. Pick **Base → Arbitrum**, amount `25`, and any address that holds USDC on Base (the seeded
   example uses the Aave V3 pool address `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`, which
   holds a small USDC balance).
2. Press **Preview move**.

Expected: a live 1Click dry quote (25 USDC → ≈24.99 USDC, cost in single-digit bps), the minimum
accepted output at 1% slippage, the destination chain's share after the move, and the live RPC
balances. Nothing is signed and no deposit address is created.

3. Press **Prepare move**.

Expected: **Execution disabled** — `APP_DATA_MODE` is `sample`, and the server refuses with
`409` and an audit event. With `APP_DATA_MODE=live` the same request requires an approval that
restates the exact amount, then returns a deposit instruction for the wallet to sign.

### 5. `/positions` and `/activity`

- Positions show receipt-token holdings with an explicit note that withdrawals are not wired.
- Activity shows the seed event, every proposal, and every execution refusal.

### 6. API checks

```bash
curl localhost:3000/api/health
curl "localhost:3000/api/wallet/balances?address=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
curl -X POST localhost:3000/api/execution/preview \
  -H 'content-type: application/json' \
  -d '{"fromChainId":8453,"toChainId":42161,"amount":"25","walletAddress":"0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"}'
```

## What is deliberately not claimed

- No live lending, LP or vault execution: those protocol adapters are not verified.
- No AI-generated proposal without `NEARAI_API_KEY`; the deterministic planner is used instead and
  labelled as such.
- No real deposit outside `APP_DATA_MODE=live`, and no testnet exists to exercise one
  automatically.
- No USD valuation for chain balances: no verified price source is attached.
