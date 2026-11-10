<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Cross-Chain Portfolio Operator

Cross-chain DeFi portfolio operator for the NEAR hackathon (`defi` track).
`project-docs/prd.md` is the product source of truth. `project-docs/blueprint.md` governs
submission style only — it describes a different product and must not drive scope.

## Non-negotiable product rules

These are correctness constraints, not style preferences. Breaking one is a defect.

1. **AI proposes; deterministic code decides.** The LLM may select, rank and explain
   opportunities. It must never perform arithmetic that affects money, and never grant itself an
   approval. Every number that reaches a signature is computed in `src/lib/finance/` or
   `src/lib/policy/` and covered by tests.
2. **Quotes are not opportunities.** A displayed APY or route is research. Only a fresh,
   non-`dry` 1Click quote (or a simulated protocol call) is executable, and only after the
   policy engine passes it.
3. **No fabricated live data.** Every externally sourced figure carries `source` and an
   observation timestamp. Sample/fixture data is labelled `dataMode: "sample"` in the database
   and rendered with a visible "Demo mode" banner. Never silently upgrade sample data to live.
4. **Token identity is `(chainId, contractAddress)`, never a ticker.** USDC on Base is a
   different asset from USDC on Arbitrum; `assetId` comes from the live `/v0/tokens` catalogue.
5. **Amounts are exact.** Balances and trade sizes are atomic `bigint`/string plus `decimals`.
   Floats are allowed only for USD valuation and display, never to construct a transaction.
6. **No claimed atomicity.** A 1Click swap settles one leg. Multi-leg strategies are a sequence
   of independently confirmed steps, and the UI must say so.
7. **No secrets in the client.** API keys and the 1Click JWT are read only in server code
   (`src/lib/env.ts` is server-only). Nothing logs a secret, a seed phrase or a private key.

## Architecture

```
src/app/                 Next.js App Router — pages + route handlers (one deployable app)
src/app/api/             server-only HTTP surface
src/components/          UI (shell, primitives)
src/lib/env.ts           zod-validated server config
src/lib/chains.ts        Base (8453) + Arbitrum One (42161) scope
src/lib/near/            1Click client, quote lifecycle, route preview
src/lib/finance/         exact amounts, APY/cost maths — pure, unit-tested
src/lib/policy/          deterministic guardrail engine — pure, unit-tested
src/lib/ai/              NEAR AI Cloud orchestrator + typed tools
src/lib/portfolio/       aggregation and valuation queries
src/lib/db/client.ts     Prisma 7 + better-sqlite3 adapter
prisma/schema.prisma     data model; migrations are committed
```

## Commands

```bash
npm install
npx prisma migrate dev      # creates/updates prisma/dev.db
npm run db:seed             # optional clearly-labelled sample portfolio
npm run dev                 # http://localhost:3000
npm test                    # vitest
npm run typecheck           # tsc --noEmit
npm run build               # must pass before any commit
```

On Windows, `npm.ps1` is blocked by the default execution policy. Run `npm.cmd` / `npx.cmd`,
or prefix with `cmd /c`.

## Data modes

`APP_DATA_MODE` is `sample` | `dry_run` | `live`. With no credentials the app must boot and the
full flow must be demonstrable in `sample`/`dry_run`. Live execution requires a wallet signature
and explicit human approval; there is no 1Click testnet, so any real swap is tiny and manual.

## Verification before claiming work is done

- `npm test` green, `npm run build` green.
- Live integrations verified against the real endpoint, not assumed from docs. 1Click's
  documented 25 bps unauthenticated surcharge does **not** match observed stablecoin-route costs
  (~2.5 bps on Base→Arbitrum at 100 USDC); always derive cost from the quote.
- Any UI state you added is reachable and renders with no credentials.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`) recorded as a `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root plus `docs/adr/`. See `docs/agents/domain.md`.
Installed skills are catalogued in `docs/agent-skills.md`.
