# Capita — Live Mainnet Build & Implementation Guide

**Document:** Platform Engineering Master Build Guide  
**Product Name:** Capita  
**Tagline:** *All your crypto. One place.*  
**Target Environment:** Production Mainnet (Multi-Chain: Base, Arbitrum One, Ethereum, Solana, NEAR)  
**Status:** Canonical Implementation Roadmap  

---

## 1. Executive Vision

Capita is a **production-grade, live mainnet cross-chain DeFi & RWA portfolio platform**.

The platform is built on a fundamental architectural principle: **The AI is the Brain; Deterministic Code is the Hands and the Shield.**

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                   USER INTENT                                    │
│   "Keep 30% liquid USDC, deploy 50% for risk-adjusted stable yield, and invest   │
│    20% into verified tokenized Nvidia and Apple shares with strict spread limits" │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   STAGE 1: THE BRAIN (NEAR AI Cloud Orchestrator)                │
│  - Reads user portfolio & live opportunities via typed read-only tools           │
│  - Ranks candidate markets (Vaults, Lending, LP, Arbitrage, Tokenized Equities)  │
│  - Proposes allocation weights (basis points) + risk rationales                  │
│  - NEVER performs monetary math; NEVER grants execution approvals                │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                  STAGE 2: THE SHIELD (Deterministic Policy Engine)               │
│  - Converts basis points to exact atomic units (bigint)                          │
│  - Evaluates user guardrails (liquidity floor, protocol/chain/asset/RWA caps)    │
│  - Verifies slippage bounds and TradFi Reference NAV vs DEX quote spread (bps)   │
│  - Emits machine-readable pass/fail verdicts and audit log records               │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   STAGE 3: THE HANDS (NEAR Intents & Protocol Adapters)          │
│  - Obtains fresh committed quotes from NEAR Intents 1Click API                   │
│  - Requests explicit human signature from self-custodial wallet (EIP-712/ERC-20) │
│  - Routes cross-chain swaps, Earn deposits (`gtUSDCp`), and XAUT settlement      │
│  - Executes destination protocol calls (Aave V3, Uniswap LP, Dinari/Ondo/xStocks)│
│  - Tracks deposit lifecycle: PENDING_DEPOSIT ➔ PROCESSING ➔ SUCCESS / REFUNDED   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Brand Identity & Design System Specification

In sync with [`design-system.md`](file:///C:/Users/ADMIN/.gemini/antigravity/brain/4bda675a-ec06-4134-aa73-cb431d654ef8/design-system.md), the entire platform uses a unified, light-mode-first aesthetic inspired by `near.com`.

### 2.1 Brand Tokens

- **Brand Name:** `Capita`
- **Typography:** **Inter** font family (`font-sans`) for all display, headings, body text, and UI controls. Tabular figures (`font-mono`, `tabular-nums`) for currency, rates, hashes, and balances.
- **Theme:** Strict **Light Mode** only.

### 2.2 Color Palette

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#FFFFFF` | Main page background |
| `surface` | `#F8F9FA` | Standard card backgrounds, table row alternation |
| `surface-raised` | `#F1F3F5` | Popovers, modals, dropdowns, nested callouts |
| `surface-invert` | `#000000` | Inverted surfaces (footer, primary badges) |
| `line` | `#E5E5E5` | Default 1px borders, table dividers |
| `line-strong` | `#D5D5D5` | Hover borders, active tab outlines |
| `ink` | `#000000` | Primary text and major headers |
| `ink-secondary` | `#525252` | Subheaders, section descriptions |
| `ink-muted` | `#858585` | Timestamps, metadata labels, helper text |
| `accent` | `#00EC97` | Signature NEAR Green — primary CTA buttons, positive P&L |
| `accent-hover` | `#00D888` | Button hover state |
| `accent-ink` | `#000000` | Text on top of accent backgrounds |
| `blue` | `#0091FD` | Informational chips, external explorer links |
| `warn` | `#F5B544` | Policy warnings, pending settlements |
| `danger` | `#F2555A` | Policy rejections, negative P&L, transaction failures |

---

## 3. Skills Ecosystem Integration Matrix

Discovered and validated via the `find-skills` package manager (`npx skills find`) to equip engineering agents and contributors with specialized knowledge and battle-tested patterns:

| Domain | Recommended Skill Package | Installs / Source | Role in Capita |
|---|---|---|---|
| **Frontend Architecture** | `vercel-labs/agent-skills@vercel-react-best-practices` | 891K+ (Vercel) | Next.js 16 App Router caching, streaming SSR, performance |
| **Component Composition** | `vercel-labs/agent-skills@vercel-composition-patterns` | 450K+ (Vercel) | Compound components, accessible dialogs, clean seams |
| **Next.js Router** | `wshobson/agents@nextjs-app-router-patterns` | 33.8K | Route handlers, middleware auth, cookie session handling |
| **Cross-Chain Intents** | `near/agent-skills@near-intents` | Official (NEAR) | 1Click Swap & Earn quote/status lifecycle, fee parsing |
| **AI Cloud & TEE** | `near/agent-skills@near-ai-cloud` | Official (NEAR) | Confidential OpenAI-compatible inference, tool calling |
| **Web3 & Contracts** | `uniswap/uniswap-ai@viem-integration` | 1.7K | Pure typed `viem` contract interactions, ERC-20 approvals |
| **Smart Contract Safety** | `wshobson/agents@solidity-security` | 15.9K | Re-entrancy, allowance drain, and transaction replay checks |
| **Web3 Testing** | `wshobson/agents@web3-testing` | 11.2K | Mainnet RPC forks, transaction simulation, balance assertions |
| **Engineering Seams** | `mattpocock/skills@codebase-design` | Installed | Deep module interfaces, keeping financial/policy logic pure |
| **Spec Execution** | `mattpocock/skills@implement-spec` | Installed | Ticket-by-ticket test-driven implementation loop |
| **UI Toast & Feedback** | `emilkowalski/skills@ask-sonner` | 178K+ | Lightweight feedback notifications for wallet actions |

---

## 4. Phased Engineering Build Plan

Each stage is defined with clear prerequisites, concrete implementation steps, files to touch, and verifiable completion criteria.

---

### Stage S0: Foundation, Capita Light Theme & Production Auth

**Goal:** Establish the Capita brand identity, enforce Inter typography, light-mode styling, and implement EIP-4361 Sign-In with Ethereum (SIWE) so users authenticate securely without third-party custodians.

#### 1. Visual & Theme Migration
- Configure Inter as the primary font family in `src/app/layout.tsx` via `next/font/google`.
- Update `src/app/globals.css` with the strict light-mode palette tokens (`canvas`, `surface`, `ink`, `accent: #00EC97`, `line: #E5E5E5`).
- Update `src/components/shell/app-shell.tsx` to render the **Capita** wordmark, replace legacy dark UI classes with clean white/grey surfaces, and remove all references to demo/hackathon copy.

#### 2. Self-Custodial Auth & Session State
- Finalize `src/lib/auth/siwe.ts`:
  - `generateNonce()`: Crypto-random nonce stored with 5-minute TTL.
  - `verifySiweMessage(message, signature)`: Validates domain, address, nonce, expiration using `viem/siwe`.
- Mount route handlers:
  - `GET /api/auth/nonce`: Issues a single-use nonce cookie.
  - `POST /api/auth/verify`: Verifies the signed EIP-4361 message and issues an `HttpOnly`, `SameSite=Lax`, `Secure` JWT session cookie.
  - `GET /api/auth/session`: Returns the active authenticated user address and chain session.
  - `POST /api/auth/logout`: Clears the session cookie.
- Replace old placeholder wallet connect with `src/components/shell/session-menu.tsx`.

#### Verification S0
- `npm run typecheck` passes with zero errors.
- `npm test` passes.
- Opening `http://localhost:3000` renders the Capita brand in clean Inter font, light mode canvas, and enables SIWE signing with MetaMask / Rabby / browser wallets.

---

### Stage S1: Multi-Chain Live Portfolio Aggregation (Base + Arbitrum)

**Goal:** Replace sample portfolio fixtures with verified, real-time balance and position reads directly from live on-chain RPC nodes and indexers.

#### 1. Multi-Chain RPC Engine
- Enhance `src/lib/wallet/balances.ts` to support concurrent batch multicall reads:
  - Native ETH balance via `getBalance`.
  - USDC balance via ERC-20 `balanceOf` on Base (`0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`).
  - USDC balance on Arbitrum One (`0xaf88d065e77c8cc2239327c5edb3a432268e5831`).
  - Other verified 1Click tokens (WETH, cbBTC, EURC).
- Fallback RPC rotation across Alchemy, Infura, and public nodes with graceful error containment.

#### 2. Live Portfolio Valuation & Snapshots
- Integrate authoritative spot pricing in `src/lib/portfolio/valuation.ts`:
  - Stablecoins valued at exact parity unless a depeg (>0.5% deviation) is detected on-chain.
  - Sourced CoinGecko / DeFiLlama feeds with observation timestamps and data quality flags.
- Store real snapshots in `PortfolioSnapshot` and `TokenBalance` tables keyed by the authenticated user's `Wallet` ID.
- Eliminate `dataMode: "sample"` for connected wallets; display explicit "Live" status chips with exact observation timestamps.

#### Verification S1
- Connecting a wallet holding 50 USDC on Base immediately shows $50.00 in Available Capital on `/` and `/execute`.
- Disconnecting falls back to an unauthenticated view prompting connection.
- No fixture data is blended into live wallet calculations.

---

### Stage S2: Live Opportunity Ingestion Engine (5 Core Strategies)

**Goal:** Turn `/opportunities` into a live market scanner sourcing real rates and liquidity across Yield Vaults, Lending, Stablecoin LP, Arbitrage, and Tokenized Equities & RWAs.

#### 1. Strategy A: 1Click Earn Live Vault Ingestion
- Ingest live yield vault receipt assets from 1Click `/v0/tokens` (e.g., `gtUSDCp` Gauntlet Morpho Vault, `sparkUSDC`, `mwUSDC` Moonwell).
- Fetch live vault APYs and historical yield performance via Yield.xyz / protocol endpoints.
- Calculate exact share-to-underlying exchange rates using live preview quotes.

#### 2. Strategy B: Aave V3 Lending Market Ingestion
- Read on-chain reserve data from Aave V3 `UiPoolDataProviderV3` on Base (`0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`) and Arbitrum:
  - Current variable borrow rate and liquidity rate (converted from ray to APY).
  - Total supplied liquidity and available cash.
  - Utilization rate: $U = \text{TotalDebt} / (\text{TotalDebt} + \text{AvailableCash})$.

#### 3. Strategy C: Stablecoin Liquidity Pools (Uniswap V3 / Aerodrome)
- Query verified pool contracts (USDC/USDT, USDC/EURC) on Base and Arbitrum:
  - 24h trading volume, TVL, and fee tier (e.g. 1 bps or 5 bps).
  - Estimated fee APY: $(\text{Volume}_{24h} \times \text{FeeRate} \times 365) / \text{TVL}$.
  - Tag risk flags: `concentrated_range`, `stablecoin_depeg`.

#### 4. Strategy D: Cross-Chain Arbitrage Scanner
- Scan identical canonical assets (e.g., WETH, EURC, verified stablecoins) across DEX liquidity pools on Base (Aerodrome, Uniswap) vs Arbitrum (Uniswap, Camelot).
- Calculate trade-size specific net profit using the deterministic formula:
  $$\text{NetProfit} = \text{SellOutput} - \text{BuyInput} - \text{DEXFees} - \text{GasCost} - \text{1ClickBridgeFee}$$
- If net profit is below user minimum (default $5), mark as non-executable.

#### 5. Strategy E: Tokenized Equities & RWAs Ingestion
- Index verified custody-backed equities, ETFs, and commodities strictly by `(chainId, contractAddress)` (never ticker alone, preventing memecoin collisions such as `SPX`):
  - Arbitrum One: Dinari `dShares` (`NVDA.d`, `AAPL.d`), Backed `xStocks` (`AAPLx`).
  - Ethereum / Solana expansion: Ondo Stocks (`NVDAon`, `AAPLon`, `TSLAon`), Backed `xStocks` (`NVDAx`), plus `XAUT` (Tether Gold, live in 1Click `/v0/tokens`).
- Pair every listing with **dual price provenance**: live on-chain DEX/RFQ execution quote vs TradFi Reference NAV and exchange session status (`OPEN | EXTENDED | CLOSED`), computing `navDeviationBps` (`off-hours spread`).
- Persist issuer, wrapper type (`total_return_reinvesting | price_tracker`), DEX pool liquidity, and jurisdiction/allowlist flags.

#### Verification S2
- Running the opportunity sync job updates database rows with `dataMode: "live"` and current timestamps.
- `/opportunities` shows live rates and tokenized equity listings with zero hardcoded sample rows.

---

### Stage S3: NEAR AI Cloud Strategy Orchestrator & Deterministic Guardrails

**Goal:** Empower users to input plain-English goals and receive mathematically sound, policy-verified strategy proposals across DeFi and tokenized equities.

#### 1. AI Orchestrator with Strict Tool Calling
- Configure `src/lib/ai/orchestrator.ts` using NEAR AI Cloud (`cloud-api.near.ai/v1`) with `z-ai/glm-5.3-flash`.
- Supply read-only typed tools (`get_portfolio`, `get_opportunities`, `estimate_route_cost`).
- Enforce prompt boundaries:
  - Model outputs weights in basis points ($\sum = 10,000$), rationale, risk notes, and user decision points.
  - Model is prohibited from generating monetary amounts or granting transaction approvals.

#### 2. Deterministic Policy Engine Enforcement
- Pure math in `src/lib/policy/engine.ts`:
  - `minLiquidPercent`: Guarantees reserve capital stays in liquid wallet balances.
  - `maxProtocolExposurePercent`: Prevents over-concentration in any single protocol (e.g., max 40%).
  - `maxChainExposurePercent`: Limits total capital on one chain.
  - `maxStrategyExposurePercent`: Limits capital in higher-risk strategies (e.g., LP, Arbitrage, or Equities).
  - `maxRwaExposurePercent` & `maxEquitySingleAssetPercent`: Caps total tokenized equity/RWA exposure and single-stock concentration.
  - `maxNavDeviationBps` & `allowOffHoursExecution`: Blocks equity purchases/sales when on-chain DEX/RFQ price drifts too far from TradFi Reference NAV (especially on weekends/after-hours).
  - `maxSlippageBps`: Enforces hard maximum allowable slippage on any leg.
- Sizing with safety margins: Converts weights to atomic cents using deterministic integer math with rounding to the safe side.

#### Verification S3
- Submitting an objective on `/strategy` produces a structured plan.
- Tightening a constraint (e.g., 20% protocol cap) causes the engine to flag a violation and block execution.
- If the AI API is unreachable, the deterministic fallback planner generates a safe, compliant allocation.

---

### Stage S4: Live Mainnet Cross-Chain Execution Rail (1Click Swap & Earn)

**Goal:** Enable users to execute real cross-chain USDC transfers and 1Click Earn vault deposits using self-custodial wallet signatures.

#### 1. The Two-Phase Quote Lifecycle
- **Phase A (Preview - Dry Quote):**
  - Sends `dry: true` to `/v0/quote`.
  - Derives exact fees, expected output, and deadline.
  - Runs policy check: evaluates output vs user slippage and chain limits.
- **Phase B (Commitment - Live Quote):**
  - User reviews preview and clicks **"Approve & Execute"**.
  - Requests committed quote (`dry: false`) specifying user's wallet as `recipient` and `refundTo`.
  - Obtains real `depositAddress` and signed intent deadline (~10 min window).

#### 2. Origin-Chain Transaction Preparation & Wallet Signing
- Generate typed EVM transaction in `src/lib/near/execution.ts`:
  - For native token: direct transfer to `depositAddress`.
  - For ERC-20 (USDC): standard `transfer(depositAddress, amountAtomic)` calldata.
- User signs in their browser wallet via `window.ethereum.request({ method: "eth_sendTransaction", ... })`.
- Record submitted transaction hash in `Transaction` table.

#### 3. Real-Time Settlement & Refund Tracking
- Background status worker polling `GET https://1click.chaindefuser.com/v0/status?depositAddress=...`:
  - `PENDING_DEPOSIT`: Waiting for origin chain block confirmation.
  - `KNOWN_DEPOSIT_TX`: Solvers detected incoming funds.
  - `PROCESSING`: Cross-chain settlement in progress.
  - `SUCCESS`: Settlement complete; destination funds delivered.
  - `REFUNDED`: Route could not settle within slippage/deadline; funds returned to `refundTo`.
  - `FAILED` / `INCOMPLETE_DEPOSIT`: Surfaces failure context immediately.
- Update `Quote`, `Transaction`, and `Position` records; broadcast status changes to the UI.

#### Verification S4
- Executing a 5 USDC transfer from Base to Arbitrum completes through 1Click, verifies solver settlement, and displays the transaction receipt linked to BaseScan and Arbiscan.

---

### Stage S5: Protocol & Tokenized Equity Adapters

**Goal:** Allow users to deploy settled capital directly into destination protocols (Aave V3 lending, DEX liquidity provision, and tokenized equities/RWAs).

#### 1. Aave V3 Supply & Withdraw Adapter
- Build `src/lib/protocols/aave/`:
  - Check ERC-20 allowance for Aave V3 Pool contract (`0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`).
  - Generate `approve(poolAddress, amount)` transaction if allowance < amount.
  - Generate `supply(asset, amount, onBehalfOf, referralCode)` calldata.
  - For withdrawals: generate `withdraw(asset, amount, to)` calldata.
- Multi-step UI workflow: Clearly labels Step 1 (1Click Move) $\rightarrow$ Step 2 (Protocol Deposit). Never claims multi-step atomicity.

#### 2. Stablecoin DEX LP Adapter (Uniswap V3)
- Build `src/lib/protocols/uniswap/`:
  - Position manager contract interactions for minting concentrated liquidity positions (`INonfungiblePositionManager`).
  - Calculate tick ranges for stablecoin pairs (e.g. 0.999 to 1.001) to minimize divergence loss.
  - Return NFT position ID and track accrued swap fees.

#### 3. Tokenized Equities & RWA Adapter (Two-Step Execution)
- Build `src/lib/protocols/equities/`:
  - Integrate destination EVM DEX/RFQ aggregators (e.g. 0x / CoW / Uniswap / issuer endpoints) on Arbitrum One (`Dinari dShares`, `Backed xStocks`) and Ethereum (`Ondo Stocks`), plus direct 1Click routing for supported commodities (`XAUT`).
  - Buy flow: Step 1 (1Click consolidates `USDC` onto destination chain) $\rightarrow$ Step 2 (bounded ERC-20 `approve` + equity swap into verified `(chainId, contractAddress)`).
  - Sell flow: Step 1 (destination equity swap → `USDC`) $\rightarrow$ Step 2 (optional 1Click bridge back to user's preferred chain).
  - Enforce pre-signature NAV spread check (`navDeviationBps <= maxNavDeviationBps`), issuer/jurisdiction disclosure, and explicit non-atomicity warning.

#### Verification S5
- Supplying 10 USDC on Base into Aave V3 deposits funds, issues `aBasUSDC` receipt balance, and updates Capita's `/positions` page with current value and accrued yield.
- Buying and selling a fractional tokenized equity token on Arbitrum verifies dual price provenance (Reference NAV vs execution quote), tracks atomic share balance, and reconciles unrealized/realized P&L.

---

### Stage S6: Production Hardening, Audit Activity & Continuous Monitoring

**Goal:** Ensure enterprise-grade reliability, security boundaries, rate limiting, and real-time portfolio health monitoring.

#### 1. Security & Key Boundaries
- Zero private keys or seeds stored on backend servers (`env.ts` is strictly server-only).
- Cryptographic proof verification on all webhook callbacks or status updates.
- Server-side rate limiting on quote and execution endpoints (`src/lib/http/rate-limit.ts`).
- Idempotency key tracking on all deposit preparations to prevent double-spend or duplicate intents (`src/lib/http/idempotency.ts`).

#### 2. Position Monitoring & Automated Health Alerts
- Scheduled cron worker (or serverless trigger) polling open positions:
  - Re-evaluates underlying asset valuations and APY shifts.
  - Tracks Aave collateral health factor if debt is introduced.
  - Detects stablecoin price deviation (>0.5%) and notifies user to withdraw or rebalance.
- Comprehensive immutable audit log (`AuditEvent` table) capturing every proposal, policy verdict, wallet signature, and settlement event.

#### Verification S6
- Load testing under simulated high network latency and RPC dropouts.
- Full automated test suite passes with 100% coverage on core financial and policy modules.

---

### Stage S7: Cross-Chain Wallet Copytrading (All Setup from NEAR)

**Goal:** Enable users to inspect any cross-chain trader address (or browse verified Top Performers across chains) and mirror non-memecoin spot tokens, yield vaults, Aave lending supplies, and Uniswap V3 LPs from one NEAR setup.

#### 1. Multi-Chain Wallet X-Ray & Leaderboard Indexer
- Integrate **Zerion API**, **DeBank Cloud OpenAPI**, and **Sim by Dune** in `src/lib/copytrading/indexer.ts`:
  - Resolve any user-entered trader address or domain (`.eth`, `.sol`, `.near`, `0x...`) into live token holdings, 1Click Earn vaults, Aave V3 supply/borrow stakes, and Uniswap V3 LP positions (with fee vs IL breakdown).
  - Deterministically filter out MEV bots, exchange hot wallets, wash traders, and memecoin traders; score wallets by realized PnL, win rate, drawdown, hold duration, and asset liquidity.
  - Feed verified metrics to **NEAR AI Cloud** to generate readable trader briefings and warn if uncopyable debt or off-chain/perp hedges may exist.

#### 2. Copy Guardrails (`The Shield`)
- Extend `src/lib/policy/engine.ts` with deterministic copytrading rules:
  - `noMemecoinsOnly: true` & 1Click verified non-memecoin allowlist (`~184` verified assets across `Base`, `Arbitrum`, `Ethereum`, `Solana`, `NEAR`, `OP`, `SUI`, etc.).
  - `maxPriceDriftFromLeaderBps`: Reject swaps if executable quote drifted beyond allowed threshold since the leader's block.
  - `maxUsdPerCopyTrade`, `maxDailyCopyBudgetUsd`, `copyScaleBps`, and `minPoolLiquidityUsd`.

#### 3. Unified NEAR Setup & Execution (`The Hands`)
- **Mode A (Copy-with-Approval):** User keeps USDC in their wallet / NEAR Intents account and approves prepared 1Click or two-step DeFi quotes in one click.
- **Mode B (Automated Rule-Bound Copy):** Configure owner-signed **NEAR Intents Agent API** spending grants (`api.agentsonintents.com`) from NEAR to mirror 1Click spot & Earn vault allocations automatically across chains without splitting gas, plus **NEAR Chain Signatures** derived foreign addresses when mirroring destination Aave V3 supply or Uniswap V3 LP entries.

#### Verification S7
- Entering a trader address displays verified non-meme holdings, DeFi positions, realized stats, and AI risk analysis cleanly with live timestamps.
- Attempting to copy a memecoin or a trade exceeding `maxPriceDriftFromLeaderBps` is deterministically blocked and logged to `AuditEvent`.

---

## 5. Engineer Implementation Checklist

```markdown
- [x] **S0: Setup & Brand**
  - [x] Apply Inter font family and Capita light-mode tokens in `globals.css`
  - [x] Verify EIP-4361 SIWE authentication flow with cookie sessions
  - [x] Update `app-shell.tsx` and UI primitives to Capita branding

- [x] **S1: Live Portfolio**
  - [x] Implement multicall balance reader for Base and Arbitrum One
  - [x] Integrate live spot pricing with depeg safety guards
  - [x] Store real user snapshots in database

- [x] **S2: Live Opportunities**
  - [x] Wire 1Click `/v0/tokens` live vault receipt tokens
  - [x] Implement on-chain Aave V3 pool data provider reader
  - [x] Implement Uniswap V3 stable pool volume & fee APY calculator
  - [x] Build cross-chain arbitrage net-profit calculator

- [x] **S3: Strategy & Policy**
  - [x] Connect NEAR AI Cloud inference endpoint with typed tools
  - [x] Wire deterministic policy engine constraint validation
  - [x] Add fallback deterministic planner for offline resilience

- [x] **S4: 1Click Execution**
  - [x] Build dry quote preflight preview with slippage check
  - [x] Implement committed quote (`dry: false`) with wallet recipient
  - [x] Build ERC-20 transfer calldata generator
  - [x] Wire status polling worker for terminal states (SUCCESS, REFUNDED, FAILED)

- [x] **S5: Protocol & Tokenized Equity Adapters**
  - [x] Build Aave V3 approve & supply flow
  - [x] Build Aave V3 withdraw flow
  - [x] Build Arbitrum/Ethereum equity DEX/RFQ swap adapter (Dinari/Backed/Ondo) with buy & sell paths
  - [x] Enforce off-hours NAV spread checks (`maxNavDeviationBps`) and issuer disclosures
  - [x] Wire multi-step progress UI with explicit leg boundaries

- [x] **S6: Production Hardening**
  - [x] Enforce rate limits and idempotency keys on all money endpoints
  - [x] Configure automated position snapshot sync worker
  - [x] Verify append-only audit trail on `/activity`

- [ ] **S7: Cross-Chain Wallet Copytrading (All Setup from NEAR)**
  - [ ] Integrate Zerion / DeBank / Sim by Dune wallet position & history indexer (`src/lib/copytrading/indexer.ts`)
  - [ ] Build Top Performers leaderboard filtering out memecoins, MEV bots, and wash traders
  - [ ] Add AI Wallet X-Ray explainer via NEAR AI Cloud with spot-only / hidden-hedge warnings
  - [ ] Add deterministic copy guardrails (`noMemecoinsOnly`, `maxPriceDriftFromLeaderBps`, `maxUsdPerCopyTrade`, `maxDailyCopyBudgetUsd`)
  - [ ] Wire NEAR Intents Agent API bounded auto-copy + NEAR Chain Signatures adapter for Aave/Uniswap mirroring
```

---

## 6. Architecture & Data Integrity Invariants

1. **AI proposes; deterministic code decides.** No LLM generates numbers reaching an on-chain transaction.
2. **Amounts are exact.** Atomic string integers (`bigint`) plus `decimals`. Floating-point numbers are strictly reserved for USD valuation displays.
3. **Token identity is `(chainId, contractAddress)`.** Never compare tokens by ticker symbol alone.
4. **No claimed atomicity.** Every cross-chain intent or multi-leg strategy is an explicit sequence of independently confirmed transactions.
5. **Fresh quotes only.** Discovery rates are research indicators. Real transactions require committed quotes unexpired at time of deposit.
6. **No client secrets.** No private keys, seed phrases, or backend API tokens ever touch client code or browser storage.
